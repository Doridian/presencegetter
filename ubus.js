'use strict';

const request = require('request-promise');

class Ubus {
    constructor(options) {
        this.sid = undefined;
        this.username = options.username;
        this.password = options.password;
        this.httpOptions = options.http;
    }

    send(method, params) {
        const id = 1;
        const options = Object.assign({}, this.httpOptions, {
            method: 'post',
            body: JSON.stringify({
                id,
                method,
                params,
                jsonrpc: '2.0',
            })
        });
        return request(options)
        .then(res => JSON.parse(res))
        .then(res => {
            if (res.id !== id) {
                throw new Error(`Expected reply with ID ${id} but got ${res.id}`);
            }
            if (res.error) {
                throw new Error(`Got error: ${JSON.stringify(res.error)}`);
            }
            return res;
        });
    }

    sendCall(module, call, args = {}, sid = this.sid) {
        if (!sid) {
            return Promise.reject(new Error('Cannot perform request without session ID'));
        }
        return this.send('call', [sid, module, call, args])
        .then(res => {
            if (!res.result || res.result.length < 1) {
                throw new Error('Got no result');
            }
            if (res.result[0] !== 0) {
                throw new Error(`Unexpected response code ${res.result[0]}, expected 0`);
            }
            return res.result[1];
        });
    }

    getWlanClients(iface) {
        return this.sendCall(`hostapd.${iface}`, 'get_clients');
    }

    logout() {
        this.sid = undefined;
        return Promise.resolve();
    }

    login() {
        if (this.sid) {
            return Promise.resolve();
        }

        return this.sendCall('session', 'login', {
            username: this.username,
            password: this.password
        }, '00000000000000000000000000000000')
        .then(res => {
            if (!res || !res.ubus_rpc_session) {
                throw new Error(`Invalid response: ${JSON.stringify(res)}`);
            }
            this.sid = res.ubus_rpc_session;
        });
    }
}

module.exports = Ubus;