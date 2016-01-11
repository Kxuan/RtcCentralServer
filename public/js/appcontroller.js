/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */

/* globals trace, InfoBox, setUpFullScreen, isFullScreen,
 RoomSelection, isChromeApp, $ */
/* exported AppController, remoteVideo */

'use strict';

// Keep this in sync with the HTML element id attributes. Keep it sorted.
var UI_CONSTANTS = {
    confirmJoinButton:         '#confirm-join-button',
    confirmJoinDiv:            '#confirm-join-div',
    confirmJoinRoomSpan:       '#confirm-join-room-span',
    fullscreenSvg:             '#fullscreen',
    hangupSvg:                 '#hangup',
    icons:                     '#icons',
    infoDiv:                   '#info-div',
    localVideo:                '#local-video',
    muteAudioSvg:              '#mute-audio',
    muteVideoSvg:              '#mute-video',
    newRoomButton:             '#new-room-button',
    rejoinButton:              '#rejoin-button',
    rejoinDiv:                 '#rejoin-div',
    roomLinkHref:              '#room-link-href',
    roomSelectionDiv:          '#room-selection',
    roomSelectionInput:        '#room-id-input',
    roomSelectionInputLabel:   '#room-id-input-label',
    roomSelectionJoinButton:   '#join-button',
    roomSelectionRandomButton: '#random-button',
    roomSelectionRecentList:   '#recent-rooms-list',
    sharingDiv:                '#sharing-div',
    statusDiv:                 '#status-div',
    videosDiv:                 '#videos',
    QRbutton:                  '#QRcode',
    QRdiv:                     '#objDiv',
};

// The controller that connects the Call with the UI.
var AppController = function (loadingParams) {
    this.loadingParams_ = loadingParams;
    this.loadUrlParams_();
    trace('Initializing; server= ' + loadingParams.roomServer + '.');
    trace('Initializing; room=' + loadingParams.roomId + '.');

    this.hangupSvg_ = $(UI_CONSTANTS.hangupSvg);
    this.icons_ = $(UI_CONSTANTS.icons);
    this.localVideo_ = $(UI_CONSTANTS.localVideo);
    this.sharingDiv_ = $(UI_CONSTANTS.sharingDiv);
    this.statusDiv_ = $(UI_CONSTANTS.statusDiv);
    this.videosDiv_ = $(UI_CONSTANTS.videosDiv);
    this.roomLinkHref_ = $(UI_CONSTANTS.roomLinkHref);
    this.rejoinDiv_ = $(UI_CONSTANTS.rejoinDiv);
    this.rejoinButton_ = $(UI_CONSTANTS.rejoinButton);
    this.newRoomButton_ = $(UI_CONSTANTS.newRoomButton);
    this.QRbutton_ = $(UI_CONSTANTS.QRbutton);
    this.QRdiv_ = $(UI_CONSTANTS.QRdiv);


    this.newRoomButton_.addEventListener('click',
        this.onNewRoomClick_.bind(this), false);
    this.rejoinButton_.addEventListener('click',
        this.onRejoinClick_.bind(this), false);
    this.QRbutton_.addEventListener('click',
        this.onQRcodeClick_.bind(this), false);

    this.muteAudioIconSet_ =
        new AppController.IconSet_(UI_CONSTANTS.muteAudioSvg);
    this.muteVideoIconSet_ =
        new AppController.IconSet_(UI_CONSTANTS.muteVideoSvg);
    this.fullscreenIconSet_ =
        new AppController.IconSet_(UI_CONSTANTS.fullscreenSvg);


    this.roomLink_ = '';
    this.roomSelection_ = null;
    this.localStream_ = null;
    this.remoteVideoResetTimer_ = null;

    // If the params has a roomId specified, we should connect to that room
    // immediately. If not, show the room selection UI.
    if (this.loadingParams_.roomId) {
        this.createCall_();
        this.call_.maybeGetMedia_();
        // Ask the user to confirm.
        if (!RoomSelection.matchRandomRoomPattern(this.loadingParams_.roomId)) {
            // Show the room name only if it does not match the random room pattern.
            $(UI_CONSTANTS.confirmJoinRoomSpan).textContent = ' "' +
                this.loadingParams_.roomId + '"';
        }
        var confirmJoinDiv = $(UI_CONSTANTS.confirmJoinDiv);
        this.show_(confirmJoinDiv);
        //this.hide_(this.QRbutton_);;

        $(UI_CONSTANTS.confirmJoinButton).onclick = function () {
            this.hide_(confirmJoinDiv);

            // Record this room in the recently used list.
            var recentlyUsedList = new RoomSelection.RecentlyUsedList();
            recentlyUsedList.pushRecentRoom(this.loadingParams_.roomId);
            this.finishCallSetup_(this.loadingParams_.roomId);

            this.show_(this.QRbutton_);
            this.QRdiv_.style.display = "inline"

        }.bind(this);

        if (this.loadingParams_.bypassJoinConfirmation) {
            $(UI_CONSTANTS.confirmJoinButton).onclick();
        }
    } else {
        // Display the room selection UI.
        this.showRoomSelection_();
    }
};

AppController.prototype.createCall_ = function () {
    this.call_ = new Call(this.loadingParams_);
    this.infoBox_ = new InfoBox($(UI_CONSTANTS.infoDiv),
        this.call_,
        'Alpha-Test');

    // TODO(jiayl): replace callbacks with events.
    this.call_.onremotehangup = this.onRemoteHangup_.bind(this);
    this.call_.onremotestreamadded = this.onRemoteStreamAdded_.bind(this);
    this.call_.onlocalstreamadded = this.onLocalStreamAdded_.bind(this);

    this.call_.onsignalingstatechange =
        this.infoBox_.updateInfoDiv.bind(this.infoBox_);
    this.call_.oniceconnectionstatechange =
        this.infoBox_.updateInfoDiv.bind(this.infoBox_);
    this.call_.onnewicecandidate =
        this.infoBox_.recordIceCandidateTypes.bind(this.infoBox_);

    this.call_.onerror = this.displayError_.bind(this);
    this.call_.onstatusmessage = this.displayStatus_.bind(this);
    this.call_.oncallerstarted = this.displaySharingInfo_.bind(this);
};

AppController.prototype.showRoomSelection_ = function () {
    var roomSelectionDiv = $(UI_CONSTANTS.roomSelectionDiv);
    this.roomSelection_ = new RoomSelection(roomSelectionDiv, UI_CONSTANTS);
    this.show_(roomSelectionDiv);
    this.roomSelection_.onRoomSelected = function (roomName) {
        this.hide_(roomSelectionDiv);
        this.createCall_();
        this.finishCallSetup_(roomName);
        this.show_(this.QRbutton_);
        this.QRdiv_.style.display = "inline"

        this.roomSelection_ = null;
        if (this.localStream_) {
            this.attachLocalStream_();
        }
    }.bind(this);
};

AppController.prototype.finishCallSetup_ = function (roomId) {
    this.call_.start(roomId);

    document.onkeypress = this.onKeyPress_.bind(this);
    window.onmousemove = this.showIcons_.bind(this);

    $(UI_CONSTANTS.muteAudioSvg).onclick = this.toggleAudioMute_.bind(this);
    $(UI_CONSTANTS.muteVideoSvg).onclick = this.toggleVideoMute_.bind(this);
    $(UI_CONSTANTS.fullscreenSvg).onclick = this.toggleFullScreen_.bind(this);
    $(UI_CONSTANTS.hangupSvg).onclick = this.hangup_.bind(this);

    setUpFullScreen();

    // Call hangup with async = false. Required to complete multiple
    // clean up steps before page is closed.
    // Chrome apps can't use onbeforeunload.
    window.onbeforeunload = function () {
        this.call_.hangup();
        this.show_(this.QRbutton_);
    }.bind(this);

    window.onpopstate = function (event) {
        if (!event.state) {
            // TODO (chuckhays) : Resetting back to room selection page not
            // yet supported, reload the initial page instead.
            trace('Reloading main page.');
            location.href = location.origin;
        } else {
            // This could be a forward request to open a room again.
            if (event.state.roomLink) {
                location.href = event.state.roomLink;
            }
        }
    };
};

AppController.prototype.hangup_ = function () {
    trace('Hanging up.');
    this.hide_(this.icons_);
    this.displayStatus_('Hanging up');
    this.transitionToDone_();

    // Call hangup with async = true.
    this.call_.hangup();
};

AppController.prototype.onRemoteHangup_ = function (pc) {
    this.displayStatus_('The remote side hung up.');
    this.call_.onRemoteHangup();
    this.destroyRemoteVideo(pc);
};

AppController.prototype.createPeerElement = function (videoStream) {
    var el        = document.createElement('div'),
        elWrapper = document.createElement('div'),
        elPeerId  = document.createElement('a');
    el.className = 'peer';
    elWrapper.className = 'wrapper';
    elPeerId.className = 'remotePeerName';
    el.appendChild(elWrapper);

    //初始化远端视频标签
    var elVideo;
    if (videoStream) {
        elVideo = document.createElement('video');
        elVideo.autoplay = true;
        attachMediaStream(elVideo, videoStream);
    } else {
        elVideo = document.createElement('div');
        elVideo.className = 'no-video';
        elVideo.innerText = "无视频";
    }
    elWrapper.appendChild(elVideo);

    //初始化远端用户ID标签
    elWrapper.appendChild(elPeerId);

    this.videosDiv_.appendChild(el);
    return {root: el, wrapper: elWrapper, video: elVideo, peerId: elPeerId};
};
AppController.prototype.initialRemoteVideo = function (pc) {
    if (pc.ui) {
        return;
    }
    var remoteVideo = pc.getRemoteVideo();
    var ui = pc.ui = {
        el: this.createPeerElement(remoteVideo)
    };
    ui.el.peerId.innerText = pc.peerId;
    ui.el.peerId.title = pc.peerId;
};
AppController.prototype.destroyRemoteVideo = function (pc) {
    if (!pc.ui) {
        return;
    }

    this.videosDiv_.removeChild(pc.ui.el.root);
    delete pc.ui;
};
AppController.prototype.onRemoteStreamAdded_ = function (pc, stream) {
    this.initialRemoteVideo(pc);
    this.deactivate_(this.sharingDiv_);
    trace('Remote stream added.');
    //attachMediaStream(this.remoteVideo_, stream);
};

AppController.prototype.onLocalStreamAdded_ = function (stream) {
    trace('User has granted access to local media.');
    this.localStream_ = stream;

    if (!this.roomSelection_) {
        this.attachLocalStream_();
    }
};

AppController.prototype.attachLocalStream_ = function () {
    // Call the polyfill wrapper to attach the media stream to this element.
    attachMediaStream(this.localVideo_, this.localStream_);

    this.displayStatus_('');
    this.show_(this.icons_);
    this.hide_(this.QRbutton_);
    this.QRdiv_.style.display = "none";
};

AppController.prototype.transitionToWaiting_ = function () {
    // Stop waiting for remote video.
    this.remoteVideo_.oncanplay = undefined;

    this.hide_(this.hangupSvg_);
    // Rotate the div containing the videos -180 deg with a CSS transform.
    this.deactivate_(this.videosDiv_);

    if (!this.remoteVideoResetTimer_) {
        this.remoteVideoResetTimer_ = setTimeout(function () {
            this.remoteVideoResetTimer_ = null;
            trace('Resetting remoteVideo src after transitioning to waiting.');
            this.remoteVideo_.src = '';
        }.bind(this), 800);
    }

    // Set localVideo.src now so that the local stream won't be lost if the call
    // is restarted before the timeout.
    this.localVideo_.src = this.miniVideo_.src;

    // Transition opacity from 0 to 1 for the local video.
    this.activate_(this.localVideo_);
    // Transition opacity from 1 to 0 for the remote and mini videos.
    this.deactivate_(this.remoteVideo_);
    this.deactivate_(this.miniVideo_);
};

AppController.prototype.transitionToDone_ = function () {
    // Stop waiting for remote video.
    this.remoteVideo_.oncanplay = undefined;
    this.deactivate_(this.localVideo_);
    this.deactivate_(this.remoteVideo_);
    this.deactivate_(this.miniVideo_);
    this.hide_(this.hangupSvg_);
    this.activate_(this.rejoinDiv_);
    this.show_(this.rejoinDiv_);
    this.displayStatus_('');
};

AppController.prototype.onRejoinClick_ = function () {
    this.deactivate_(this.rejoinDiv_);
    this.hide_(this.rejoinDiv_);
    this.call_.restart();
};

AppController.prototype.onNewRoomClick_ = function () {
    this.deactivate_(this.rejoinDiv_);
    this.hide_(this.rejoinDiv_);
    this.showRoomSelection_();
};

AppController.prototype.onQRcodeClick_ = function () {
    var intTimeStep = 20;
    var isIe = (window.ActiveXObject) ? true : false;
    var intAlphaStep = (isIe) ? 5 : 0.05;
    var curSObj = null;
    var curOpacity = null;

    curSObj = this.QRdiv_;

    setObjState();

    function setObjState() {
        if (curSObj.style.display == "") {
            curOpacity = 1;
            setObjClose();
        }
        else {
            if (isIe) {
                curSObj.style.cssText = 'DISPLAY: none;Z-INDEX: 1; FILTER: alpha(opacity=0); POSITION: absolute;';
                curSObj.filters.alpha.opacity = 0;
            } else {
                curSObj.style.opacity = 0
            }
            curSObj.style.display = '';
            curOpacity = 0;
            setObjOpen();
        }
    }

    function setObjOpen() {
        if (isIe) {
            curSObj.filters.alpha.opacity += intAlphaStep;
            if (curSObj.filters.alpha.opacity < 100) setTimeout(setObjOpen, intTimeStep);
        } else {
            curOpacity += intAlphaStep;
            curSObj.style.opacity = curOpacity;
            if (curOpacity < 1) setTimeout(setObjOpen, intTimeStep);
        }
    }

    function setObjClose() {
        if (isIe) {
            curSObj.filters.alpha.opacity -= intAlphaStep;
            if (curSObj.filters.alpha.opacity > 0) {
                setTimeout(setObjClose(), intTimeStep);
            }
            else {
                curSObj.style.display = "none";
            }
        } else {
            curOpacity -= intAlphaStep;
            if (curOpacity > 0) {
                curSObj.style.opacity = curOpacity;
                setTimeout(setObjClose(), intTimeStep);
            }
            else {
                curSObj.style.display = 'none';
            }
        }
    }
};

// Spacebar, or m: toggle audio mute.
// c: toggle camera(video) mute.
// f: toggle fullscreen.
// i: toggle info panel.
// q: quit (hangup)
// Return false to screen out original Chrome shortcuts.
AppController.prototype.onKeyPress_ = function (event) {
    switch (String.fromCharCode(event.charCode)) {
        case ' ':
        case 'm':
            if (this.call_) {
                this.call_.toggleAudioMute();
            }
            return false;
        case 'c':
            if (this.call_) {
                this.call_.toggleVideoMute();
            }
            return false;
        case 'f':
            this.toggleFullScreen_();
            return false;
        case 'i':
            this.infoBox_.toggleInfoDiv();
            return false;
        case 'q':
            this.hangup_();
            return false;
        default:
            return;
    }
};

AppController.prototype.pushCallNavigation_ = function (roomId, roomLink) {
    if (!isChromeApp()) {
        window.history.pushState({'roomId': roomId, 'roomLink': roomLink},
            roomId,
            roomLink);
    }
};

AppController.prototype.displaySharingInfo_ = function (roomId, roomLink) {
    this.roomLinkHref_.href = roomLink;
    this.roomLinkHref_.text = roomLink;
    this.roomLink_ = roomLink;
    this.pushCallNavigation_(roomId, roomLink);
    this.activate_(this.sharingDiv_);
};

AppController.prototype.displayStatus_ = function (status) {
    if (!status) {
        this.deactivate_(this.statusDiv_);
    } else {
        this.activate_(this.statusDiv_);
    }
    this.statusDiv_.innerHTML = status;
};

AppController.prototype.displayError_ = function (error) {
    trace(error);
    this.infoBox_.pushErrorMessage(error);
};

AppController.prototype.toggleAudioMute_ = function () {
    this.call_.toggleAudioMute();
    this.muteAudioIconSet_.toggle();
};

AppController.prototype.toggleVideoMute_ = function () {
    this.call_.toggleVideoMute();
    this.muteVideoIconSet_.toggle();
};

AppController.prototype.toggleFullScreen_ = function () {
    if (isFullScreen()) {
        trace('Exiting fullscreen.');
        document.cancelFullScreen();
    } else {
        trace('Entering fullscreen.');
        document.body.requestFullScreen();
    }
    this.fullscreenIconSet_.toggle();
};

AppController.prototype.hide_ = function (element) {
    element.classList.add('hidden');
};

AppController.prototype.show_ = function (element) {
    element.classList.remove('hidden');
};

AppController.prototype.activate_ = function (element) {
    element.classList.add('active');
};

AppController.prototype.deactivate_ = function (element) {
    element.classList.remove('active');
};

AppController.prototype.showIcons_ = function () {
    if (!this.icons_.classList.contains('active')) {
        this.activate_(this.icons_);
        setTimeout(function () {
            this.deactivate_(this.icons_);
        }.bind(this), 5000);
    }
};

AppController.prototype.loadUrlParams_ = function () {
    //通过URL解析进入的房间号
    var mRoom = location.pathname.match(/^\/r\/(\d+)/);
    if (mRoom !== null) {
        this.loadingParams_.roomId = mRoom[1];
        this.loadingParams_.roomLink = location.href;
    }
    // Suppressing jshint warns about using urlParams['KEY'] instead of
    // urlParams.KEY, since we'd like to use string literals to avoid the Closure
    // compiler renaming the properties.
    var urlParams = queryStringToDictionary(window.location.search)

    this.loadingParams_.audioSendBitrate = urlParams['asbr'];
    this.loadingParams_.audioSendCodec = urlParams['asc'];
    this.loadingParams_.audioRecvBitrate = urlParams['arbr'];
    this.loadingParams_.audioRecvCodec = urlParams['arc'];
    this.loadingParams_.opusMaxPbr = urlParams['opusmaxpbr'];
    this.loadingParams_.opusFec = urlParams['opusfec'];
    this.loadingParams_.opusStereo = urlParams['stereo'];
    this.loadingParams_.videoSendBitrate = urlParams['vsbr'];
    this.loadingParams_.videoSendInitialBitrate = urlParams['vsibr'];
    this.loadingParams_.videoSendCodec = urlParams['vsc'];
    this.loadingParams_.videoRecvBitrate = urlParams['vrbr'];
    this.loadingParams_.videoRecvCodec = urlParams['vrc'];
    /* jshint ignore:end */
};

AppController.IconSet_ = function (iconSelector) {
    this.iconElement = document.querySelector(iconSelector);
};

AppController.IconSet_.prototype.toggle = function () {
    if (this.iconElement.classList.contains('on')) {
        this.iconElement.classList.remove('on');
        // turn it off: CSS hides `svg path.on` and displays `svg path.off`
    } else {
        // turn it on: CSS displays `svg.on path.on` and hides `svg.on path.off`
        this.iconElement.classList.add('on');
    }
};
