'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const archive = require('./archive/archive');
const config = JSON.parse(fs.readFileSync('config.json'));

// Create sockets
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

// Subscribe
sub_prices.on('message', archive.onPrice);
sub_control.on('message', archive.onCommand);

// Get brokers and instruments
archive.init().then(function() {
    console.log('Loaded price data');
    
    // brokers and instruments loaded
    
    // start timer for flushing to db
    archive.startPriceTimer();
    
    // subscribe for prices and events
    sub_prices.subscribe('tick');
    sub_control.subscribe('');

    console.log('Archive waiting for prices');
});
