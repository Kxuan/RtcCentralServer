window.SignalingChannel = (function () {
    'use strict';

// This class implements a signaling channel based on WebSocket.
    function SignalingChannel(wssUrl) {
        this.wssUrl_ = wssUrl;
        this.roomId_ = null;
        this.clientId_ = null;
        this.websocket_ = null;
        this.registered_ = false;

        // Public callbacks. Keep it sorted.
        this.onerror = null;
    }
    EventEmitter.bindPrototype(SignalingChannel);
    SignalingChannel.prototype.isRegistered = function () {
        return this.registered_;
    };
    SignalingChannel.prototype.open = function () {
        if (this.websocket_) {
            trace('ERROR: SignalingChannel has already opened.');
            return;
        }
        if (!this.wssUrl_) {
            throw new Error("No wss url was set");
        }
        trace('Opening signaling channel.');
        return new Promise(function (resolve, reject) {
            this.websocket_ = new WebSocket(this.wssUrl_);

            this.websocket_.onopen = function () {
                trace('Signaling channel opened.');

                this.websocket_.onerror = function () {
                    trace('Signaling channel error.');
                };
                this.websocket_.onclose = function (event) {
                    // TODO(tkchin): reconnect to WSS.
                    trace('Channel closed with code:' + event.code +
                        ' reason:' + event.reason);
                    this.websocket_ = null;
                    this.registered_ = false;
                }.bind(this);

                if (this.clientId_ && this.roomId_) {
                    this.register(this.roomId_, this.clientId_);
                }

                resolve();
            }.bind(this);

            this.websocket_.onmessage = function (event) {
                trace('WSS->C: ' + event.data);

                var message = JSON.parse(event.data);
                this.emit('message', message);
            }.bind(this);

            this.websocket_.onerror = function () {
                reject(Error('WebSocket error.'));
            };
        }.bind(this));
    };

    SignalingChannel.prototype.register = function (roomId, clientId) {
        if (this.registered_) {
            trace('ERROR: SignalingChannel has already registered.');
            return;
        }

        this.roomId_ = roomId;
        this.clientId_ = clientId;

        if (!this.roomId_) {
            trace('ERROR: missing roomId.');
        }
        if (!this.clientId_) {
            trace('ERROR: missing clientId.');
        }
        if (!this.websocket_ || this.websocket_.readyState !== WebSocket.OPEN) {
            trace('WebSocket not open yet; saving the IDs to register later.');
            return;
        }
        trace('Registering signaling channel.');
        var registerMessage = {
            cmd:      'register',
            device:   'chrome',
            roomid:   this.roomId_,
            clientid: this.clientId_
        };
        this.websocket_.send(JSON.stringify(registerMessage));
        this.registered_ = true;

        // TODO(tkchin): Better notion of whether registration succeeded. Basically
        // check that we don't get an error message back from the socket.
        trace('Signaling channel registered.');
    };

    SignalingChannel.prototype.close = function () {
        if (this.websocket_) {
            this.websocket_.close();
            this.websocket_ = null;
        }

        if (!this.clientId_ || !this.roomId_) {
            return;
        }

        this.clientId_ = null;
        this.roomId_ = null;
        this.registered_ = false;
    };

    SignalingChannel.prototype.send = function (message) {
        if (!this.roomId_ || !this.clientId_) {
            trace('ERROR: SignalingChannel has not registered.');
            return;
        }
        trace('C->WSS: ' + message);

        if (this.websocket_ && this.websocket_.readyState === WebSocket.OPEN) {
            this.websocket_.send(message);
        } else {
            throw new Error("Websocket is not ready!");
        }
    };

    return SignalingChannel;
})();