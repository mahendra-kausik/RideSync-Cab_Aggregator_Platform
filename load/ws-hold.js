// node load/ws-hold.js [concurrentConnections] [holdSeconds]
//
// Plain Node script rather than k6: k6's WebSocket module speaks raw
// WebSocket, not Socket.IO's engine.io framing, and reimplementing that
// framing by hand is exactly the kind of protocol work socket.io-client
// (already a project dependency, same major version as the server) already
// solves correctly. Opens N concurrent authenticated Socket.IO connections
// against the real handshake in socketService.js and reports how many
// stayed connected for the hold window.
const { io } = require('socket.io-client');
const { getRiderToken, BASE_URL } = require('./lib/getToken');

const CONCURRENCY = parseInt(process.argv[2] || '200', 10);
const HOLD_SECONDS = parseInt(process.argv[3] || '30', 10);

async function main() {
  const token = await getRiderToken();
  console.log(`Got demo rider token. Opening ${CONCURRENCY} sockets against ${BASE_URL}...`);

  let connected = 0;
  let failed = 0;
  let droppedDuringHold = 0;
  const sockets = [];

  const opens = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true
    });
    sockets.push(socket);

    opens.push(
      new Promise((resolve) => {
        socket.on('connect', () => {
          connected++;
          resolve();
        });
        socket.on('connect_error', (err) => {
          failed++;
          resolve(err);
        });
        socket.on('disconnect', () => {
          if (Date.now() < holdUntil) droppedDuringHold++;
        });
      })
    );
  }

  const holdUntil = Date.now() + HOLD_SECONDS * 1000;
  await Promise.all(opens);
  console.log(`Handshake done: ${connected} connected, ${failed} failed.`);
  console.log(`Holding for ${HOLD_SECONDS}s to measure stability...`);

  await new Promise((resolve) => setTimeout(resolve, HOLD_SECONDS * 1000));

  const stillConnected = sockets.filter((s) => s.connected).length;
  console.log('--- ws-hold results ---');
  console.log(JSON.stringify({
    concurrency: CONCURRENCY,
    holdSeconds: HOLD_SECONDS,
    connected,
    handshakeFailed: failed,
    droppedDuringHold,
    stillConnectedAfterHold: stillConnected
  }, null, 2));

  sockets.forEach((s) => s.close());
  process.exit(0);
}

main().catch((err) => {
  console.error('ws-hold failed:', err);
  process.exit(1);
});
