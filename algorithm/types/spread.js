'use strict';

const price = require('../../common/price');
const utils = require('../../common/utils');

module.exports = {
    name: 'spread',
    typeId: 4,
    method: 'tick',
    check: function(instrumentId, pricesArr, config, settings) {
        const spreadMultiplier = settings.instruments[instrumentId].spread_multiplier;
        
        if (!spreadMultiplier) {
            // not tracking spread
            return;
        }
        
        // Calculate spreads for all brokers (associative)
        let spreads = {};
        
        pricesArr.forEach(function(brokerPrice) {
            spreads[brokerPrice[0]] = price.getSpread(brokerPrice[1]);
        });
        
        // Get spreads for other brokers (indexed array)
        let othersSpreads = Object.entries(spreads).filter(function(spread) {
            return parseInt(spread[0], 10) !== config.common.ownBrokerId;
        }).map(function(spread) {
            return spread[1];
        });
        
        // Get out spread, calculate average of other brokers' spreads
        const ourSpread = spreads[config.common.ownBrokerId];
        const othersSpread = utils.avg(othersSpreads);
        
        // Event is only reported for our spread being higher than
        // the average of other brokers, multiplied by a coefficient
        const active = ourSpread > othersSpread * spreadMultiplier;
        
        const data = {
            spreads,
            ourSpread,
            othersSpread
        };
        
        return {
            active,
            data
        };
    }
};
