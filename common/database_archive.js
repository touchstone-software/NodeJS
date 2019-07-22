'use strict';

const utils = require('./utils');
const price = require('./price');
const database = require('./database');

module.exports = function(config) {
    const connection = database(config);
    
    function savePrices(prices) {
        let tablePrices = {};
        
        prices.forEach(function(priceObj) {
            const dbPrice = price.formatForDb(priceObj);
            
            if (!(dbPrice.table in tablePrices)) {
                tablePrices[dbPrice.table] = [];
            }
            
            tablePrices[dbPrice.table].push(dbPrice.fields);
        });
        
        return utils.asyncForEach(Object.keys(tablePrices), function(table) {
            return connection.copyTableStructure(table, 'prices_all_template').then(function() {
                return connection.bulkInsert(table, tablePrices[table]);
            });
        });
    }
    
    return {
        savePrices
    };
};
