#!/bin/sh

pm2 start http-control.js
pm2 start websocket-prices.js
pm2 start archive.js
pm2 start push.js
pm2 start algorithm.js
pm2 start server.js
