import { connect } from 'cloudflare:sockets';

// Типы пакетов RCON
const SERVERDATA_AUTH = 3;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;
const SERVERDATA_AUTH_RESPONSE = 2;

export interface RCONConfig {
  host: string;
  port: number;
  password: string;
}

export class MinecraftRCON {
  private host: string;
  private port: number;
  private password: string;
  private requestId = 1;

  constructor(config: RCONConfig) {
    this.host = config.host;
    this.port = config.port;
    this.password = config.password;
  }

  async run(command: string): Promise<string> {
    const socket = connect({ hostname: this.host, port: this.port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();

    try {
      // 1. Авторизация
      await this.writePacket(writer, SERVERDATA_AUTH, this.password);
      
      // Читаем ответ авторизации
      let authRes = await this.readPacket(reader);
      if (authRes.id === -1) {
        throw new Error('RCON Authentication failed: Invalid password');
      }

      // 2. Выполнение команды
      await this.writePacket(writer, SERVERDATA_EXECCOMMAND, command);
      const cmdRes = await this.readPacket(reader);

      return cmdRes.body;
    } finally {
      await writer.close();
      socket.close();
    }
  }

  private async writePacket(writer: WritableStreamDefaultWriter, type: number, body: string) {
    const encoder = new TextEncoder();
    const bodyBytes = encoder.encode(body);
    // Длина: 4(id) + 4(type) + body + 2(null terminators)
    const packetLength = 10 + bodyBytes.length;
    
    const buffer = new ArrayBuffer(packetLength + 4); // +4 для самого поля длины
    const view = new DataView(buffer);

    view.setInt32(0, packetLength, true); 
    view.setInt32(4, this.requestId, true);
    view.setInt32(8, type, true);
    
    const uint8 = new Uint8Array(buffer);
    uint8.set(bodyBytes, 12);
    uint8[buffer.byteLength - 2] = 0;
    uint8[buffer.byteLength - 1] = 0;

    await writer.write(buffer);
  }

  private async readPacket(reader: ReadableStreamDefaultReader) {
    const { value, done } = await reader.read();
    if (done || !value) throw new Error('Connection closed by server');

    const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
    const length = view.getInt32(0, true);
    const id = view.getInt32(4, true);
    const type = view.getInt32(8, true);
    
    const bodyBytes = value.slice(12, 12 + (length - 10));
    const body = new TextDecoder().decode(bodyBytes);

    return { id, type, body };
  }
}
