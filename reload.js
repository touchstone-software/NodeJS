'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const config = JSON.parse(fs.readFileSync('config.json'));

const pub_control = zmq.socket('pub');
pub_control.monitor(undefined, 0);

const pub_control_address = 'tcp://' + config.zeromq.input_control_host + ':' + config.zeromq.input_control_port;

pub_control.on('connect', function(value, endpoint) {
    console.log('Control PUB socket connected to ' + endpoint);
    console.log('Sending reload command');
    pub_control.send(['reload']);
    console.log('Command sent, waiting 1 s');
    setTimeout(function() {
        console.log('Exiting');
        process.exit();
    }, 1000)
});

console.log('Connecting control PUB socket...');
pub_control.connect(pub_control_address);
