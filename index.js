'use strict';

const config = require('./config');

const request = require('request-promise');
const JSON5 = require('json5');
const fs = require('fs');
const util = require('util');

const Ubus = require('./ubus');

const ubus = new Ubus(config.openwrt);

let sphClients = {};
let owrtClients = {};

const writeFile = util.promisify(fs.writeFile);

function pollSPH() {
    const clients = {};

    function handleClients(res, aptype) {
        if (!res) {
            return;
        }

        res.forEach(client => {
            clients[client.macAddr.toLowerCase()] = client;
            delete client.macAddr;
            client.source = 'speedport_hybrid';
            client.aptype = aptype;
            client.ipAddr = client.ipAddr || 'unknown';
            client.authorized = true;
        });
    }

    return request(config.spauthproxy.http)
    .then(res => JSON5.parse(res))
    .then(res => {
        handleClients(res.WLAN_client, '2.4 GHz');
        handleClients(res.WLAN_client5G, '5 GHz');
    })
    .then(() => sphClients = clients)
    .catch(e => {
        console.error(e.stack || e);
    });
}

function pollOwrt() {
    const clients = {};

    function handleOwrtClients(res) {
        for (const macAddr in res.clients) {
            const client = res.clients[macAddr];

            if (!client.authorized) {
                continue;
            }

            client.source = 'openwrt';
            client.freq = res.freq;
            client.aptype = res.freq < 4000 ? '2.4 GHz' : '5 GHz';
            client.ipAddr = 'unknown';

            clients[macAddr.toLowerCase()] = client;
        }
    }

    return ubus.login()
    .then(() => ubus.getWlanClients('wlan0'))
    .then(handleOwrtClients)
    .then(() => ubus.getWlanClients('wlan1'))
    .then(handleOwrtClients)
    .then(() => owrtClients = clients)
    .catch(e => {
        console.error(e.stack || e);
        return ubus.logout();
    });
}

function runPoll() {
    return pollOwrt()
    .then(() => pollSPH())
    .then(() => {
        const finalFile = Object.assign({}, sphClients, owrtClients);
        return writeFile('clients.json', JSON.stringify(finalFile));
    })
    .catch(e => {
        console.error(e || e.stack);
    })
    .then(() => setTimeout(runPoll, 30000));
}

runPoll();
