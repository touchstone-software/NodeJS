'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const algorithm = require('./algorithm/algorithm');
const config = JSON.parse(fs.readFileSync('config.json'));

// Create sockets
const sub_prices = zmq.socket('sub');
const pub_events = zmq.socket('pub');
const sub_control = zmq.socket('sub');

// Prices
const sub_prices_address = 'tcp://' + config.zeromq.output_prices_host + ':' + config.zeromq.output_prices_port;
console.log('Connecting prices SUB socket...');
sub_prices.connect(sub_prices_address);
console.log('Prices SUB socket connected to ' + sub_prices_address);

// Events
const pub_events_address = 'tcp://' + config.zeromq.input_events_host + ':' + config.zeromq.input_events_port;
console.log('Connecting events PUB socket...');
pub_events.connect(pub_events_address);
console.log('Events PUB socket connected to ' + pub_events_address);

// Control
const sub_control_address = 'tcp://' + config.zeromq.output_control_host + ':' + config.zeromq.output_control_port;
console.log('Connecting control SUB socket...');
sub_control.connect(sub_control_address);
console.log('Control SUB socket connected to ' + sub_control_address);

// Processing
sub_prices.on('message', algorithm.onMessage);
sub_control.on('message', algorithm.onCommand);

algorithm.init(pub_events).then(function() {
    algorithm.startSessionsTimer();
    
    sub_prices.subscribe('tick');
    sub_prices.subscribe('sessions-quote');
    sub_prices.subscribe('sessions-trade');
    sub_control.subscribe('');
    console.log('Algorithm processing started');
});
