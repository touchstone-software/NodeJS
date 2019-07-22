'use strict';

const fs = require('fs');
let config = JSON.parse(fs.readFileSync('config.json'));
const database_archive = require('../common/database_archive')(config.databases.archive);
const settings = require('../common/settings')();
const price = require('../common/price');
const control = require('../common/control');
const utils = require('../common/utils');

let priceQueue = [];

function init() {
    return utils.readFile('config.json').then(function(data) {
        config = JSON.parse(data);
        return settings.load();
    });
}

control.registerReloadHandler(init);

function logPricesSave() {
    if (!config.logging.archive.pricesSave) {
        return;
    }
    
    console.log.apply(console, Array.from(arguments));
}

function onPrice() {
    const priceObj = price.parse(Array.from(arguments), settings.get());
    
    if (!priceObj) {
        return;
    }
    
    priceQueue.push(priceObj);
}

function savePrices() {
    if (priceQueue.length === 0) {
        logPricesSave('Price queue empty');
        return startPriceTimer();
    }
    
    const queue = priceQueue;
    priceQueue = [];
    
    logPricesSave('Saving', queue.length, 'prices from queue');
    const startTime = Date.now();
    
    database_archive.savePrices(queue).then(function() {
        logPricesSave('Prices saved successfully in', ((Date.now() - startTime) / 1000).toFixed(3), 's');
        logPricesSave('New prices in queue while saving:', priceQueue.length);
    }).then(startPriceTimer);
}

function startPriceTimer() {
    logPricesSave('Starting price timer');
    setTimeout(savePrices, config.prices.saveInterval);
}

module.exports =  {
    init,
    startPriceTimer,
    onPrice
};

module.exports.onCommand = control.onCommand.bind(control);
