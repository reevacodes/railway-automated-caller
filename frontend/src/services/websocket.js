let socket = null;
const listeners = new Set();
let reconnectTimer = null;

/**
 * Connect to backend WebSocket server and register update listener
 */
export function subscribeToWebSocket(onUpdate) {
  if (onUpdate) {
    listeners.add(onUpdate);
  }

  ensureConnected();

  return () => {
    if (onUpdate) {
      listeners.delete(onUpdate);
    }
  };
}

function ensureConnected() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  // Determine WebSocket URL relative to browser host (works in dev proxy and production host)
  let wsUrl;
  if (import.meta.env.VITE_WS_URL) {
    wsUrl = import.meta.env.VITE_WS_URL;
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // If in Vite dev mode on port 3000, connect to backend port 5000
    const host = window.location.port === '3000' ? `${window.location.hostname}:5000` : window.location.host;
    wsUrl = `${protocol}//${host}/ws`;
  }

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[WebSocket] Connected to real-time server:', wsUrl);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        listeners.forEach(callback => {
          try {
            callback(data);
          } catch (e) {
            console.error('[WebSocket] Callback error:', e);
          }
        });
      } catch (err) {
        // Ignore non-json
      }
    };

    socket.onclose = () => {
      socket = null;
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          ensureConnected();
        }, 3000);
      }
    };

    socket.onerror = (err) => {
      // Quiet failover handle
    };
  } catch (err) {
    console.error('[WebSocket] Link initialization error:', err);
  }
}
