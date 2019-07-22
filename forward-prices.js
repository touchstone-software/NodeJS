'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const config = JSON.parse(fs.readFileSync('config.json'));

const pub_prices = zmq.socket('xpub');
const sub_prices = zmq.socket('xsub');

pub_prices.connect('tcp://' + config.zeromq.output_prices_host + ':' + config.zeromq.input_prices_port);

sub_prices.connect('tcp://192.168.1.21:' + config.zeromq.output_prices_port);

zmq.proxy(pub_prices, sub_prices);

console.log('Forwarding prices...');
