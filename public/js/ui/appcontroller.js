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
    fullpageWrapper:           '#fullpage-wrapper',
    hangupSvg:                 '#hangup',
    icons:                     '#icons',
    infoDiv:                   '#info-div',
    localVideo:                '#local-video',
    localVideoWrapper:         '#local-video-wrapper',
    qrcodeRoomSvg:             '#qrcode-room',
    qrcodeRoomDiv:             '#qrcodeRoom-Div',
    qrcodeRoomCanvas:          '#qrcodeRoomCanvas',
    qrcodeHelperSvg:           '#qrcode-helper',
    qrcodeHelperDiv:           '#qrcodeHelper-Div',
    qrcodeHelperCanvas:        '#qrcodeHelperCanvas',
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
    localIdDiv:                '#localIdDiv'
};

// The controller that connects the Call with the UI.
var AppController = function (loadingParams) {
    this.loadingParams_ = loadingParams;
    this.loadUrlParams_();
    trace('Initializing; server= ' + loadingParams.roomServer + '.');
    trace('Initializing; room=' + loadingParams.roomId + '.');

    this.fullpageWrapper = $(UI_CONSTANTS.fullpageWrapper);
    this.hangupSvg_ = $(UI_CONSTANTS.hangupSvg);
    this.icons_ = $(UI_CONSTANTS.icons);
    this.localVideo_ = $(UI_CONSTANTS.localVideo);
    this.localVideoWrapper = $(UI_CONSTANTS.localVideoWrapper);
    this.sharingDiv_ = $(UI_CONSTANTS.sharingDiv);
    this.statusDiv_ = $(UI_CONSTANTS.statusDiv);
    this.videosDiv_ = $(UI_CONSTANTS.videosDiv);
    this.roomLinkHref_ = $(UI_CONSTANTS.roomLinkHref);
    this.rejoinDiv_ = $(UI_CONSTANTS.rejoinDiv);
    this.rejoinButton_ = $(UI_CONSTANTS.rejoinButton);
    this.newRoomButton_ = $(UI_CONSTANTS.newRoomButton);
    this.qrcodeHelper_ = $(UI_CONSTANTS.qrcodeHelper);
    this.qrcodeHelperDiv_ = $(UI_CONSTANTS.qrcodeHelperDiv);
    this.qrcodeHelperCanvas = $(UI_CONSTANTS.qrcodeHelperCanvas);
    this.qrcodeRoomDiv_ = $(UI_CONSTANTS.qrcodeRoomDiv);
    this.qrcodeRoomCanvas = $(UI_CONSTANTS.qrcodeRoomCanvas);
    this.localIdDiv_ = $(UI_CONSTANTS.localIdDiv);
    enableAutoHiddenAfterTransitionEnd(this.qrcodeRoomDiv_);
    enableAutoHiddenAfterTransitionEnd(this.qrcodeHelperDiv_);


    this.newRoomButton_.addEventListener('click',
        this.onNewRoomClick_.bind(this), false);
    this.rejoinButton_.addEventListener('click',
        this.onRejoinClick_.bind(this), false);

    this.iconController = new IconController();
    this.ctlQRHelper = this.iconController.add('qrhelper', $(UI_CONSTANTS.qrcodeHelperSvg));
    this.ctlQRRoom = this.iconController.add('qrroom', $(UI_CONSTANTS.qrcodeRoomSvg));
    this.ctlAudio = this.iconController.add('audio', $(UI_CONSTANTS.muteAudioSvg));
    this.ctlVideo = this.iconController.add('video', $(UI_CONSTANTS.muteVideoSvg));
    this.ctlFullscreen = this.iconController.add('fullscreen', $(UI_CONSTANTS.fullscreenSvg));
    this.ctlHangup = this.iconController.add('hangup', $(UI_CONSTANTS.hangupSvg));
    this.ctlHangup.on('enable', console.trace.bind(console, 'Control Icon Hangup is enabled'));
    this.ctlHangup.on('disable', console.trace.bind(console, 'Control Icon Hangup is disabled'));

    this.ctlQRHelper.on('click', this.ctlQRHelper.toggle);
    this.ctlQRRoom.on('click', this.ctlQRRoom.toggle);
    this.ctlAudio.on('click', this.ctlAudio.toggle);
    this.ctlVideo.on('click', this.ctlVideo.toggle);
    this.ctlFullscreen.on('click', this.ctlFullscreen.toggle);
    this.ctlHangup.on('click', this.hangup_.bind(this));

    this.ctlQRHelper.on('enable', this.ctlQRHelperEnable.bind(this));
    this.ctlQRHelper.on('disable', this.ctlQRHelperDisable.bind(this));
    this.ctlQRHelper.on('active', this.ctlQRHelperActive.bind(this));
    this.ctlQRHelper.on('deactive', this.ctlQRHelperDeactive.bind(this));

    this.ctlQRRoom.on('active', this.ctlQRRoomActive.bind(this));
    this.ctlQRRoom.on('deactive', this.ctlQRRoomDeactive.bind(this));

    this.ctlAudio.on('toggle', this.toggleAudioMute_.bind(this));
    this.ctlVideo.on('toggle', this.toggleVideoMute_.bind(this));
    this.ctlFullscreen.on('toggle', this.toggleFullScreen_.bind(this));


    this.roomLink_ = '';
    this.roomSelection_ = null;
    this.localStream_ = null;

    this.currentFullPageUI = null;
    this.allPeerControllers = [];

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

        $(UI_CONSTANTS.confirmJoinButton).onclick = function () {
            this.hide_(confirmJoinDiv);

            // Record this room in the recently used list.
            var recentlyUsedList = new RoomSelection.RecentlyUsedList();
            recentlyUsedList.pushRecentRoom(this.loadingParams_.roomId);
            this.finishCallSetup_(this.loadingParams_.roomId);


            this.qrcodeRoomDiv_.classList.remove('hidden');

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
    this.call_.on('connected', this.onCallConnected.bind(this));
    this.call_.on('remotehangup', this.onRemoteHangup_.bind(this));
    this.call_.on('remotestreamadded', this.onRemoteStreamAdded_.bind(this));
    this.call_.on('localstreamadded', this.onLocalStreamAdded_.bind(this));
    this.call_.on('localstreamremoved', this.onLocalStreamRemoved.bind(this));
    this.call_.on('remoteSdp', this.onRemoteSdp.bind(this));

    this.call_.on('statusmessage', this.displayStatus_.bind(this));
    this.call_.on("callerstarted", this.displaySharingInfo_.bind(this));

    this.call_.on("connected",this.displayLocalId_.bind(this));
};

AppController.prototype.showRoomSelection_ = function () {
    var roomSelectionDiv = $(UI_CONSTANTS.roomSelectionDiv);
    this.roomSelection_ = new RoomSelection(roomSelectionDiv, UI_CONSTANTS);
    this.show_(roomSelectionDiv);

    this.roomSelection_.on('RoomSelected', function (roomName) {
        this.hide_(roomSelectionDiv);
        this.createCall_();
        this.finishCallSetup_(roomName);
        this.qrcodeRoomDiv_.classList.remove('hidden');

        this.roomSelection_ = null;
        if (this.localStream_) {
            attachMediaStream(this.localVideo_, this.localStream_);
            this.updateLayout();
        }
    }.bind(this));
};

AppController.prototype.finishCallSetup_ = function (roomId) {
    this.call_.start(roomId);

    document.onkeypress = this.onKeyPress_.bind(this);
    window.onmousemove = this.showHud_.bind(this);

    setUpFullScreen();

    // Call hangup with async = false. Required to complete multiple
    // clean up steps before page is closed.
    // Chrome apps can't use onbeforeunload.
    window.onbeforeunload = function () {
        this.call_.hangup();
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
    this.displayStatus_('Hanging up');
    this.transitionToDone_();

    // Call hangup with async = true.
    this.call_.hangup();
};
AppController.prototype.setVideoFullpage = function (el) {
    if (el.parentElement != this.fullpageWrapper) {
        el.parentElement.removeChild(el);
        this.fullpageWrapper.appendChild(el);
        reattachMediaStream(el, el);
    }
};
AppController.prototype.setVideoMini = function (el, parent) {
    if (el.parentElement == this.fullpageWrapper) {
        this.fullpageWrapper.removeChild(el);
        parent.insertBefore(el, parent.firstElementChild);
        reattachMediaStream(el, el);
    }
};
AppController.prototype.updateLayout = function () {
    if (this.currentFullPageUI === null) {
        this.setVideoFullpage(this.localVideo_);
    } else {
        this.setVideoMini(this.localVideo_, this.localVideoWrapper);
    }

    var countPlayableVideo = 0;
    //遍历所有远程视频标签，
    // 该全屏的全屏，不该全屏的缩小掉
    this.allPeerControllers.forEach(function (ui) {
        var video = ui.getVideoElement();
        if (video && video.readyState > 2) {
            countPlayableVideo++;
        }

        if (ui === this.currentFullPageUI) {
            this.setVideoFullpage(ui.getVideoElement(), ui.getVideoWrapper());
        } else {
            this.setVideoMini(ui.getVideoElement(), ui.getVideoWrapper());
        }
    }.bind(this));

    //如果有不能播放的远程视频或者远程视频不止1个，则显示远程视频栏
    if (countPlayableVideo != this.allPeerControllers.length || this.allPeerControllers.length > 1) {
        this.videosDiv_.classList.remove('hidden');
    } else {
        this.videosDiv_.classList.add('hidden');
    }

    //如果有可显示的远程视频则显示分享
    if (countPlayableVideo >= 1) {
        this.deactivate_(this.sharingDiv_);
        this.hide_(this.sharingDiv_);
    } else {
        this.activate_(this.sharingDiv_);
        this.show_(this.sharingDiv_);
    }
};

AppController.prototype.attachLocalStream_ = function () {
    // Call the polyfill wrapper to attach the media stream to this element.
    attachMediaStream(this.localVideo_, this.localStream_);

    this.displayStatus_('');
    this.updateLayout();
};

AppController.prototype.transitionToDone_ = function () {
    this.deactivate_(this.localVideo_);
    this.iconController.disableAll();
    this.activate_(this.rejoinDiv_);
    this.show_(this.rejoinDiv_);
    this.displayStatus_('');
};
AppController.prototype.onCallConnected = function (roomId, roomLink, clientId) {
    this.pushCallNavigation_(roomId, roomLink);

    this.ctlHangup.enable();
    this.ctlQRRoom.enable();
    if (this.localStream_) {
        this.ctlAudio.enable();
        this.ctlVideo.enable();
    } else {
        this.ctlQRHelper.enable();
    }

    renderHelperQrcode(this.qrcodeHelperCanvas, roomId, clientId);
    renderRoomQrcode(this.qrcodeRoomCanvas);
};
AppController.prototype.onRemoteSdp = function (pc) {
    var ui = pc.ui;
    if (!ui) {
        ui = pc.ui = new PeerController(pc);

        ui.on('layoutChange', this.updateLayout.bind(this));
        ui.on('requestFullpage', function () {
            if (this.currentFullPageUI != ui) {
                this.currentFullPageUI = ui;
                this.updateLayout();
            }
        }.bind(this));

        this.videosDiv_.appendChild(ui.getRootElement());
        this.allPeerControllers.push(ui);

        if (this.allPeerControllers.length == 1) {
            this.currentFullPageUI = ui;
            this.updateLayout();
        }
    }
};
AppController.prototype.onRemoteHangup_ = function (pc) {
    showAlert('The remote side hung up.');
    var ui = pc.ui;
    if (!ui) {
        return;
    }
    ui.destroyRemotePeer();
    this.allPeerControllers = this.allPeerControllers.filter(function (r) {
        return r !== pc.ui;
    });
    if (this.currentFullPageUI === ui) {
        this.currentFullPageUI = this.allPeerControllers.length > 0 ? this.allPeerControllers[0] : null;
    }
    delete pc.ui;
    this.updateLayout();
};
AppController.prototype.onRemoteStreamAdded_ = function (pc, stream) {
    trace('Remote stream added.');
};
AppController.prototype.onRemoteStreamRemoved = function (pc, stream) {
    trace('Remote stream added.');
};

AppController.prototype.onLocalStreamAdded_ = function (stream) {
    trace('User has granted access to local media.');
    this.localStream_ = stream;
    attachMediaStream(this.localVideo_, this.localStream_);

    this.ctlQRHelper.disable();
    this.ctlAudio.enable();
    this.ctlVideo.enable();

    this.updateLayout();
};
AppController.prototype.onLocalStreamRemoved = function () {
    trace("Local stream removed");
    this.localStream_ = null;
    this.localVideo_.src = '';

    //当前全屏视频为本地视频流时，尝试自动将全屏视频改为第一个远端设备
    if (this.allPeerControllers.length > 0 && this.currentFullPageUI === null) {
        this.currentFullPageUI = this.allPeerControllers[0];
    }

    this.displayStatus_('');
    this.ctlQRHelper.enable();
    this.ctlAudio.disable();
    this.ctlVideo.disable();
    this.updateLayout();
};

AppController.prototype.ctlQRHelperEnable = function () {
    this.ctlQRHelper.active();
};
AppController.prototype.ctlQRHelperDisable = function () {
    this.ctlQRHelper.deactive();
};
AppController.prototype.ctlQRHelperActive = function () {
    this.qrcodeHelperDiv_.classList.remove('hidden');
    +this.qrcodeHelperDiv_.clientWidth;
    this.qrcodeHelperDiv_.classList.remove('fadeOut');
};
AppController.prototype.ctlQRHelperDeactive = function () {
    this.qrcodeHelperDiv_.classList.remove('hidden');
    this.qrcodeHelperDiv_.classList.add('fadeOut');
};
AppController.prototype.ctlQRRoomActive = function () {
    this.qrcodeRoomDiv_.classList.remove('hidden');
    +this.qrcodeRoomDiv_.clientWidth;
    this.qrcodeRoomDiv_.classList.remove('fadeOut');
};
AppController.prototype.ctlQRRoomDeactive = function () {
    this.qrcodeRoomDiv_.classList.remove('hidden');
    this.qrcodeRoomDiv_.classList.add('fadeOut');
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
        case 'q':
            this.hangup_();
            return false;
        default:
            return;
    }
};

AppController.prototype.pushCallNavigation_ = function (roomId, roomLink) {
    window.history.pushState({'roomId': roomId, 'roomLink': roomLink},
        roomId,
        roomLink);
};

AppController.prototype.displaySharingInfo_ = function (roomId, roomLink) {
    this.roomLinkHref_.href = roomLink;
    this.roomLinkHref_.text = roomLink;
    this.roomLink_ = roomLink;
    this.activate_(this.sharingDiv_);
};

AppController.prototype.displayLocalId_ = function (roomId,roomLink,clientId) {
    var localIdTips = '您的本地id是:' + clientId;
    this.localIdDiv_.innerText = localIdTips;
}

AppController.prototype.displayStatus_ = function (status) {
    if (!status) {
        this.deactivate_(this.statusDiv_);
    } else {
        this.activate_(this.statusDiv_);
    }
    this.statusDiv_.innerHTML = status;
};

AppController.prototype.toggleAudioMute_ = function () {
    this.call_.toggleAudioMute();
};

AppController.prototype.toggleVideoMute_ = function () {
    this.call_.toggleVideoMute();
};

AppController.prototype.toggleFullScreen_ = function () {
    if (isFullScreen()) {
        trace('Exiting fullscreen.');
        document.cancelFullScreen();
    } else {
        trace('Entering fullscreen.');
        document.body.requestFullScreen();
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
AppController.prototype.showHud_ = function () {
    if (this.timerCloseIcons) {
        clearTimeout(this.timerCloseIcons);
    }
    this.timerCloseIcons = setTimeout(this.hideHud.bind(this), 2000);
    this.activate_(this.icons_);
    this.show_(this.localIdDiv_);
};
AppController.prototype.hideHud = function () {
    this.deactivate_(this.icons_);
    this.hide_(this.localIdDiv_);
};
