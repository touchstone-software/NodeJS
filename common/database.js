'use strict';

const mysql = require('mysql');

module.exports = function(config) {
    let connection;
    
    (function connect() {
        connection = mysql.createConnection(config);
        
        connection.on('connect', function() {
            console.log('MySQL', config.user + '@' + config.host + '/' + config.database, 'connected');
        });
        
        connection.on('error', function(err) {
            console.error('MySQL Error:', err);
            
            if (err.fatal) {
                console.warn('Fatal MySQL error, reconnecting...');
                return connect();
            }
            
            // Other MySQL error, do nothing
        });
    })();
    
    function simplePromiseCommand(cmd) {
        return new Promise(function(resolve, reject) {
            connection[cmd](function(err) {
                if (err) {
                    return reject(err);
                }
                
                resolve();
            });
        });
    }

    function beginTransaction() {
        return simplePromiseCommand('beginTransaction');
    }

    function commit() {
        return simplePromiseCommand('commit');
    }

    function rollback() {
        return simplePromiseCommand('rollback');
    }
    
    function query() {
        let args = Array.from(arguments);
        
        return new Promise(function(resolve, reject) {
            args.push(function(error, results, fields) {
                if (error) {
                    return reject(error);
                }

                resolve(results);
            });

            connection.query.apply(connection, args);
        });
    }
    
    function copyTableStructure(newTable, sourceTable) {
        return query('CREATE TABLE IF NOT EXISTS ?? LIKE ??', [
            newTable,
            sourceTable
        ]);
    }
    
    function bulkInsert(table, data) {
        if (data.length === 0) {
            return Promise.resolve();
        }
        
        const bulkData = generateBulkData(data);
        
        return query('INSERT INTO ?? (??) VALUES ?', [
            table,
            bulkData.keys,
            bulkData.sqlData
        ]);
    }
    
    function generateBulkData(data) {
        const keys = Object.keys(data[0]);
        const sqlData = data.map(function(row) {
            return keys.map(function(key) {
                return row[key];
            });
        });
        
        return {
            keys,
            sqlData
        };
    }
    
    function generateWhere(fields) {
        return {
            toSqlString: function() {
                return connection.format('?', fields).split(', ').map(function(part) {
                    const pair = part.split(' = ');
                    
                    if (pair.length === 2 && pair[1] === 'NULL') {
                        return pair[0] + ' IS NULL';
                    }
                    
                    return part;
                }).join(' AND ');
            }
        };
    }
    
    return {
        beginTransaction,
        commit,
        rollback,
        query,
        copyTableStructure,
        bulkInsert,
        generateBulkData,
        generateWhere
    };
};
