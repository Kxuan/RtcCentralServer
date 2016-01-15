/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */

/* globals trace, requestTurnServers, sendUrlRequest, sendAsyncUrlRequest,
 requestUserMedia, SignalingChannel, PeerConnectionClient, setupLoopback,
 parseJSON, isChromeApp, apprtc, Constants */

/* exported Call */

'use strict';

var Call = function (loadingParams) {
    this.params_ = loadingParams;
    this.peerConnections = {__proto__: null};
    this.localStream_ = null;

    this.startTime = null;

    // Public callbacks. Keep it sorted.
    this.oncallerstarted = null;
    this.onerror = null;
    this.oniceconnectionstatechange = null;
    this.onlocalstreamadded = null;
    this.onnewicecandidate = null;
    this.onremotehangup = null;
    this.onremoteSdp = null;
    this.onremotestreamadded = null;
    this.onsignalingstatechange = null;
    this.onstatusmessage = null;

    this.getMediaPromise_ = null;
    this.getTurnServersPromise_ = null;
};
EventEmitter.bindPrototype(Call);

Call.prototype.requestMediaAndTurnServers_ = function () {
    this.getMediaPromise_ = this.maybeGetMedia_();
    this.getTurnServersPromise_ = this.maybeGetTurnServers_();
};

Call.prototype.start = function (roomId) {
    this.joinRoom_(roomId).then(function (params) {
        this.params_ = params;
        this.params_.mediaConstraints = JSON.parse(params.media_constraints);
        this.params_.peerConnectionConfig = JSON.parse(params.pc_config);
        this.params_.peerConnectionConstraints = JSON.parse(params.pc_constraints);

        this.channel_ = new SignalingChannel(params.wss_url);
        //this.channel_.onmessage = this.onRecvSignalingChannelMessage_.bind(this);
        this.channel_.on('message', this.onRecvSignalingChannelMessage_.bind(this));

        this.requestMediaAndTurnServers_();
        this.connectToRoom_(roomId);

        showRoomQrcode(document.getElementById('qrcodeRoomCanvas'));
        showHelperQrcode(document.getElementById('qrcodeHelperCanvas'), this.params_.room_id, this.params_.client_id);
    }.bind(this));
};

Call.prototype.restart = function () {
    // Reinitialize the promises so the media gets hooked up as a result
    // of calling maybeGetMedia_.
    this.requestMediaAndTurnServers_();
    this.start(this.params_.previousRoomId);
};

Call.prototype.hangup = function () {
    this.startTime = null;

    if (this.localStream_) {
        var tracks = this.localStream_.getTracks();
        var track;
        while (tracks.length > 0) {
            track = tracks.pop();
            track.stop();
            this.localStream_.removeTrack(track);
        }
        this.localStream_ = null;
        console.trace("hungup localstream is null.");
    }

    if (!this.params_.roomId) {
        return;
    }

    for (var id in this.peerConnections) {
        this.peerConnections[id].close();
    }
    this.peerConnections = {__proto__: null};

    // Close signaling channel.
    this.channel_.close();
    this.params_.previousRoomId = this.params_.roomId;
    this.params_.roomId = null;
    this.params_.clientId = null;
};

Call.prototype.closePeer = function (uid) {
    if (isNaN(parseInt(uid)))
        throw new Error("uid is not a valid number");

    if (!(uid in this.peerConnections)) {
        console.warn("User %d is not establish.");
        return;
    }

    var pc = this.peerConnections[uid];
    if(pc.isHelper) {
        for(var chromePc in this.peerConnections) {
            if(this.peerConnections[chromePc].isHelper === false) {
                this.peerConnections[chromePc].removeStream(this.localStream_);
            }
        }
        this.localStream_ = null;
        this.emit('localstreamremoved', pc);
    }else {
            this.emit('remotehangup', pc);
    }

    pc.close();
    delete this.peerConnections[uid];

};


Call.prototype.getPeerConnectionStates = function () {
    var statesObject = {__proto__: null},
        hasUser      = false;
    for (var uid in this.peerConnections) {
        hasUser = true;
        statesObject[uid] = this.peerConnections[uid].getPeerConnectionStates();
    }

    if (hasUser)
        return statesObject;
    else
        return null;
};

Call.prototype.getPeerConnectionStats = function (callback) {
    if (Object.keys(this.peerConnections).length == 0)
        return null;

    return Promise.all(Object.keys(this.peerConnections).map(function (uid) {
        var pc = this.peerConnections[uid];
        return new Promise(function (resolve, reject) {
            pc.getPeerConnectionStats(function (r) {
                resolve(r.result());
            });
        });
    }.bind(this))).then(callback);
};

Call.prototype.toggleVideoMute = function () {
    var videoTracks = this.localStream_.getVideoTracks();
    if (videoTracks.length === 0) {
        trace('No local video available.');
        return;
    }

    trace('Toggling video mute state.');
    for (var i = 0; i < videoTracks.length; ++i) {
        videoTracks[i].enabled = !videoTracks[i].enabled;
    }

    trace('Video ' + (videoTracks[0].enabled ? 'unmuted.' : 'muted.'));
};

Call.prototype.toggleAudioMute = function () {
    var audioTracks = this.localStream_.getAudioTracks();
    if (audioTracks.length === 0) {
        trace('No local audio available.');
        return;
    }

    trace('Toggling audio mute state.');
    for (var i = 0; i < audioTracks.length; ++i) {
        audioTracks[i].enabled = !audioTracks[i].enabled;
    }

    trace('Audio ' + (audioTracks[0].enabled ? 'unmuted.' : 'muted.'));
};

// Connects client to the room. This happens by simultaneously requesting
// media, requesting turn, and join the room. Once all three of those
// tasks is complete, the signaling process begins. At the same time, a
// WebSocket connection is opened using |wss_url| followed by a subsequent
// registration once GAE registration completes.
Call.prototype.connectToRoom_ = function (roomId) {
    this.params_.roomId = roomId;
    this.params_.clientId = this.params_.client_id;
    this.params_.roomId = this.params_.room_id;
    this.params_.roomLink = this.params_.room_link;


    // We only register with WSS if the web socket connection is open and if we're
    // already registered with GAE.
    this.channel_.open().then(function () {
        this.channel_.register(this.params_.roomId, this.params_.clientId);

        // We only start signaling after we have registered the signaling channel
        // and have media and TURN. Since we send candidates as soon as the peer
        // connection generates them we need to wait for the signaling channel to be
        // ready.
        Promise.all([this.getTurnServersPromise_, this.getMediaPromise_])
            .catch(function (error) {
                this.onError_('Failed to start signaling: ' + error.message);
            }.bind(this))
            .then(function () {
                this.startSignaling_();
            }.bind(this));
    }.bind(this)).catch(function (error) {
        this.onError_('WebSocket register error: ' + error.message);
    }.bind(this));
};

// Asynchronously request user media if needed.
Call.prototype.maybeGetMedia_ = function () {
    // mediaConstraints.audio and mediaConstraints.video could be objects, so
    // check '!=== false' instead of '=== true'.
    var needStream = (this.params_.mediaConstraints.audio !== false ||
    this.params_.mediaConstraints.video !== false);
    var mediaPromise = null;
    if (needStream) {
        var mediaConstraints = this.params_.mediaConstraints;

        mediaPromise = requestUserMedia(mediaConstraints).then(function (stream) {
            trace('Got access to local media with mediaConstraints:\n' +
                '  \'' + JSON.stringify(mediaConstraints) + '\'');

            this.onUserMediaSuccess_(stream);
        }.bind(this)).catch(function (error) {
            //this.onError_('Error getting user media: ' + error.message);
            this.onUserMediaError_(error);
        }.bind(this));
    } else {
        mediaPromise = Promise.resolve();
    }
    return mediaPromise;
};

// Asynchronously request a TURN server if needed.
Call.prototype.maybeGetTurnServers_ = function () {
    var requestUrl = this.params_.turn_url;
    if (!requestUrl)
        return Promise.resolve();

    return requestTurnServers(requestUrl, "udp").then(
        function (turnServers) {
            var iceServers = this.params_.peerConnectionConfig.iceServers;
            this.params_.peerConnectionConfig.iceServers =
                iceServers.concat(turnServers);
        }.bind(this)).catch(function (error) {
        showAlert('无法连接到转发服务器！');
        // Error retrieving TURN servers.
        var subject =
                encodeURIComponent('AppRTC demo TURN server not working');
        this.emit('statusmessage',
            'No TURN server; unlikely that media will traverse networks. ' +
            'If this persists please ' +
            '<a href="mailto:discuss-webrtc@googlegroups.com?' +
            'subject=' + subject + '">' +
            'report it to discuss-webrtc@googlegroups.com</a>.');
        trace(error.message);
    }.bind(this));
};

Call.prototype.onUserMediaSuccess_ = function (stream) {
    this.localStream_ = stream;
    if (stream === null)
        console.trace("onUserMediaSuccess stream is null.");

    this.emit('localstreamadded', stream);
};

Call.prototype.onUserMediaError_ = function (error) {
    showAlert('请使用android手机助手！');
    var errorMessage = 'Please use android helper! ';
};

Call.prototype.getPeerConnection = function (peerId) {
    peerId = parseInt(peerId);
    if (isNaN(peerId))
        throw new Error("uid is not a valid number");
    if (peerId in this.peerConnections) {
        return this.peerConnections[peerId];
    }
    try {
        var pc = this.peerConnections[peerId] =
            new PeerConnectionClient(peerId, this);

        pc.on('remotehangup', this.emit.bind(this, 'remotehangup', pc));
        pc.on("remoteSdp", function () {
            if (!pc.isHelper) {
                this.emit('remoteSdp', pc);
            }
        }.bind(this));
        pc.on('remotestreamadded', this.onRemoteStreamAdded.bind(this,pc));
        pc.on('signalingstatechange', this.emit.bind(this, 'signalingstatechange'));
        pc.on('iceconnectionstatechange', this.emit.bind(this, 'iceconnectionstatechange'));
        pc.on('newicecandidate', this.emit.bind(this, 'newicecandidate'));
        pc.on('error', this.emit.bind(this, 'error'));
        pc.on('close',this.closePeer.bind(this,peerId));
        trace('Created PeerConnectionClient');
        return pc;
    } catch (e) {
        console.error(e);
        this.onError_('Create PeerConnection exception: ' + e.message);
        alert('Cannot create RTCPeerConnection; ' +
            'WebRTC is not supported by this browser.');
        return null;
    }
};

Call.prototype.startSignaling_ = function () {
    trace('Starting signaling.');

    this.emit("callerstarted", this.params_.roomId, this.params_.roomLink);

    this.startTime = window.performance.now();
};

// Join the room and returns room parameters.
Call.prototype.joinRoom_ = function (roomId) {
    if (!roomId)
        throw new Error("Missing room id");

    return new Promise(function (resolve, reject) {
        var path = location.origin + '/join/' +
            roomId + window.location.search;

        sendAsyncUrlRequest('POST', path).then(function (response) {
            var responseObj = parseJSON(response);
            if (!responseObj) {
                reject(Error('Error parsing response JSON.'));
                return;
            }
            resolve(responseObj);
        }.bind(this)).catch(function (error) {
            reject(Error('Failed to join the room: ' + error.message));
            return;
        }.bind(this));
    }.bind(this));

};

Call.prototype.onRecvSignalingChannelMessage_ = function (msg) {
    var pc;

    switch (msg.type) {
        //WebRTC消息交给PeerConnectionClient处理
        case 'answer':
        case 'candidate':
        case 'offer':
            pc = this.getPeerConnection(msg.from);
            pc.receiveSignalingMessage(msg);
            break;

        //其他消息在Call中处理
        case 'join':
            var msgString = msg.id + '(' + msg.device + ')' + '加入房间';
            showAlert(msgString);
            console.trace("%d(%s) join the room", msg.id, msg.device);

            switch (msg.device) {
                case 'chrome':
                    pc = this.getPeerConnection(msg.id);
                    if (this.localStream_ !== null)
                        pc.addStream(this.localStream_);
                    pc.startConnection();
                    break;
                case 'android':
                    //TODO 安卓设备，如何处理？

                    break;
                default:
                    console.error("What's that? Unknown Device Type.");
                    break;
            }
            break;

        //leave消息
        case 'leave':
            showAlert(msg.id + '退出房间');
            pc = this.peerConnections[msg.id];
            if(pc)
                pc.close();

            break;

        default:
            console.info("Message:", msg);
    }
};
Call.prototype.onVideoHelperConnected = function (pc) {

};
Call.prototype.send = function (message) {
    var msgString = JSON.stringify(message);
    this.channel_.send(msgString);
};
Call.prototype.onRemoteStreamAdded = function (pc, stream) {
    if (pc.isHelper) {
        this.localStream_ = stream;
        this.emit('localstreamadded', stream);
        for (var chromepc in this.peerConnections) {
            if (this.peerConnections[chromepc].isHelper === false) {
                this.peerConnections[chromepc].addStream(stream);
            }
        }
    } else {
        this.emit('remotestreamadded', pc, stream);
    }
};
Call.prototype.onError_ = function (message) {
    this.emit('error', message);
};
Call.prototype.hasHelper = function () {
    var pc;
    for (pc in this.peerConnections) {
        if (this.peerConnections[pc].isHelper === true) {
            return true;
        }
    }

    return false;
};
