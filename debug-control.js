'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const config = JSON.parse(fs.readFileSync('config.json'));

const sub_control = zmq.socket('sub');

const sub_control_address = 'tcp://' + config.zeromq.output_control_host + ':' + config.zeromq.output_control_port;
console.log('Connecting control SUB socket...');
sub_control.connect(sub_control_address);
console.log('Control SUB socket connected to ' + sub_control_address);

sub_control.on('message', function() {
    console.log(Array.from(arguments).map(function(part) {
        return part.toString();
    }).join(' '));
});

sub_control.subscribe('');

console.log('Waiting for control messages...');
