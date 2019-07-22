'use strict';

const utils = require('./utils');

let reloadHandlers = [];
let reloadNeeded = false;
let reloadInProgress = false;

function onCommand() {
    const args = Array.from(arguments).map(function(part) {
        return part.toString();
    });
    const cmd = args[0];
    
    switch (cmd) {
        case 'reload':
            console.log('Received reload');
            
            reloadNeeded = true;
            
            if (reloadInProgress) {
                console.log('Requested reload while updating, delaying until current reload completes');
                return;
            }
            
            checkReloadNeeded();
            break;
        default:
            console.log('Unknown command', cmd);
    }
}

function checkReloadNeeded() {
    reloadInProgress = false;
    
    if (reloadNeeded) {
        console.log('Reload needed');
        
        reloadNeeded = false;
        reloadInProgress = true;
        
        utils.asyncForEach(reloadHandlers, function(handler) {
            return handler();
        }).then(function() {
            console.log('Reload completed');
            checkReloadNeeded();
        });
    }
}

function registerReloadHandler(handler) {
    reloadHandlers.push(handler);
}

module.exports = {
    onCommand,
    registerReloadHandler
};
