'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const https = require('https');
const WebSocket = require('ws');
const settings = require('./common/settings')();
const price = require('./common/price');
const config = JSON.parse(fs.readFileSync('config.json'));
const control = require('./common/control');

// Settings
function reload() {
    return settings.load();
}

control.registerReloadHandler(reload);

// HTTPS / WebSocket
const http_server = new https.createServer({
    cert: fs.readFileSync(config.websocket.sslCert),
    key: fs.readFileSync(config.websocket.sslKey)
});
const ws_server = new WebSocket.Server({
    server: http_server,
    clientTracking: true
});

ws_server.on('listening', function () {
    const address = ws_server.address();
    
    console.log('WebSocket server listening on', address.address + ':' + address.port, '(' + address.family + ')');
});

ws_server.on('connection', function (socket, request) {
    console.log('Client connected', request.connection.remoteAddress);
});

http_server.listen(config.websocket.port);

// ZeroMQ
const sub_prices = zmq.socket('sub');
const sub_control = zmq.socket('sub');

// Prices
const sub_prices_address = 'tcp://' + config.zeromq.output_prices_host + ':' + config.zeromq.output_prices_port;
console.log('Connecting prices SUB socket...');
sub_prices.connect(sub_prices_address);
console.log('Prices SUB socket connected to ' + sub_prices_address);

// Control
const sub_control_address = 'tcp://' + config.zeromq.output_control_host + ':' + config.zeromq.output_control_port;
console.log('Connecting control SUB socket...');
sub_control.connect(sub_control_address);
console.log('Control SUB socket connected to ' + sub_control_address);

// Processing
sub_prices.on('message', function() {
    const priceObj = price.parse(Array.from(arguments), settings.get());
    
    if (!priceObj) {
        return;
    }
    
    priceObj.type = 'tick';
    
    const priceJson = JSON.stringify(priceObj);
    
    ws_server.clients.forEach(function(client) {
        try {
            client.send(priceJson);
        }
        catch (e) {
            console.error(e.message);
        }
    });
});
sub_control.on('message', control.onCommand.bind(control));

reload().then(function() {
    // Subscribe for prices
    sub_prices.subscribe('tick');
    sub_control.subscribe('');
    console.log('WebSocket prices processing started');
});
