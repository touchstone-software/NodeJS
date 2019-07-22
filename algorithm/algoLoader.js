'use strict';

const price = require('../common/price');
const utils = require('../common/utils');

let algorithms = {};
let algoNames = {};
let currentEvents = {};
let currentStoppedInstruments = {};
let currentStoppedBrokers = {};

function init() {
    // TODO - load from folder
    const algos = [
        'frozen',
        'delayed',
        'spread',
        'stoppedInstrument',
        'stoppedBroker',
        'stoppedInstrumentOwn'
    ];
    
    algos.forEach(function(algoName) {
        const algo = require('./types/' + algoName + '.js');

        if (!algo) {
            console.error('Failed loading algo ' + algoName);
            return;
        }
        
        algorithms[algo.typeId] = algo;
        algoNames[algo.name] = algo;
        currentEvents[algo.typeId] = {};
        currentStoppedInstruments[algo.typeId] = {};

        console.log('Loaded algo ' + algoName + ', id = ' + algo.typeId);
    });
    
    return Promise.resolve();
}

function checkTick(algorithm, prices, config, settings) {
    if (!(config.common.ownBrokerId in prices)) {
        // no our price
        return;
    }
    
    const pricesArr = Object.entries(prices).filter(function(brokerPrice) {
        const brokerId = parseInt(brokerPrice[0], 10);
        const isUsed = brokerId === config.common.ownBrokerId || // always include our price
            (settings.brokers[brokerId].running & algorithm.typeId) > 0; // only include brokers who are being tracked for this event type
        
        // copy prices because otherwise isUsed changes the original shared object
        let priceObj = utils.cloneObj(prices[brokerId]);
        priceObj.isUsed = isUsed;
        prices[brokerId] = priceObj;
        
        return isUsed;
    });

    // we need at least one more price, in addition to ours
    if (pricesArr.length <= 1) {
        // not enough prices
        return;
    }
    
    const instrumentId = prices[config.common.ownBrokerId].instrumentId;

    // object.active === true - event is happening
    // obcect.active === false - event is not happening, or was happening and just ended
    // undefined - not enough data to decide if the event is happening
    let eventResult = algorithm.check(instrumentId, pricesArr, config, settings);
    
    if (!eventResult) {
        return;
    }

    eventResult.typeId = algorithm.typeId;
    eventResult.brokerId = config.common.ownBrokerId;
    eventResult.instrumentId = instrumentId;
    eventResult.time = price.getMaxTime(prices);
    eventResult.prices = prices;
    
    if (eventResult.active) {
        if (instrumentId in currentEvents[algorithm.typeId]) {
            // event already started
            return;
        }
        
        // event just started
        eventResult.startTime = eventResult.time;
        eventResult.endTime = null;
        
        currentEvents[algorithm.typeId][instrumentId] = eventResult;
        
        return [
            eventResult
        ];
    }
    
    // inactive
    if (instrumentId in currentEvents[algorithm.typeId]) {
        // event was happening and just ended
        eventResult.startTime = currentEvents[algorithm.typeId][instrumentId].time;
        eventResult.endTime = eventResult.time;

        delete currentEvents[algorithm.typeId][instrumentId];
        
        let events = [
            eventResult
        ];
        
        // special exception for type delayed - it should delete any frozen event
        // for the same instrument when delayed event ends
        const algoFrozenId = algoNames['frozen'].typeId;
        const algoDelayedId = algoNames['delayed'].typeId;
        
        if (
            algorithm.typeId === algoDelayedId &&
            instrumentId in currentEvents[algoFrozenId]
        ) {
            let eventResultExtra = {
                active: false,
                data: {}
            };
            
            eventResultExtra.typeId = algoFrozenId;
            eventResultExtra.brokerId = config.common.ownBrokerId;
            eventResultExtra.instrumentId = instrumentId;
            eventResultExtra.time = eventResult.time;
            eventResultExtra.prices = prices;
            
            eventResultExtra.startTime = currentEvents[algoFrozenId][instrumentId].time;
            eventResultExtra.endTime = eventResultExtra.time;
            
            delete currentEvents[algoFrozenId][instrumentId];
            
            events.push(eventResultExtra);
        }

        return events;
    }
    
    // no event started and no event just happened
}

function checkTimerInstrument(algorithm, allPrices, config, settings) {
    let events = [];
    
    Object.entries(allPrices).forEach(function(pricesPair) {
        const brokerId = parseInt(pricesPair[0], 10);
        const brokerPrices = pricesPair[1];
        
        if ((settings.brokers[brokerId].running & algorithm.typeId) === 0) {
            // not tracking this event
            return;
        }
        
        Object.entries(brokerPrices).forEach(function(brokerPricesPair) {
            const instrumentId = parseInt(brokerPricesPair[0], 10);
            const priceObj = brokerPricesPair[1];
            
            let eventResult = algorithm.check(brokerId, instrumentId, priceObj, config, settings);

            if (!eventResult) {
                return;
            }
            
            eventResult.typeId = algorithm.typeId;
            eventResult.brokerId = brokerId;
            eventResult.instrumentId = instrumentId;
            eventResult.time = priceObj.dateTick;
            eventResult.prices = [
                priceObj
            ];

            if (eventResult.active) {
                if (
                    brokerId in currentStoppedInstruments[algorithm.typeId] &&
                    instrumentId in currentStoppedInstruments[algorithm.typeId][brokerId]
                ) {
                    // event already started
                    return;
                }
                
                // event just started
                eventResult.startTime = eventResult.time;
                eventResult.endTime = null;
                
                if (!(brokerId in currentStoppedInstruments[algorithm.typeId])) {
                    currentStoppedInstruments[algorithm.typeId][brokerId] = {};
                }
                
                currentStoppedInstruments[algorithm.typeId][brokerId][instrumentId] = eventResult;
                
                events.push(eventResult);
                return;
            }

            // inactive
            if (
                brokerId in currentStoppedInstruments[algorithm.typeId] &&
                instrumentId in currentStoppedInstruments[algorithm.typeId][brokerId]
            ) {
                // event was happening and just ended
                eventResult.startTime = currentStoppedInstruments[algorithm.typeId][brokerId][instrumentId].time;
                eventResult.endTime = eventResult.time;

                delete currentStoppedInstruments[algorithm.typeId][brokerId][instrumentId];
                
                if (Object.keys(currentStoppedInstruments[algorithm.typeId][brokerId]).length === 0) {
                    delete currentStoppedInstruments[algorithm.typeId][brokerId];
                }

                events.push(eventResult);
                return;
            }
            
            // no event started and no event just happened
        });
    });

    return events;
}

function checkTimerBroker(algorithm, allPrices, config, settings) {
    let events = [];
    
    Object.entries(allPrices).forEach(function(pricesPair) {
        const brokerId = parseInt(pricesPair[0], 10);
        const brokerPrices = pricesPair[1];
        
        if ((settings.brokers[brokerId].running & algorithm.typeId) === 0) {
            // not tracking this event
            return;
        }
        
        let eventResult = algorithm.check(brokerId, brokerPrices, config, settings);

        if (!eventResult) {
            return;
        }
        
        eventResult.typeId = algorithm.typeId;
        eventResult.brokerId = brokerId;
        eventResult.time = new Date(eventResult.data.tickTs);
        eventResult.prices = brokerPrices;
        
        if (eventResult.active) {
            if (brokerId in currentStoppedBrokers) {
                // event already started
                return;
            }
            
            // event just started
            eventResult.startTime = eventResult.time;
            eventResult.endTime = null;
            
            currentStoppedBrokers[brokerId] = eventResult;
            
            events.push(eventResult);
            return;
        }

        // inactive
        if (brokerId in currentStoppedBrokers) {
            // event was happening and just ended
            eventResult.startTime = currentStoppedBrokers[brokerId].time;
            eventResult.endTime = eventResult.time;

            delete currentStoppedBrokers[brokerId];

            events.push(eventResult);
            return;
        }
        
        // no event started and no event just happened
    });

    return events;
}

function checkFrozen(algorithm, config, settings) {
    // frozen events depend on delayed events
    const algoDelayedId = algoNames['delayed'].typeId;
    const delayedEvents = currentEvents[algoDelayedId];
    
    if (Object.keys(delayedEvents).length === 0) {
        return;
    }

    let events = [];
    
    Object.entries(delayedEvents).forEach(function(eventPair) {
        const instrumentId = parseInt(eventPair[0], 10);
        const eventObj = eventPair[1];
        
        let eventResult = algorithm.check(eventObj, config, settings);
        
        if (!eventResult) {
            return;
        }
        
        eventResult.typeId = algorithm.typeId;
        eventResult.brokerId = config.common.ownBrokerId;
        eventResult.instrumentId = instrumentId;
        eventResult.time = new Date(eventResult.data.nowTs);
        eventResult.prices = eventObj.prices;
        
        if (eventResult.active) {
            if (instrumentId in currentEvents[algorithm.typeId]) {
                // event already started
                return;
            }
            
            // event just started
            eventResult.startTime = eventResult.time;
            eventResult.endTime = null;
            
            currentEvents[algorithm.typeId][instrumentId] = eventResult;
            
            events.push(eventResult);
            return;
        }

        // inactive
        if (instrumentId in currentEvents[algorithm.typeId]) {
            // event was happening and just ended
            eventResult.startTime = currentEvents[algorithm.typeId][instrumentId].time;
            eventResult.endTime = eventResult.time;

            delete currentEvents[algorithm.typeId][instrumentId];

            events.push(eventResult);
            return;
        }
            
        // no event started and no event just happened
    });
    
    return events;
}

function checkAll(method, prices, config, settings) {
    let events = [];
    
    Object.entries(algorithms).forEach(function(algoPair) {
        const algo = algoPair[1];
        
        if (algo.method !== method) {
            return;
        }
        
        let eventResult;

        if (method === 'tick') {
            eventResult = checkTick(algo, prices, config, settings);
        }
        
        if (method === 'timerInstrument') {
            eventResult = checkTimerInstrument(algo, prices, config, settings);
        }
        
        if (method === 'timerBroker') {
            eventResult = checkTimerBroker(algo, prices, config, settings);
        }
        
        if (method === 'frozen') {
            eventResult = checkFrozen(algo, config, settings);
        }

        if (!eventResult) {
            return;
        }
        
        events.push.apply(events, eventResult);
    });
    
    return events;
}

module.exports = {
    init,
    checkAll,
};
