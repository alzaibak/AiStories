// QA-only SMTP sink. The API is started with SMTP_HOST=127.0.0.1 / SMTP_PORT=2525
// so every message is captured on disk instead of reaching a real mailbox.
// Captured messages land in scripts/qa/outbox as .eml files.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const outbox = path.join(__dirname, 'outbox');
fs.mkdirSync(outbox, { recursive: true });
const port = Number(process.env.QA_SMTP_PORT || 2525);

const server = net.createServer((socket) => {
  let buffer = '';
  let inData = false;
  let message = '';
  let recipients = [];

  const write = (line) => socket.write(`${line}\r\n`);
  write('220 qa-smtp ESMTP ready');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let index = buffer.indexOf('\r\n');
    while (index >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);

      if (inData) {
        if (line === '.') {
          inData = false;
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const file = path.join(outbox, `${stamp}-${Math.random().toString(16).slice(2, 8)}.eml`);
          fs.writeFileSync(file, `X-QA-Recipients: ${recipients.join(',')}\r\n${message}`);
          console.log(`[smtp-sink] captured ${path.basename(file)} to ${recipients.join(',')}`);
          message = '';
          recipients = [];
          write('250 2.0.0 Ok: queued');
        } else {
          message += `${line.startsWith('..') ? line.slice(1) : line}\r\n`;
        }
        index = buffer.indexOf('\r\n');
        continue;
      }

      const command = line.toUpperCase();
      if (command.startsWith('EHLO') || command.startsWith('HELO')) {
        write('250-qa-smtp');
        write('250-AUTH PLAIN LOGIN');
        write('250-8BITMIME');
        write('250 SMTPUTF8');
      } else if (command.startsWith('AUTH')) {
        write('235 2.7.0 Authentication successful');
      } else if (command.startsWith('MAIL FROM')) {
        write('250 2.1.0 Ok');
      } else if (command.startsWith('RCPT TO')) {
        recipients.push(line.slice(line.indexOf(':') + 1).replace(/[<>]/g, '').split(':')[0].trim());
        write('250 2.1.5 Ok');
      } else if (command.startsWith('DATA')) {
        inData = true;
        write('354 End data with <CR><LF>.<CR><LF>');
      } else if (command.startsWith('QUIT')) {
        write('221 Bye');
        socket.end();
      } else if (command.startsWith('RSET')) {
        message = '';
        recipients = [];
        write('250 Ok');
      } else {
        write('250 Ok');
      }
      index = buffer.indexOf('\r\n');
    }
  });
  socket.on('error', () => {});
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[smtp-sink] listening on 127.0.0.1:${port}, outbox ${outbox}`);
});
