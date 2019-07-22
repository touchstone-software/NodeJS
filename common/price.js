'use strict';

const utils = require('./utils');

function processPacket(parts) {
    let parsed = null;
    
    if (parts[0].toString() !== 'tick') {
        return parsed;
    }
    
    const version = parseInt(parts[1], 10);
    
    switch (version) {
        case 1:
            parsed = {
                server: parts[2].toString(),
                account: parseInt(parts[3], 10),
                symbol: parts[4].toString(),
                bid: parseFloat(parts[5]),
                ask: parseFloat(parts[6]),
                dateTick: parseInt(parts[7], 10),
                dateOs: parseInt(parts[8], 10),
                isUsed: 0
            }
            break;
        default:
            console.log('Price version', version, 'not supported');
            break;
    }
    
    if (parsed) {
        parsed.version = version;
    }
    
    return parsed;
}

function addData(price, settings) {
    if (!(price.server in settings.servers)) {
        console.error('Server', price.server, 'not defined');
        return false;
    }
    
    const brokerId = settings.servers[price.server].broker_id;
    
    if (!(brokerId in settings.brokers)) {
        console.error('No broker info for server', price.server, '(', brokerId, ')');
        return false;
    }
    
    // change dateTick to be in GMT
    price.dateTick += settings.brokers[brokerId].gmt_offset;

    if (!(brokerId in settings.brokerInstruments)) {
        console.error('Instruments for server', price.server, '(', brokerId, ') not found');
        return false;
    }
    
    if (!(price.symbol in settings.brokerInstruments[brokerId])) {
        console.error('Instrument', price.symbol, 'for server', price.server, '(' + brokerId + ') not found');
        return false;
    }
    
    const instrumentId = settings.brokerInstruments[brokerId][price.symbol].instrument_id;
    
    // update original object
    price.brokerId = brokerId;
    price.instrumentId = instrumentId;
    
    return true;
}

function parse(parts, settings) {
    let price = processPacket(parts);
    
    if (!price) {
        return price;
    }
    
    if (!addData(price, settings)) {
        return false;
    }
    
    price.dateTick = new Date(price.dateTick);
    price.dateOs = new Date(price.dateOs);
    
    return price;
}

function formatForDb(price) {
    return {
        table: 'prices_all_' +
            price.dateTick.getFullYear() + '_' +
            utils.leadingZero(price.dateTick.getMonth() + 1, 2) + '_' +
            utils.leadingZero(price.dateTick.getDate(), 2) + '_' +
            price.brokerId,
        fields: {
            instrument_id: price.instrumentId,
            bid: price.bid,
            ask: price.ask,
            broker_datetime: price.dateTick
        }
    };
}

function formatForEventDb(price) {
    return {
        broker_id: price.brokerId,
        instrument_id: price.instrumentId,
        bid: price.bid,
        ask: price.ask,
        used: price.isUsed,
        broker_datetime: price.dateTick,
        system_datetime: price.dateOs
    };
}

function getSpread(price) {
    return price.ask - price.bid;
}

function getMaxTime(prices) {
    // event time is the time of the last price tick
    
    return new Date(Math.max(...Object.entries(prices).map(function(priceArr) {
        return priceArr[1].dateTick.getTime();
    })));
}

module.exports = {
    parse,
    formatForDb,
    formatForEventDb,
    getSpread,
    getMaxTime
};
