'use strict';

const request = require('request');

module.exports = function(config) {
    function sendMessage(data) {
        data.app_id = config.app_id;
        
        return new Promise(function(resolve, reject) {
            request.post('https://onesignal.com/api/v1/notifications', {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Authorization': 'Basic ' + config.key
                },
                json: data
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    return resolve(body);
                }
                
                if (body && body.hasOwnProperty('errors')) {
                    reject(new Error(body.errors.join(';')));
                }
                else {
                    reject(new Error('HTTP error ' + response.statusCode));
                }
            });
        });
    }

    return {
        sendMessage: sendMessage
    };
};
