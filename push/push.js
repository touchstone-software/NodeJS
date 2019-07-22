'use strict';

const fs = require('fs');
let config = JSON.parse(fs.readFileSync('config.json'));
const onesignal = require('./onesignal')(config.onesignal);
const event = require('../common/event');
const settings = require('../common/settings')();
const control = require('../common/control');
const utils = require('../common/utils');

function init() {
    return utils.readFile('config.json').then(function(data) {
        config = JSON.parse(data);
        return settings.load();
    });
}

control.registerReloadHandler(init);

function onMessage() {
    const eventObj = event.parse(Array.from(arguments), settings.get());
    
    // only send about starting of event
    if (eventObj.endTime !== null) {
        return;
    }
    
    const pushEvent = event.formatForPush(eventObj, config, settings.get());
    onesignal.sendMessage(pushEvent)
        .then(console.log.bind(console))
        .catch(console.error.bind(console));
}

module.exports = {
    init,
    onMessage
};

module.exports.onCommand = control.onCommand.bind(control);
