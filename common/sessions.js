'use strict';

function weekdayOffset(weekday, offset) {
    let result = weekday + offset;
    
    while (result < 0) {
        result += 7;
    }
    
    while (result > 6) {
        result -= 7;
    }
    
    return result;
}

function normalizeDate(ts) {
    // MySQL returns NULL for UNIX_TIMESTAMP(x < 0)
    // we don't need the date anyway
    const dt = (ts === undefined ? (new Date) : (new Date(ts)));
    dt.setUTCFullYear(1970);
    dt.setUTCMonth(0);
    dt.setUTCDate(1);
    return dt;
}

function pushHoursV1(hours, weekday, startTs, endTs) {
    if (!(weekday in hours)) {
        hours[weekday] = [];
    }
    
    let start = normalizeDate(startTs);
    let end = normalizeDate(endTs);
    
    hours[weekday].push({
        start,
        end
    });
}

function fillHoursV1(hours, weekday, startTs, endTs) {
    // 1970-01-02 00:00:00.000 (UNIX timestamp: 864000) means the next day
    // the last millisecond of the current day is 23:59:59.999
    if (endTs === 86400000) {
        endTs--;
    }
    
    // both start time and end time are in the previous day
    if (startTs < 0 && endTs < 0) {
        const prevWeekday = weekdayOffset(weekday, -1);
        pushHoursV1(hours, prevWeekday, startTs, endTs);
        return;
    }
    
    // both start time and end time are in the next day
    if (startTs > 86400000 &&  endTs > 86400000) {
        const nextWeekday = weekdayOffset(weekday, 1);
        pushHoursV1(hours, nextWeekday, startTs, endTs);
        return;
    }
    
    // start time is in the previous day
    if (startTs < 0) {
        const prevWeekday = weekdayOffset(weekday, -1);
        pushHoursV1(hours, prevWeekday, startTs, 86400000 - 1);
        pushHoursV1(hours, weekday, 0, endTs);
        return;
    }
    
    // end time is in the next day
    if (endTs > 86400000) {
        const nextWeekday = weekdayOffset(weekday, 1);
        pushHoursV1(hours, weekday, startTs, 86400000 - 1);
        pushHoursV1(hours, nextWeekday, 0, endTs);
        return;
    }
    
    // both start and end time are in the current day
    pushHoursV1(hours, weekday, startTs, endTs);
}

function parseHoursV1(parts, gmt_offset) {
    let hours = {};
    let position = 0;
    
    while (parts[position].toString().length > 0) {
        const weekday = parseInt(parts[position++], 10);
        
        while (parts[position].toString().length > 0) {
            const startTs = parseInt(parts[position++], 10) * 1000 + gmt_offset;
            const endTs = parseInt(parts[position++], 10) * 1000 + gmt_offset;
            
            fillHoursV1(hours, weekday, startTs, endTs);
        }
        
        position++;
    }
    
    return hours;
}

function processPacket(parts) {
    const cmd = parts[0].toString();
    let parsed = null;

    if (['sessions-quote', 'sessions-trade'].indexOf(cmd) === -1) {
        return parsed;
    }
    
    const version = parseInt(parts[1], 10);
    
    switch (version) {
        case 1:
            parsed = {
                server: parts[2].toString(),
                account: parseInt(parts[3], 10),
                symbol: parts[4].toString(),
                type: cmd.substr('sessions-'.length),
                hours: parts.slice(5)
            }
            break;
        default:
            console.log('Sessions version', version, 'not supported');
            break;
    }
    
    if (parsed) {
        parsed.version = version;
    }
    
    return parsed;
}

function addData(sessions, settings) {
    if (!(sessions.server in settings.servers)) {
        console.error('Server', sessions.server, 'not defined');
        return false;
    }
    
    const brokerId = settings.servers[sessions.server].broker_id;
    
    if (!(brokerId in settings.brokers)) {
        console.error('No broker info for server', sessions.server, '(', brokerId, ')');
        return false;
    }
    
    if (!(brokerId in settings.brokerInstruments)) {
        console.error('Instruments for server', sessions.server, '(', brokerId, ') not found');
        return false;
    }
    
    if (!(sessions.symbol in settings.brokerInstruments[brokerId])) {
        console.error('Instrument', sessions.symbol, 'for server', sessions.server, '(' + brokerId + ') not found');
        return false;
    }
    
    const instrumentId = settings.brokerInstruments[brokerId][sessions.symbol].instrument_id;

    // parse hours
    let hours = {};

    switch (sessions.version) {
        case 1:
            hours = parseHoursV1(sessions.hours, settings.brokers[brokerId].gmt_offset);
            break;
        default:
            return false;
    }
    
    // update original object
    sessions.brokerId = brokerId;
    sessions.instrumentId = instrumentId;
    sessions.hours = hours;
    
    return true;
}

function parse(parts, settings) {
    let sessions = processPacket(parts);
    
    if (!sessions) {
        return sessions;
    }
    
    if (!addData(sessions, settings)) {
        return false;
    }
    
    return sessions;
}

function formatForDb(sessions) {
    let rows = [];
    
    Object.entries(sessions.hours).forEach(function(weekdayHoursPair) {
        const weekday = parseInt(weekdayHoursPair[0], 10);
        const weekdayHours = weekdayHoursPair[1];
        
        weekdayHours.forEach(function(hoursItem, index) {
            rows.push({
                broker_id: sessions.brokerId,
                instrument_id: sessions.instrumentId,
                type: sessions.type,
                weekday: weekday,
                index: index,
                start: hoursItem.start,
                end: hoursItem.end
            });
        });
    });
    
    return rows;
}

function isActive(brokerId, instrumentId, sessionInfo) {
    // change if needed
    const type = 'trade';
    
    if (!(instrumentId in sessionInfo)) {
        return false;
    }
    
    if (!(brokerId in sessionInfo[instrumentId])) {
        return false;
    }
    
    if (!(type in sessionInfo[instrumentId][brokerId])) {
        return false;
    }
    
    const now = new Date;
    const weekday = now.getUTCDay();
    
    const normNow = normalizeDate();
    const ts = normNow.getTime();
    
    if (!(weekday in sessionInfo[instrumentId][brokerId][type].hours)) {
        return false;
    }
    
    let found = false;
    
    sessionInfo[instrumentId][brokerId][type].hours[weekday].forEach(function(row) {
        const startTs = row.start.getTime();
        const endTs = row.end.getTime();
        
        if (startTs <= ts && ts <= endTs) {
            found = true;
        }
    });
    
    return found;
}

module.exports = {
    parse,
    formatForDb,
    isActive
};
