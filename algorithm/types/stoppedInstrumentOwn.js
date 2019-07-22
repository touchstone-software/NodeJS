'use strict';

module.exports = {
    name: 'stoppedInstrumentOwn',
    typeId: 32,
    method: 'timerInstrument',
    check: function(brokerId, instrumentId, priceObj, config, settings) {
        if (brokerId !== config.common.ownBrokerId) {
            return;
        }
        
        const stoppedMaxTime = settings.instruments[instrumentId].stopped_max_time_own;
        
        if (!stoppedMaxTime) {
            // not tracking own instrument stop
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
