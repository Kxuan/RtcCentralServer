var util = require('util');
var querystring = require('querystring');
var path = require('path');
var https = require('https');
var http = require('http');
var crypto = require('crypto');
var express = require('express');
var router = express.Router();

var constants = {
    ROOM_SERVER_HOST:    config.server.origin,
    TURN_SERVER:         config.turn.servers,
    CEOD_KEY:            config.turn.static_key,
    WSS_HOST_PORT_PAIRS: [config.wss.server],

    TURN_URL_TEMPLATE: 'https://%s/turn?username=%s',

};


function getClientId(req, res) {
    var clientId;

    if (!res) {
        throw new Error("client id not set");
    }

    if (req.cookies.clientId) {
        clientId = +req.cookies.clientId;
        if (!isNaN(clientId))
            return clientId;
    }

    clientId = Math.round(Number.MAX_SAFE_INTEGER * Math.random());
    console.log("send cookie clientId:%d", clientId);
    res.cookie("clientId", clientId, {secure: true});
    return clientId;

}
// HD is on by default for desktop Chrome, but not Android or Firefox (yet)
function getHDDefault(userAgent) {
    if (userAgent.indexOf('Android') > -1 || userAgent.indexOf('Chrome') == -1) {
        return false;
    }
    return true;
}

// iceServers will be filled in by the TURN HTTP request.
function makePCConfig(iceTransports) {
    var config = {iceServers: []};
    if (iceTransports) {
        config.iceTransports = iceTransports;
    }
    return config;
}

function maybeAddConstraint(constraints, param, constraint) {
    var object = {};
    if (param && param.toLowerCase() == 'true') {
        object[constraint] = true;
        constraints['optional'].push(object);
    } else if (param && param.toLowerCase() == 'false') {
        object[constraint] = false;
        constraints['optional'].push(object);
    }
    return constraints;
}

function makePCConstraints(dtls, dscp, ipv6) {
    var constraints = {optional: []};
    maybeAddConstraint(constraints, dtls, 'DtlsSrtpKeyAgreement');
    maybeAddConstraint(constraints, dscp, 'googDscp');
    maybeAddConstraint(constraints, ipv6, 'googIPv6');
    return constraints;
}

function addMediaTrackConstraint(trackConstraints, constraintString) {
    var tokens = constraintString.split(':');
    var mandatory = true;
    if (tokens.length == 2) {
        // If specified, e.g. mandatory:minHeight=720, set mandatory appropriately.
        mandatory = (tokens[0] == 'mandatory');
    } else if (tokens.length >= 1) {
        // Otherwise, default to mandatory, except for goog constraints, which
        // won't work in other browsers.
        mandatory = !tokens[0].indexOf('goog') == 0;
    }

    if (tokens.length > 0) {
        tokens = tokens[tokens.length - 1].split('=');
        if (tokens.length == 2) {
            if (mandatory) {
                trackConstraints.mandatory[tokens[0]] = tokens[1];
            } else {
                var object = {};
                object[tokens[0]] = tokens[1];
                trackConstraints.optional.push(object);
            }
        } else {
            console.error('Ignoring malformed constraint: ' + constraintString);
        }
    }
}

function makeMediaTrackConstraints(constraintsString) {
    var trackConstraints;
    if (!constraintsString || constraintsString.toLowerCase() == 'true') {
        trackConstraints = true;
    } else if (constraintsString.toLowerCase() == 'false') {
        trackConstraints = false;
    } else {
        trackConstraints = {mandatory: {}, optional: []};
        var constraintsArray = constraintsString.split(',');
        for (var i in constraintsArray) {
            var constraintString = constraintsArray[i];
            addMediaTrackConstraint(trackConstraints, constraintString);
        }
    }
    return trackConstraints;
}

function makeMediaStreamConstraints(audio, video, firefoxFakeDevice) {
    var streamConstraints = {
        audio: makeMediaTrackConstraints(audio),
        video: makeMediaTrackConstraints(video)
    };
    if (firefoxFakeDevice) streamConstraints.fake = true;
    return streamConstraints;
}

function getWSSParameters(req) {
    var wssHostPortPair = req.query['wshpp'];
    var wssTLS = req.query['wstls'];

    if (!wssHostPortPair) {
        // Attempt to get a wss server from the status provided by prober,
        // if that fails, use fallback value.

        //TODO: setup memcache
        //var memcacheClient = memcache.Client();
        //var wssActiveHost = memcache_client.get(constants.WSS_HOST_ACTIVE_HOST_KEY);
        //if (constants.WSS_HOST_PORT_PAIRS.indexOf(wssActiveHost) > -1) {
        //  wssHostPortPair = wssActiveHost;
        //} else {
        //  console.warn('Invalid or no value returned from memcache, using fallback: '  + JSON.stringify(wssActiveHost));
        wssHostPortPair = constants.WSS_HOST_PORT_PAIRS[0];
        //}
    }

    var match = wssHostPortPair.match(/^([\.\w]+)(?:\:(\d+))?/);
    if (!match) {
        console.error("Check your WSS_HOST_PORT_PAIRS!");
        process.exit();
    }
    if (wssTLS && wssTLS == 'false') {
        return {
            wssUrl:     'ws://' + wssHostPortPair + '/ws',
            wssPostUrl: 'http://' + wssHostPortPair,
            host:       match[1],
            port:       match[2] || 443
        }
    } else {
        return {
            wssUrl:     'wss://' + wssHostPortPair + '/ws',
            wssPostUrl: 'https://' + wssHostPortPair,
            host:       match[1],
            port:       match[2] || 443
        }
    }
}

function getVersionInfo() {
    //TODO: parse version_info.json
    return undefined;
}

function getRoomParameters(req, roomId, clientId) {
    var errorMessages = [];
    var userAgent = req.headers['user-agent'];
    //Which ICE candidates to allow. This is useful for forcing a call to run over TURN, by setting it=relay.
    var iceTransports = req.query['it'];

    // Which TURN transport= to allow (i.e., only TURN URLs with transport=<tt>
    // will be used). This is useful for forcing a session to use TURN/TCP, by
    // setting it=relay&tt=tcp.
    var turnTransports = req.query['tt'];

    // A HTTP server that will be used to find the right TURN servers to use, as
    // described in http://tools.ietf.org/html/draft-uberti-rtcweb-turn-rest-00.
    var turnBaseUrl = req.query['ts'];
    if (!turnBaseUrl) turnBaseUrl = constants.ROOM_SERVER_HOST;

    /*
     Use "audio" and "video" to set the media stream constraints. Defined here:
     http://goo.gl/V7cZg

     "true" and "false" are recognized and interpreted as bools, for example:
     "?audio=true&video=false" (Start an audio-only call.)
     "?audio=false" (Start a video-only call.)
     If unspecified, the stream constraint defaults to True.

     To specify media track constraints, pass in a comma-separated list of
     key/value pairs, separated by a "=". Examples:
     "?audio=googEchoCancellation=false,googAutoGainControl=true"
     (Disable echo cancellation and enable gain control.)

     "?video=minWidth=1280,minHeight=720,googNoiseReduction=true"
     (Set the minimum resolution to 1280x720 and enable noise reduction.)

     Keys starting with "goog" will be added to the "optional" key; all others
     will be added to the "mandatory" key.
     To override this default behavior, add a "mandatory" or "optional" prefix
     to each key, e.g.
     "?video=optional:minWidth=1280,optional:minHeight=720,
     mandatory:googNoiseReduction=true"
     (Try to do 1280x720, but be willing to live with less; enable
     noise reduction or die trying.)

     The audio keys are defined here: talk/app/webrtc/localaudiosource.cc
     The video keys are defined here: talk/app/webrtc/videosource.cc
     */
    var audio = req.query['audio'];
    var video = req.query['video'];

    // Pass firefox_fake_device=1 to pass fake: true in the media constraints,
    // which will make Firefox use its built-in fake device.
    var firefoxFakeDevice = req.query['firefox_fake_device'];

    /*
     The hd parameter is a shorthand to determine whether to open the
     camera at 720p. If no value is provided, use a platform-specific default.
     When defaulting to HD, use optional constraints, in case the camera
     doesn't actually support HD modes.
     */
    var hd = req.query['hd'];
    if (hd) hd = hd.toLowerCase();
    if (hd && video) {
        var message = 'The "hd" parameter has overridden video=' + video
        console.error(message);
        errorMessages.push(message);
    }
    if (hd == 'true') {
        video = 'mandatory:minWidth=1280,mandatory:minHeight=720';
    } else if (!hd && !video && getHDDefault(userAgent)) {
        video = 'optional:minWidth=1280,optional:minHeight=720';
    }

    if (req.query['minre'] || req.query['maxre']) {
        var message = 'The "minre" and "maxre" parameters are no longer supported. Use "video" instead.';
        console.error(message);
        errorMessages.push(message);
    }

    // Options for controlling various networking features.
    var dtls = req.query['dtls'];
    var dscp = req.query['dscp'];
    var ipv6 = req.query['ipv6'];

    var debug = req.query['debug'];


    /*
     TODO(tkchin): We want to provide a TURN request url on the initial get,
     but we don't provide client_id until a join. For now just generate
     a random id, but we should make this better.
     */
    if (!clientId)
        throw new Error("No client id");
    var username = clientId;
    var turnUrl = turnBaseUrl.length > 0 ? util.format(constants.TURN_URL_TEMPLATE, turnBaseUrl, username) : undefined;

    var pcConfig = makePCConfig(iceTransports);
    var pcConstraints = makePCConstraints(dtls, dscp, ipv6);
    var offerConstraints = {mandatory: {}, optional: []};
    var mediaConstraints = makeMediaStreamConstraints(audio, video, firefoxFakeDevice);
    var wssParams = getWSSParameters(req);
    var wssUrl = wssParams.wssUrl;
    var wssPostUrl = wssParams.wssPostUrl;
    var bypassJoinConfirmation = false; //TODO: add BYPASS_JOIN_CONFIRMATION flag in environment variable

    var params = {
        'client_id':                clientId,
        'error_messages':           errorMessages,
        'pc_config':                JSON.stringify(pcConfig),
        'pc_constraints':           JSON.stringify(pcConstraints),
        'offer_constraints':        JSON.stringify(offerConstraints),
        'media_constraints':        JSON.stringify(mediaConstraints),
        'turn_url':                 turnUrl,
        'turn_transports':          turnTransports,
        'wss_url':                  wssUrl,
        'wss_post_url':             wssPostUrl,
        'bypass_join_confirmation': JSON.stringify(bypassJoinConfirmation),
        'version_info':             JSON.stringify(getVersionInfo())
    };

    var protocol = req.headers['x-forwarded-proto'];
    if (!protocol) protocol = "https";
    if (roomId) {
        params['room_id'] = roomId;
        params['room_link'] = protocol + "://" + req.headers.host + '/r/' + roomId + '?' + querystring.stringify(req.query);
    }

    return params;
}


router.get('/', function (req, res, next) {
    // Parse out parameters from request.
    var params = getRoomParameters(req, null, getClientId(req, res));
    res.render("index_template", params);
});

router.get('/turn', function (req, res, next) {
    var query = req.query;
    var username = query.username;
    res.header("Access-Control-Allow-Origin", constants.ROOM_SERVER_HOST);

    var time_to_live = 600;
    var timestamp = parseInt(Date.now() / 1000) + time_to_live;
    var turn_username = timestamp + ':' + username;

    var sha1 = crypto.createHmac('sha1', constants.CEOD_KEY);
    sha1.setEncoding('base64');
    sha1.end(turn_username);

    var password = sha1.read();

    res.json({
        username: turn_username,
        password: password,
        ttl:      time_to_live,
        "uris":   constants.TURN_SERVER.reduce(function (arr, v) {
            arr.push("turn:" + v + "?transport=udp");
            arr.push("turn:" + v + "?transport=tcp");
            return arr;
        }, [])
    });

});
router.all('/android',function(req,res,next){
    res.redirect('/apprtc.apk');
});
router.post('/join/:roomId', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", constants.ROOM_SERVER_HOST);
    var roomId = +req.params.roomId;
    if (isNaN(roomId)) {
        res(new Error("Invalid roomId"));
        return;
    }
    var clientId = getClientId(req, res);
    var params = getRoomParameters(req, roomId, clientId);
    params.messages = [];
    res.send(params);
});

//Room Page for Desktop Browser
router.get('/r/:roomId', function (req, res, next) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    //res.render('index_template', params);
});

module.exports = router;
