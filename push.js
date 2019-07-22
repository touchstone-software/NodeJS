'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const push = require('./push/push');
const config = JSON.parse(fs.readFileSync('config.json'));

// Create socket
const sub_events = zmq.socket('sub');
const sub_control = zmq.socket('sub');

// Events
const sub_events_address = 'tcp://' + config.zeromq.output_events_host + ':' + config.zeromq.output_events_port;
console.log('Connecting events SUB socket...');
sub_events.connect(sub_events_address);
console.log('Events PUB socket connected to ' + sub_events_address);

// Control
const sub_control_address = 'tcp://' + config.zeromq.output_control_host + ':' + config.zeromq.output_control_port;
console.log('Connecting control SUB socket...');
sub_control.connect(sub_control_address);
console.log('Control SUB socket connected to ' + sub_control_address);

sub_events.on('message', push.onMessage);
sub_control.on('message', push.onCommand);

push.init().then(function() {
    sub_events.subscribe('event');
    sub_control.subscribe('');
    
    console.log('Push notification sender started');
});
