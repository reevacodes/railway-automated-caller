const WebSocket = require('ws');

let wss = null;

/**
 * Initialize WebSocket Server attached to HTTP server
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log(`[WebSocket] Client connected: ${req.socket.remoteAddress}`);

    // Send connection welcome message
    ws.send(JSON.stringify({ 
      type: 'CONNECTED', 
      message: 'WebSocket real-time channel established',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch (err) {
        // Ignore non-JSON messages
      }
    });

    ws.on('error', (err) => {
      console.error('[WebSocket Error]:', err.message);
    });
  });

  console.log('[WebSocket] Real-time WebSocket server initialized on path /ws');
  return wss;
}

/**
 * Broadcast real-time update event to all connected clients
 */
function broadcastUpdate(type, payload = {}) {
  if (!wss) return;

  const data = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString()
  });

  let count = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
      count++;
    }
  });

  if (count > 0) {
    console.log(`[WebSocket] Broadcasted event '${type}' to ${count} active client(s)`);
  }
}

module.exports = {
  initWebSocket,
  broadcastUpdate
};
