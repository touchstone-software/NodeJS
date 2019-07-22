'use strict';

module.exports = {
    name: 'stoppedInstrument',
    typeId: 16,
    method: 'timerBroker',
    check: function(brokerId, brokerPrices, config, settings) {
        const stoppedMaxTime = settings.brokers[brokerId].stopped_max_time;
        
        if (!stoppedMaxTime) {
            // not tracking broker stop
            return;
        }
        
        if (Object.keys(brokerPrices).length === 0) {
            // no prices for broker
            return;
        }
        
        const nowTs = Date.now();
        
        // most recent tick
        let tickTs = Math.max.apply(undefined, Object.entries(brokerPrices).map(function(pricePair) {
            return pricePair[1].dateTick.getTime();
        }));
        
        const delta = nowTs - tickTs;
        const active = delta > stoppedMaxTime;
        
        const data = {
            nowTs,
            tickTs,
            delta
        }
        
        return {
            active,
            data
        };
    }
};
