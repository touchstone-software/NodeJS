'use strict';

let settings;

module.exports = function(database_main) {
    if (!database_main) {
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('config.json'));
        database_main = require('./database_main')(config.databases.main);
    }
    
    function load() {
        return database_main.getSettings().then(function(results) {
            settings = results;
        });
    }

    function get() {
        return settings;
    }

    return {
        load,
        get
    };
};
