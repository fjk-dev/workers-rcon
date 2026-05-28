import { connect } from 'cloudflare:sockets';

const SERVERDATA_AUTH = 3;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;
const SERVERDATA_AUTH_RESPONSE = 2;

export interface RCONConfig {
  host: string;
  port: number;
  password: string;
}

interface RCONPacket {
  id: number;
  type: number;
  body: string;
}

export class RCON {
  private host: string;
  private port: number;
  private password: string;
  private requestId = 1;
  private readBuffer = new Uint8Array(0);

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
      await this.writePacket(writer, SERVERDATA_AUTH, this.password);
      
      let authRes1 = await this.readPacket(reader);
      let authRes2: RCONPacket | null = null;
      
      if (authRes1.type === SERVERDATA_RESPONSE_VALUE) {
        authRes2 = await this.readPacket(reader);
      }

      const finalAuth = authRes2 || authRes1;
      if (finalAuth.id === -1) {
        throw new Error('RCON Authentication failed: Invalid password');
      }

      await this.writePacket(writer, SERVERDATA_EXECCOMMAND, command);
      const cmdRes = await this.readPacket(reader);
      
      return cmdRes.body;
    } finally {
      writer.releaseLock();
      reader.releaseLock();
      await socket.close();
    }
  }

  private async writePacket(writer: WritableStreamDefaultWriter, type: number, body: string) {
    const encoder = new TextEncoder();
    const bodyBytes = encoder.encode(body);
    const packetLength = 10 + bodyBytes.length;
    
    const buffer = new ArrayBuffer(packetLength + 4);
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

  private async readPacket(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<RCONPacket> {
    const decoder = new TextDecoder();

    while (true) {
      if (this.readBuffer.length >= 4) {
        const view = new DataView(this.readBuffer.buffer, this.readBuffer.byteOffset, this.readBuffer.byteLength);
        const length = view.getInt32(0, true);
        const totalPacketLength = length + 4;

        if (this.readBuffer.length >= totalPacketLength) {
          const id = view.getInt32(4, true);
          const type = view.getInt32(8, true);
          
          const bodyBytes = this.readBuffer.subarray(12, totalPacketLength - 2);
          const body = decoder.decode(bodyBytes);

          this.readBuffer = this.readBuffer.slice(totalPacketLength);

          return { id, type, body };
        }
      }

      const { value, done } = await reader.read();
      if (done) {
        throw new Error('Connection closed by RCON server unexpectedly');
      }

      if (value) {
        const newBuffer = new Uint8Array(this.readBuffer.length + value.length);
        newBuffer.set(this.readBuffer);
        newBuffer.set(value, this.readBuffer.length);
        this.readBuffer = newBuffer;
      }
    }
  }
}