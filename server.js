'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const pmx = require('pmx');
const config = JSON.parse(fs.readFileSync('config.json'));

// Metrics
pmx.init();

const probe = pmx.probe();

const counter_prices = probe.counter({
    name: 'Prices processed'
});

const counter_sessions = probe.counter({
    name: 'Session msgs processed'
});

const counter_events = probe.counter({
    name: 'Events processed'
});

const counter_control = probe.counter({
    name: 'Commands processed'
});

const meter_prices = probe.meter({
    name: 'Prices per second',
    samples: 1,
    timeframe: 1
});

const meter_sessions = probe.meter({
    name: 'Session msgs per minute',
    samples: 60,
    timeframe: 60
});

const meter_events = probe.meter({
    name: 'Events per minute',
    samples: 60,
    timeframe: 60
});

// Proxy sockets
let socketPairs = {};

['prices', 'events', 'control'].forEach(function(name) {
    let socketPair = {};
    
    ['pub', 'sub'].forEach(function(type) {
        // Create socket
        const socket = zmq.socket('x' + type);
        const direction = type === 'sub' ? 'input' : 'output';
        const addr = 'tcp://*:' + config.zeromq[direction + '_' + name + '_port'];
        console.log('Binding', name, type, 'socket...');
        socket.bindSync(addr);
        console.log('Socket', name, type, 'listening on', addr);
        
        socketPair[type] = socket;
    });
    
    console.log('Starting', name, 'proxy');
    zmq.proxy(socketPair.pub, socketPair.sub);
    console.log('Proxy', name, 'started');
    
    socketPairs[name] = socketPair;
});

// Metrics
console.log('Setting up metrics...');
socketPairs.prices.sub.on('message', function() {
    const cmd = Array.from(arguments)[0].toString();
    
    if (cmd === 'tick') {
        counter_prices.inc();
        meter_prices.mark();
    }
    
    if (['sessions-quote', 'sessions-trade'].indexOf(cmd) >= 0) {
        counter_sessions.inc();
        meter_sessions.mark();
    }
});

socketPairs.events.sub.on('message', function() {
    counter_events.inc();
    meter_events.mark();
});

socketPairs.control.sub.on('message', function() {
    counter_control.inc();
});
console.log('Metrics set up');
