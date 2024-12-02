const WebSocket = require('ws');

let wss = null;

function initializeWebSocket(server) {
    wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });
}

function broadcastUpdate(data) {
    if (wss) {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }
}

module.exports = {
    initializeWebSocket,
    broadcastUpdate
}; 