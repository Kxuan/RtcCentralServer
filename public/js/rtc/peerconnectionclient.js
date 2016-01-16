/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */

/* globals trace, mergeConstraints, parseJSON, iceCandidateType,
 maybePreferAudioReceiveCodec, maybePreferVideoReceiveCodec,
 maybePreferAudioSendCodec, maybePreferVideoSendCodec,
 maybeSetAudioSendBitRate, maybeSetVideoSendBitRate,
 maybeSetAudioReceiveBitRate, maybeSetVideoSendInitialBitRate,
 maybeSetVideoReceiveBitRate, maybeSetVideoSendInitialBitRate,
 maybeSetOpusOptions */

/* exported PeerConnectionClient */

'use strict';

var PeerConnectionClient = function (peerId, call) {
    var params = call.params_;
    this.call = call;
    this.peerId = peerId;
    this.params_ = params;
    this.startTime_ = call.startTime;
    /** @type PeerController */
    this.ui = null;

    trace('Creating RTCPeerConnnection with:\n' +
        '  config: \'' + JSON.stringify(params.peerConnectionConfig) + '\';\n' +
        '  constraints: \'' + JSON.stringify(params.peerConnectionConstraints) +
        '\'.');

    // Create an RTCPeerConnection via the polyfill (adapter.js).
    this.pc_ = new RTCPeerConnection(
        params.peerConnectionConfig, params.peerConnectionConstraints);
    this.pc_.onicecandidate = this.onIceCandidate_.bind(this);
    this.pc_.onaddstream = this.onRemoteStreamAdded_.bind(this);
    this.pc_.onremovestream = this.onRemoteStreamRemoved.bind(this);
    this.pc_.onsignalingstatechange = this.onSignalingStateChanged_.bind(this);
    this.pc_.oniceconnectionstatechange = this.onIceConnectionStateChanged_.bind(this);

    this.hasRemoteSdp_ = false;
    this.hasLocalSdp_ = false;
    this.started_ = false;
    this.isHelper = false;

    // TODO(jiayl): Replace callbacks with events.
    // Public callbacks. Keep it sorted.
    this.onerror = null;
    this.onremoteSdp = null;
    this.oniceconnectionstatechange = null;
    this.onnewicecandidate = null;
    this.onremotehangup = null;
    this.onremotestreamadded = null;
    this.onsignalingstatechange = null;
};

EventEmitter.bindPrototype(PeerConnectionClient);

// Set up audio and video regardless of what devices are present.
// Disable comfort noise for maximum audio quality.
PeerConnectionClient.DEFAULT_SDP_CONSTRAINTS_ = {
    'mandatory': {
        'OfferToReceiveAudio': true,
        'OfferToReceiveVideo': true
    },
    'optional':  [{
        'VoiceActivityDetection': false
    }]
};

PeerConnectionClient.prototype.createOffer_ = function () {
    var constraints = PeerConnectionClient.DEFAULT_SDP_CONSTRAINTS_;
    this.pc_.createOffer(
        function (sdp) {
            sdp = this.adjustLocalSdpAndNotify(sdp);
            this.hasLocalSdp_ = true;
            this.call.send({
                cmd:      "offer",
                to:       this.peerId,
                isHelper: false,
                content:  sdp
            });
        }.bind(this),
        this.onError_.bind(this, 'createOffer'),
        constraints
    );
};

PeerConnectionClient.prototype.addStream = function (stream) {
    if (!this.pc_) {
        return;
    }
    this.pc_.addStream(stream);

    if (this.hasLocalSdp_) {
        this.createOffer_();
    }
};

PeerConnectionClient.prototype.removeStream = function (stream) {

    if (!this.pc_) {
        return;
    }
    this.pc_.removeStream(stream);

    this.createOffer_();
};

PeerConnectionClient.prototype.startConnection = function () {
    if (!this.pc_) {
        return false;
    }

    if (this.started_) {
        return false;
    }

    this.started_ = true;
    this.createOffer_();

    return true;
};


PeerConnectionClient.prototype.close = function () {
    if (!this.pc_) {
        return;
    }
    this.pc_.close();
    this.pc_ = null;
    this.emit('close');
};

PeerConnectionClient.prototype.getPeerConnectionStates = function () {
    if (!this.pc_) {
        return null;
    }
    return {
        'signalingState':     this.pc_.signalingState,
        'iceGatheringState':  this.pc_.iceGatheringState,
        'iceConnectionState': this.pc_.iceConnectionState
    };
};

PeerConnectionClient.prototype.getPeerConnectionStats = function (callback) {
    if (!this.pc_) {
        return;
    }
    this.pc_.getStats(callback);
};

PeerConnectionClient.prototype.doAnswer_ = function () {
    trace('Sending answer to peer.');
    this.pc_.createAnswer(
        function (sdp) {
            sdp = this.adjustLocalSdpAndNotify(sdp);
            this.hasLocalSdp_ = true;
            this.call.send({
                cmd:     "answer",
                accept:  true,
                to:      this.peerId,
                content: sdp
            });
        }.bind(this),
        this.onError_.bind(this, 'createAnswer'),
        PeerConnectionClient.DEFAULT_SDP_CONSTRAINTS_
    );
};

PeerConnectionClient.prototype.adjustLocalSdpAndNotify =
    function (sessionDescription) {
        sessionDescription.sdp = maybePreferAudioReceiveCodec(
            sessionDescription.sdp,
            this.params_);
        sessionDescription.sdp = maybePreferVideoReceiveCodec(
            sessionDescription.sdp,
            this.params_);
        sessionDescription.sdp = maybeSetAudioReceiveBitRate(
            sessionDescription.sdp,
            this.params_);
        sessionDescription.sdp = maybeSetVideoReceiveBitRate(
            sessionDescription.sdp,
            this.params_);
        this.pc_.setLocalDescription(sessionDescription,
            trace.bind(null, 'Set session description success.'),
            this.onError_.bind(this, 'setLocalDescription'));
        return sessionDescription;
    };

PeerConnectionClient.prototype.setRemoteSdp_ = function (message) {
    this.hasRemoteSdp_ = true;
    message.sdp = maybeSetOpusOptions(message.sdp, this.params_);
    message.sdp = maybePreferAudioSendCodec(message.sdp, this.params_);
    message.sdp = maybePreferVideoSendCodec(message.sdp, this.params_);
    message.sdp = maybeSetAudioSendBitRate(message.sdp, this.params_);
    message.sdp = maybeSetVideoSendBitRate(message.sdp, this.params_);
    message.sdp = maybeSetVideoSendInitialBitRate(message.sdp, this.params_);
    this.pc_.setRemoteDescription(new RTCSessionDescription(message),
        this.onSetRemoteDescriptionSuccess_.bind(this),
        this.onError_.bind(this, 'setRemoteDescription'));
};

PeerConnectionClient.prototype.onSetRemoteDescriptionSuccess_ = function () {
    trace('Set remote session description success.');
    this.emit("remoteSdp");
};

PeerConnectionClient.prototype.receiveSignalingMessage = function (message) {
    switch (message.type) {
        case 'offer':
            if (this.pc_.signalingState !== 'stable') {
                trace('ERROR: remote offer received in unexpected state: ' +
                    this.pc_.signalingState);
                return;
            }

            //如果已经有对端的Sdp，则更新远端sdp，然后做应答
            if (this.hasRemoteSdp_) {
                this.setRemoteSdp_(message.content);
                this.doAnswer_();
            } else {
                //如果offer请求为手机助手请求，则检查是否以存在手机助手
                if (message.isHelper) {
                    var hasHelper = this.call.hasHelper();
                    if (!hasHelper) {
                        //如果当前没有手机助手，则尝试建立不发送本地音视频的RTC连接
                        console.trace("Android Helper Connected");
                        this.isHelper = true;
                        this.setRemoteSdp_(message.content);
                        this.doAnswer_();
                    } else {
                        //如果当前已有手机助手，则拒绝
                        this.call.send({
                            cmd:    "answer",
                            accept: false,
                            to:     this.peerId
                        });
                        this.close();
                    }
                } else {
                    //如果请求为非助手请求，则建立正常的对端连接
                    this.isHelper = false;
                    if (this.call.localStream_ !== null)
                        this.addStream(this.call.localStream_);
                    this.setRemoteSdp_(message.content);
                    this.doAnswer_();
                }
            }

            break;
        case 'answer':
            this.setRemoteSdp_(message.content);
            break;
        case 'candidate':
            if (this.hasRemoteSdp_) {
                var candidate = new RTCIceCandidate({
                    sdpMLineIndex: message.content.label,
                    candidate:     message.content.candidate
                });
                this.recordIceCandidate_('Remote', candidate);
                this.pc_.addIceCandidate(candidate,
                    trace.bind(null, 'Remote candidate added successfully.'),
                    this.onError_.bind(this, 'addIceCandidate'));
            } else {
                console.error('recive candidate without sdp.');
            }

            break;
        default:
            trace('WARNING: unexpected message: ' + JSON.stringify(message));

    }
};

PeerConnectionClient.prototype.onIceCandidate_ = function (event) {
    if (event.candidate) {

        // Eat undesired candidates.
        if (this.filterIceCandidate_(event.candidate)) {
            var message = {
                cmd:     'candidate',
                to:      this.peerId,
                content: {
                    label:     event.candidate.sdpMLineIndex,
                    id:        event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                }
            };
            this.call.send(message);
            this.recordIceCandidate_('Local', event.candidate);
        }
    } else {
        trace('End of candidates.');
    }
};

PeerConnectionClient.prototype.onSignalingStateChanged_ = function () {
    if (!this.pc_) {
        return;
    }
    trace('Signaling state changed to: ' + this.pc_.signalingState);
    this.emit('signalingstatechange');
};

PeerConnectionClient.prototype.onIceConnectionStateChanged_ = function () {
    if (!this.pc_) {
        return;
    }
    trace('ICE connection state changed to: ' + this.pc_.iceConnectionState);
    if (this.pc_.iceConnectionState === 'failed' ||
        this.pc_.iceConnectionState === 'closed' ||
        this.pc_.iceConnectionState === 'disconnected') {

        this.close();
        return;
    } else if (this.pc_.iceConnectionState === 'completed') {
        trace('ICE complete time: ' +
            (window.performance.now() - this.startTime_).toFixed(0) + 'ms.');
    }
    this.emit('iceconnectionstatechange', this.pc_.iceConnectionState);
};

// Return false if the candidate should be dropped, true if not.
PeerConnectionClient.prototype.filterIceCandidate_ = function (candidateObj) {
    var candidateStr = candidateObj.candidate;

    // Always eat TCP candidates. Not needed in this context.
    if (candidateStr.indexOf('tcp') !== -1) {
        return false;
    }

    // If we're trying to eat non-relay candidates, do that.
    if (this.params_.peerConnectionConfig.iceTransports === 'relay' &&
        iceCandidateType(candidateStr) !== 'relay') {
        return false;
    }

    return true;
};

PeerConnectionClient.prototype.recordIceCandidate_ =
    function (location, candidateObj) {
        this.emit('newicecandidate', location, candidateObj.candidate);
    };

PeerConnectionClient.prototype.onRemoteStreamAdded_ = function (event) {
    this.emit('remotestreamadded', event.stream);
};
PeerConnectionClient.prototype.onRemoteStreamRemoved = function (event) {
    this.emit('remotestreamremoved', event.stream);
};


PeerConnectionClient.prototype.onError_ = function (tag, error) {
    this.emit('error', (tag + ': ' + error.toString()));
};

PeerConnectionClient.prototype.getRemoteStreams = function () {
    return this.pc_.getRemoteStreams();
};
PeerConnectionClient.prototype.getRemoteVideo = function () {
    var streams = this.getRemoteStreams();
    for (var i = 0; i < streams.length; i++) {
        var stream = streams[i];
        var tracks = stream.getVideoTracks();
        if (tracks.some(function (track) {
                return track.enabled && !track.muted
            })) {
            return stream;
        }
    }
    return null;
};