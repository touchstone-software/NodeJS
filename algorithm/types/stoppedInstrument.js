'use strict';

module.exports = {
    name: 'stoppedInstrument',
    typeId: 8,
    method: 'timerInstrument',
    check: function(brokerId, instrumentId, priceObj, config, settings) {
        const stoppedMaxTime = settings.instruments[instrumentId].stopped_max_time;
        
        if (!stoppedMaxTime) {
            // not tracking instrument stop
            return;
        }
        
        const nowTs = Date.now();
        const tickTs = priceObj.dateTick.getTime();
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
