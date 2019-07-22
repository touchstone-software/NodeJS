'use strict';

const utils = require('../../common/utils');

module.exports = {
    name: 'delayed',
    typeId: 2,
    method: 'tick',
    check: function(instrumentId, pricesArr, config, settings) {
        const delayPercent = settings.instruments[instrumentId].delay_percent;
        
        if (!delayPercent) {
            // not tracking delayed
            return;
        }
        
        let ourPrice = null;
        let otherPrices = [];
        
        for (let i = 0; i < pricesArr.length; i++) {
            if (parseInt(pricesArr[i][0], 10) === config.common.ownBrokerId) {
                ourPrice = pricesArr[i][1];
            }
            else {
                otherPrices.push(pricesArr[i][1]);
            }
        }
        
        if (ourPrice === null) {
            console.log('Unable to find our price');
            return;
        }
        
        if (otherPrices.length === 0) {
            console.log('Unable to find others prices');
            return;
        }
        
        const avgBidOthers = utils.avg(utils.getField(otherPrices, 'bid'));
        const avgAskOthers = utils.avg(utils.getField(otherPrices, 'ask'));
        
        const expr1 = avgBidOthers - (ourPrice.bid * delayPercent) / 100;
        const expr2 = avgAskOthers + (ourPrice.ask * delayPercent) / 100;
        
        const active1 = ourPrice.ask < expr1;
        const active2 = ourPrice.bid > expr2;

        const active = active1 || active2;

        const data = {
            avgBidOthers,
            avgAskOthers,
            expr1,
            expr2,
            active1,
            active2
        };
        
        return {
            active,
            data
        };
    }
};
