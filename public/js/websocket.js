socket.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.type === 'tokensUpdate') {
        updateTokenTable(data.data);
    }
};

function updateTokenTable(tokens) {
    const tableBody = document.querySelector('#tokenTable tbody');
    tableBody.innerHTML = tokens.map(token => 
        createTokenRow(token, devAddresses)
    ).join('');
} 