'use strict';

const querystring = require('querystring');
const utils = require('./utils');

function processPacket(parts) {
    let parsed = null;
    
    if (parts[0].toString() !== 'event') {
        return parsed;
    }
    
    const version = parseInt(parts[1], 10);
    
    switch (version) {
        case 1:
            parsed = {
                dbId: parseInt(parts[2], 10),
                brokerId: parseInt(parts[3], 10),
                instrumentId: parseInt(parts[4], 10),
                typeId: parseInt(parts[5], 10),
                startTime: parseInt(parts[6], 10),
                endTime: parseInt(parts[7], 10),
                prices: JSON.parse(parts[8]),
                data: JSON.parse(parts[9])
            }
            break;
        default:
            console.log('Event version', version, 'not supported');
            break;
    }
    
    if (parsed) {
        parsed.version = version;
    }
    
    return parsed;
}

function addData(event, settings) {
    if (!(event.brokerId in settings.brokers)) {
        console.error('No broker info for brokerId', event.brokerId);
        return false;
    }
    
    event.brokerName = settings.brokers[event.brokerId].name;
    
    if (event.instrumentId) {
        if (!(event.instrumentId in settings.instruments)) {
            console.error('No instuments info for instrumentId', event.instrumentId);
            return false;
        }
        
        event.instrumentName = settings.instruments[event.instrumentId].name;
    }
    
    if (!(event.typeId in settings.eventTypes)) {
        console.error('No event type info for typeId', event.typeId);
        return false;
    }
    
    event.typeName = settings.eventTypes[event.typeId].type_name;
    
    return true;
}

function parse(parts, settings) {
    let event = processPacket(parts);
    
    if (!event) {
        return event;
    }
    
    if (!addData(event, settings)) {
        return false;
    }
    
    event.startTime = new Date(event.startTime);
    
    if (event.endTime === 0) {
        event.endTime = null;
    }
    else {
        event.endTime = new Date(event.endTime);
    }
    
    return event;
}

function format(eventObj) {
    return [
        'event',
        1, // version
        eventObj.dbId,
        eventObj.brokerId,
        eventObj.instrumentId,
        eventObj.typeId,
        eventObj.startTime.getTime(),
        eventObj.endTime ? eventObj.endTime.getTime() : 0,
        JSON.stringify(eventObj.prices),
        JSON.stringify(eventObj.data)
    ];
}

function formatForDb(event) {
    return {
        broker_id: event.brokerId,
        instrument_id: event.instrumentId,
        type_id: event.typeId,
        raise_time: event.startTime,
        release_time: event.endTime
    };
}

function formatForPush(event, config, settings) {
    let message;
    
    if (true) {
        // production
        message = {
            filters: [{
                // users who have logged in at least once
                field: 'tag',
                key: 'username',
                relation: 'exists'
            }, {
                // users that are subscribed for this event type
                field: 'tag',
                key: 'eventType_' + event.typeId,
                relation: 'exists'
            }]
        };
    }
    else {
        // development - no filter
        message = {
            included_segments: [
                'All'
            ]
        };
    }
    
    // instrumentName may be missing
    const instrumentName = (
        'instrumentName' in event ?
            (event.instrumentName + ' ') :
            ''
    );
    
    // only show broker name if not ours
    const brokerName = (
        event.brokerId === config.common.ownBrokerId ?
            '' :
            (event.brokerName + ' ')
    );
    
    const heading = instrumentName + brokerName + utils.formatTime(event.startTime);
    const content = event.typeName;
    
    message.headings = {
        en: heading
    };

    message.contents = {
        en: content
    };

    message.url = config.web.url + '?' + querystring.stringify({
        r: 'event/view',
        id: event.dbId
    });

    // show only one notification of type at a time
    message.web_push_topic = event.typeId;

    return message;    
}

module.exports = {
    format,
    parse,
    formatForDb,
    formatForPush
};
