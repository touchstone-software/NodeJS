'use strict';

const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config.json'));
const database_main = require('../common/database_main')(config.databases.main);
const moment = require('moment');
const settings = require('../common/settings')(database_main);
const price = require('../common/price');
const event = require('../common/event');
const sessions = require('../common/sessions');
const control = require('../common/control');
const utils = require('../common/utils');
const algoLoader = require('./algoLoader');

let eventSocket = null;

// prices[instrumentId][brokerId]
// needed for pricesGroups
let prices = {};

// brokerPrices[brokerId][instrumentId]
// used by stoppedBroker
let brokerPrices = {};

// sessionInfo[instrumentId][brokerId][type]
let sessionInfo = {};

// array of pending session infos
// for writing to db
let pendingSessionInfos = [];

// used by ticks algorithm
let priceGroups = [];

let hasImmediate = false;

function init(pub_events) {
    eventSocket = pub_events;
    
    return reload().then(function() {
        return algoLoader.init();
    }).then(function() {
        // copy sessions from settings
        // to sessionInfo
        loadSessionInfos();
        
        // kick off timers
        executeTimerAlgorithm();
        executeTimerSessions();
        
        // make promise chain happy
        return Promise.resolve();
    });
}

function reload() {
    return settings.load().then(removeInactivePrices);
}

control.registerReloadHandler(reload);

function saveSendEvents(events) {
    if (events.length === 0) {
        return Promise.resolve();
    }
    
    return utils.asyncForEach(events, function(eventData) {
        return database_main.saveEvent(eventData).then(function(insertId) {
            if (insertId) {
                eventData.dbId = insertId;
            }
            
            eventSocket.send(event.format(eventData));
        });
    });
}

function executeTickAlgorithm() {
    hasImmediate = false;
    
    priceGroups.forEach(function(instrumentPrices) {
        saveSendEvents(algoLoader.checkAll('tick', instrumentPrices, config, settings.get()));
    });
    
    priceGroups = [];
}

function executeTimerAlgorithm() {
    const timerAlgoConfig = {
        'frozen': [],
        'timerInstrument': brokerPrices,
        'timerBroker': brokerPrices
    };
    
    let events = [];
    
    Object.entries(timerAlgoConfig).forEach(function(cfgPair) {
        events.push.apply(events, algoLoader.checkAll(cfgPair[0], cfgPair[1], config, settings.get()));
    });
    
    saveSendEvents(events);
    setTimeout(executeTimerAlgorithm, config.algorithm.checkInterval);
}

function iteratePrices(callback) {
    Object.entries(prices).forEach(function(brokerPricePair) {
        const instrumentId = parseInt(brokerPricePair[0], 10);
        const brokerInstrumentPrices = brokerPricePair[1];
        
        Object.entries(brokerInstrumentPrices).forEach(function(pricePair) {
            const brokerId = parseInt(pricePair[0], 10);
            const priceObj = pricePair[1];
            
            callback(instrumentId, brokerId, priceObj);
        });
    });
}

function deletePrice(instrumentId, brokerId) {
    delete prices[instrumentId][brokerId];
    
    if (Object.keys(prices[instrumentId]).length === 0) {
        delete prices[instrumentId];
    }
    
    delete brokerPrices[brokerId][instrumentId];

    if (Object.keys(brokerPrices[brokerId]).length === 0) {
        delete brokerPrices[brokerId];
    }
}

function executeTimerSessions() {
    iteratePrices(function(instrumentId, brokerId, priceObj) {
        if (sessions.isActive(brokerId, instrumentId, sessionInfo)) {
            return;
        }
        
        // session has closed - remove leftover values
        deletePrice(instrumentId, brokerId);
    });
    
    setTimeout(executeTimerSessions, config.sessions.checkInterval);
}

function removeInactivePrices() {
    const sett = settings.get();
    
    iteratePrices(function(instrumentId, brokerId, priceObj) {
        if (
            brokerId in sett.brokerInstruments &&
            priceObj.symbol in sett.brokerInstruments[brokerId]
        ) {
            return;
        }
        
        // price is no longer tracked - remove leftover values
        deletePrice(instrumentId, brokerId);
    });
}

function onPrice(args) {
    const priceObj = price.parse(args, settings.get());

    if (!priceObj) {
        return;
    }

    if (!sessions.isActive(priceObj.brokerId, priceObj.instrumentId, sessionInfo)) {
        return;
    }

    if (!(priceObj.instrumentId in prices)) {
        prices[priceObj.instrumentId] = {};
    }

    if (!(priceObj.brokerId in brokerPrices)) {
        brokerPrices[priceObj.brokerId] = {};
    }
    
    // save last tick, for use below
    prices[priceObj.instrumentId][priceObj.brokerId] = priceObj;
    brokerPrices[priceObj.brokerId][priceObj.instrumentId] = priceObj;

    // add a snapshot of the prices of all brokers
    // for the current instrument
    priceGroups.push(prices[priceObj.instrumentId]);

    if (!hasImmediate) {
        hasImmediate = true;
        setImmediate(executeTickAlgorithm);
    }
}

function loadSessionsObj(sessionsObj) {
    if (!(sessionsObj.instrumentId in sessionInfo)) {
        sessionInfo[sessionsObj.instrumentId] = {};
    }
    
    if (!(sessionsObj.brokerId in sessionInfo[sessionsObj.instrumentId])) {
        sessionInfo[sessionsObj.instrumentId][sessionsObj.brokerId] = {};
    }
    
    sessionInfo[sessionsObj.instrumentId][sessionsObj.brokerId][sessionsObj.type] = sessionsObj;
}

function onSessionInfo(args) {
    const sessionsObj = sessions.parse(args, settings.get());
    
    if (!sessionsObj) {
        return;
    }
    
    loadSessionsObj(sessionsObj);
    
    // add to pending list for saving in db
    pendingSessionInfos.push(sessionsObj);
}

function onMessage() {
    const args = Array.from(arguments);
    const cmd = args[0].toString();
    
    if (cmd === 'tick') {
        return onPrice(args);
    }
    
    if (['sessions-quote', 'sessions-trade'].indexOf(cmd) > -1) {
        return onSessionInfo(args);
    }
}

function logSessionsSave() {
    if (!config.logging.algorithm.sessionsSave) {
        return;
    }
    
    console.log.apply(console, Array.from(arguments));
}

function loadSessionInfos() {
    sessionInfo = settings.get().sessions;
}

function saveSessionInfos() {
    if (pendingSessionInfos.length === 0) {
        logSessionsSave('Session infos queue empty');
        return startSessionsTimer();
    }
    
    const queue = pendingSessionInfos;
    pendingSessionInfos = [];
    
    logSessionsSave('Saving', queue.length, 'session infos from queue');
    const startTime = Date.now();
    
    database_main.saveSessions(queue).then(function() {
        logSessionsSave('Session infos saved successfully in', ((Date.now() - startTime) / 1000).toFixed(3), 's');
        logSessionsSave('New session infos in queue while saving:', pendingSessionInfos.length);
    }).then(startSessionsTimer);
}

function startSessionsTimer() {
    logSessionsSave('Starting session info timer');
    setTimeout(saveSessionInfos, config.sessions.saveInterval);
}

module.exports = {
    init,
    onMessage,
    startSessionsTimer
};

module.exports.onCommand = control.onCommand.bind(control);
