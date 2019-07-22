'use strict';

const price = require('./price');
const event = require('./event');
const sessions = require('./sessions');
const database = require('./database');
const utils = require('./utils');

module.exports = function(config) {
    const connection = database(config);

    function getBrokers() {
        return connection.query('SELECT id, name, gmt_offset, running, stopped_max_time FROM brokers');
    }
    
    function getBrokerServers() {
        return connection.query('SELECT broker_id, server_name FROM broker_servers');
    }
    
    function getBrokerInstruments() {
        return connection.query('SELECT broker_id, instrument_id, instrument_name, coeff FROM broker_instruments');
    }
    
    function getEventTypes() {
        return connection.query('SELECT id, type_name FROM event_types');
    }
    
    function getInstruments() {
        return connection.query('SELECT id, name, delay_percent, frozen_time, spread_multiplier, stopped_max_time, stopped_max_time_own FROM instruments');
    }
    
    function getSessions() {
        return connection.query('SELECT broker_id, instrument_id, type, weekday, `index`, start, end FROM sessions');
    }
    
    function getSettings() {
        let brokers = {};
        let servers = {};
        let brokerInstruments = {};
        let eventTypes = {};
        let instruments = {};
        let sessions = {};
        
        return getBrokers().then(function(results) {
            results.forEach(function(row) {
                brokers[row.id] = row;
            });
            
            return getBrokerServers();
        }).then(function(results) {
            results.forEach(function(row) {
                servers[row.server_name] = row;
            });
            
            return getBrokerInstruments();
        }).then(function(results) {
            results.forEach(function(row) {
                if (!(row.broker_id in brokerInstruments)) {
                    brokerInstruments[row.broker_id] = {};
                }
                
                brokerInstruments[row.broker_id][row.instrument_name] = row;
            });
            
            return getEventTypes();
        }).then(function(results) {
            results.forEach(function(row) {
                eventTypes[row.id] = row;
            });
            
            return getInstruments();
        }).then(function(results) {
            results.forEach(function(row) {
                instruments[row.id] = row;
            });
            
            return getSessions();
        }).then(function(results) {
            results.forEach(function(row) {
                if (!(row.instrument_id in sessions)) {
                    sessions[row.instrument_id] = {};
                }
                
                if (!(row.broker_id in sessions[row.instrument_id])) {
                    sessions[row.instrument_id][row.broker_id] = {};
                }
                
                if (!(row.type in sessions[row.instrument_id][row.broker_id])) {
                    sessions[row.instrument_id][row.broker_id][row.type] = {
                        type: row.type,
                        brokerId: row.broker_id,
                        instrumentId: row.instrument_id,
                        hours: {}
                    };
                }
                
                if (!(row.weekday in sessions[row.instrument_id][row.broker_id][row.type].hours)) {
                    sessions[row.instrument_id][row.broker_id][row.type].hours[row.weekday] = [];
                }
                
                sessions[row.instrument_id][row.broker_id][row.type].hours[row.weekday][row.index] = {
                    start: row.start,
                    end: row.end
                };
            });
            
            return {
                brokers,
                servers,
                brokerInstruments,
                eventTypes,
                instruments,
                sessions
            };
        });
    }
    
    function saveEvent(eventObj) {
        const dbEvent = event.formatForDb(eventObj);

        if (dbEvent.release_time === null) {
            // insert
            return connection.query('INSERT INTO ?? SET ?', [
                'events',
                dbEvent
            ]).then(function(results) {
                const eventId = results.insertId;

                return connection.bulkInsert('event_prices', Object.entries(eventObj.prices).map(function(entry) {
                    let dbPrice = price.formatForEventDb(entry[1]);
                    dbPrice.event_id = eventId;
                    return dbPrice;
                })).then(function() {
                    return eventId;
                });
            });
        }
        else {
            // update
            return connection.query('UPDATE ?? SET ? WHERE ? AND LAST_INSERT_ID(id)', [
                'events',
                {
                    release_time: dbEvent.release_time
                },
                connection.generateWhere({
                    broker_id: dbEvent.broker_id,
                    instrument_id: dbEvent.instrument_id,
                    type_id: dbEvent.type_id,
                    raise_time: dbEvent.raise_time
                })
            ]).then(function(results) {
                return results.insertId;
            });
        }
    }
    
    function saveSessions(arrSessionsObj) {
        let dbSessions = [];
        
        arrSessionsObj.forEach(function(sessionsObj) {
            const dbSession = sessions.formatForDb(sessionsObj);
            
            if (dbSession.length === 0) {
                return;
            }
            
            dbSessions.push.apply(dbSessions, dbSession);
        });
        
        if (dbSessions.length === 0) {
            return Promise.resolve();
        }
        
        return saveSessionsData(dbSessions);
    }
    
    function saveSessionsData(dbSessions) {
        if (dbSessions.length === 0) {
            return Promise.resolve();
        }
        
        const bulkData = connection.generateBulkData(dbSessions);
        
        return connection.query('INSERT INTO ?? (??) VALUES ? ON DUPLICATE KEY UPDATE `start` = VALUES(`start`), `end` = VALUES(`end`)', [
            'sessions',
            bulkData.keys,
            bulkData.sqlData
        ]);
    }
    
    return {
        getSettings,
        saveEvent,
        saveSessions
    };
};
