'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const config = JSON.parse(fs.readFileSync('config.json'));

const pub_events = zmq.socket('pub');
pub_events.monitor(undefined, 0);

const pub_events_address = 'tcp://' + config.zeromq.input_events_host + ':' + config.zeromq.input_events_port;

pub_events.on('connect', function(value, endpoint) {
    console.log('Events PUB socket connected to ' + endpoint);
    console.log('Sending event');
    pub_events.send(['event', 1, 6969, 1, 18, 32, Date.now(), 0, '[]', '{}']);
    console.log('Event sent, waiting 1 s');
    setTimeout(function() {
        console.log('Exiting');
        process.exit();
    }, 1000)
});

console.log('Connecting events PUB socket...');
pub_events.connect(pub_events_address);
