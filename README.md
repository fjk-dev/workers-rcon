# workers-rcon

Легкая библиотека для работы с Minecraft RCON в среде **Cloudflare Workers**. 
Использует нативный API `cloudflare:sockets` (TCP), не требует тяжелых полифиллов Node.js.

## Установка

```bash
npm install workers-rcon
```

## Использование в Cloudflare Workers

```javascript
import { MinecraftRCON } from 'workers-rcon';

export default {
  async fetch(request, env) {
    const rcon = new MinecraftRCON({
      host: 'your-server-ip.com',
      port: 25575,
      password: 'your_rcon_password'
    });

    try {
      // Выполнение команды
      const response = await rcon.run('say Привет из Cloudflare Workers!');
      return new Response(`Ответ сервера: ${response}`);
    } catch (err) {
      return new Response(`Ошибка: ${err.message}`, { status: 500 });
    }
  }
};
```

## Особенности
- **Zero dependencies**: только чистый TypeScript.
- **Auto-connect**: библиотека сама управляет открытием и закрытием сокета.
- **Little-Endian**: корректная обработка бинарного протокола RCON.

## Важно
Для работы TCP в Workers не забудьте добавить флаг в ваш `wrangler.toml`:
```toml
compatibility_flags = [ "tcp_sockets" ]
```
