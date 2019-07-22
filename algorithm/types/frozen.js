'use strict';

module.exports = {
    name: 'frozen',
    typeId: 1,
    method: 'frozen',
    check: function(eventObj, config, settings) {
        const frozenMaxTime = settings.instruments[eventObj.instrumentId].frozen_time;
        
        if (!frozenMaxTime) {
            // not tracking frozen price
            return;
        }
        
        const nowTs = Date.now();
        const startTs = eventObj.startTime.getTime();
        const delta = nowTs - startTs;
        const active = delta > frozenMaxTime;
        
        const data = {
            nowTs,
            startTs,
            delta
        }
        
        return {
            active,
            data
        };
    }
};
