'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const https = require('https');
const url = require('url');
const config = JSON.parse(fs.readFileSync('config.json'));

// ZeroMQ
const pub_control = zmq.socket('pub');

console.log('Connecting control PUB socket...');

const pub_control_address = 'tcp://' + config.zeromq.input_control_host + ':' + config.zeromq.input_control_port;
pub_control.connect(pub_control_address);

// HTTPS
https.createServer({
    cert: fs.readFileSync(config.websocket.sslCert),
    key: fs.readFileSync(config.websocket.sslKey)
}, function(request, response) {
    const parsedUrl = url.parse(request.url, true);
    
    switch (parsedUrl.pathname) {
        case '/command':
            switch (parsedUrl.query.cmd) {
                case 'reload':
                    pub_control.send(['reload']);
                    response.writeHead(200);
                    response.end('Reload command sent\n');
                    break;
                default:
                    response.writeHead(400);
                    response.end('Unknown command: ' + parsedUrl.query.cmd + '\n');
                    break;
            }
            break;
        default:
            response.writeHead(400);
            response.end('Unknown request: ' + parsedUrl.pathname + '\n');
            break;
    }
}).listen(config.httpControl.port);
