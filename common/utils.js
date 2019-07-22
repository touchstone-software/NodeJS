'use strict';

const fs = require('fs');

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

function leadingZero(num, digits) {
    const strLen = String(Math.floor(num)).length;
    const zeroesLen = digits - strLen;
    return Array(zeroesLen > 0 ? zeroesLen + 1 : 0).join('0') + String(num);
}

function formatTime(dateObj) {
    return leadingZero(dateObj.getHours(), 2) + ':' +
        leadingZero(dateObj.getMinutes(), 2) + ':' +
        leadingZero(dateObj.getSeconds(), 2);
}

function readFile(path) {
    return new Promise(function(resolve, reject) {
        fs.readFile(path, function(err, data) {
            if (err) {
                return reject(err);
            }
            
            resolve(data);
        });
    });
}

function sum(arr) {
    return arr.reduce(function(p, c) {
        return p + c;
    }, 0);
}

function avg(arr) {
    return sum(arr) / arr.length;
}

function getField(arr, field) {
    return arr.map(function(val) {
        return val[field];
    });
}

function cloneObj(obj) {
    return Object.assign({}, obj);
}

module.exports = {
    asyncForEach,
    leadingZero,
    formatTime,
    readFile,
    sum,
    avg,
    getField,
    cloneObj
};
