'use strict';

const fs = require('fs');
const zmq = require('zeromq');
const config = JSON.parse(fs.readFileSync('config.json'));

const sub_events = zmq.socket('sub');

sub_events.on('message', function(message) {
    console.log(Array.from(arguments).map(function(part) {
        return part.toString();
    }).join(' '));
});

sub_events.connect('tcp://' + config.zeromq.output_events_host + ':' + config.zeromq.output_events_port);
sub_events.subscribe('');

console.log('Waiting for events...');
