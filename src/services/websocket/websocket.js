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
        const tokensWithMetadata = data.data.map(token => ({
            ...token,
            signer: token.signer,
            metadata: {
                ...token.metadata,
                twitter: token.metadata?.twitter || null,
                telegram: token.metadata?.telegram || null,
                website: token.metadata?.website || null,
                discord: token.metadata?.discord || null,
                medium: token.metadata?.medium || null,
                github: token.metadata?.github || null
            }
        }));

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    ...data,
                    data: tokensWithMetadata
                }));
            }
        });
    }
}

module.exports = {
    initializeWebSocket,
    broadcastUpdate
}; 