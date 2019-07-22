'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const config = JSON.parse(fs.readFileSync('config.json'));

const sub_prices = zmq.socket('sub');

sub_prices.on('message', function() {
    console.log(Array.from(arguments).map(function(part) {
        return part.toString();
    }).join(' '));
});

sub_prices.connect('tcp://' + config.zeromq.output_prices_host + ':' + config.zeromq.output_prices_port);
sub_prices.subscribe('sessions-');

console.log('Waiting for sessions info...');
