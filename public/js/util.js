
'use strict';

function $(selector) {
    return document.querySelector(selector);
}

// Returns the URL query key-value pairs as a dictionary object.
function queryStringToDictionary(queryString) {
    var pairs = queryString.slice(1).split('&');

    var result = {};
    pairs.forEach(function (pair) {
        if (pair) {
            pair = pair.split('=');
            if (pair[0]) {
                result[pair[0]] = decodeURIComponent(pair[1] || '');
            }
        }
    });
    return result;
}

// Sends the URL request and returns a Promise as the result.
function sendAsyncUrlRequest(method, url, body) {
    return sendUrlRequest(method, url, true, body);
}

// If async is true, returns a Promise and executes the xhr request
// async. If async is false, the xhr will be executed sync and a
// resolved promise is returned.
function sendUrlRequest(method, url, async, body) {
    return new Promise(function (resolve, reject) {
        var xhr;
        var reportResults = function () {
            if (xhr.status !== 200) {
                reject(
                    Error('Status=' + xhr.status + ', response=' +
                        xhr.responseText));
                return;
            }
            resolve(xhr.responseText);
        };

        xhr = new XMLHttpRequest();
        if (async) {
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) {
                    return;
                }
                reportResults();
            };
        }
        xhr.open(method, url, async);
        xhr.send(body);

        if (!async) {
            reportResults();
        }
    });
}

// Returns a list of turn servers after requesting it from CEOD.
function requestTurnServers(turnRequestUrl, turnTransports) {
    return new Promise(function (resolve, reject) {
        // Chrome apps don't send origin header for GET requests, but
        // do send it for POST requests. Origin header is required for
        // access to turn request url.
        var method = 'GET';
        sendAsyncUrlRequest(method, turnRequestUrl).then(function (response) {
            var turnServerResponse = JSON.parse(response);
            // Filter the TURN URLs to only use the desired transport, if specified.
            if (turnTransports.length > 0) {
                filterTurnUrls(turnServerResponse.uris, turnTransports);
            }

            // Create the RTCIceServer objects from the response.
            var turnServers = createIceServers(turnServerResponse.uris,
                turnServerResponse.username, turnServerResponse.password);
            if (!turnServers) {
                reject(Error('Error creating ICE servers from response.'));
                return;
            }
            trace('Retrieved TURN server information.');
            resolve(turnServers);
        }).catch(function (error) {
            reject(Error('TURN server request error: ' + error.message));
            return;
        });
    });
}

// Filter a list of TURN urls to only contain those with transport=|protocol|.
function filterTurnUrls(urls, protocol) {
    for (var i = 0; i < urls.length;) {
        var parts = urls[i].split('?');
        if (parts.length > 1 && parts[1] !== ('transport=' + protocol)) {
            urls.splice(i, 1);
        } else {
            ++i;
        }
    }
}


// End shims for fullscreen

// Return a random numerical string.
function randomString(strLength) {
    var result = [];
    strLength = strLength || 5;
    var charSet = '0123456789';
    while (strLength--) {
        result.push(charSet.charAt(Math.floor(Math.random() * charSet.length)));
    }
    return result.join('');
}

function enableAutoHiddenAfterTransitionEnd(el) {
    el.addEventListener('transitionend', function () {
        if (this.classList.contains('fadeOut')) {
            this.classList.add('hidden');
        }
    });
}
//连接之后无摄像头和麦克风的二维码
//android版手机助手的二维码绘制
function renderHelperQrcode(qrCanvas, qrRoom, qrMaster) {
    var myValue = location.origin + '/android/?room=' + qrRoom + '&master=' + qrMaster;
    return qr.canvas({
        canvas: qrCanvas,
        value:  myValue,
        size:   8
    });
}

//未连入新房间的二维码
function renderRoomQrcode(qrCanvas,qrRoom, qrPeer) {
    var joinValue = location.origin + '/android/?room=' + qrRoom + '&peer=' + qrPeer;
    return qr.canvas({
        canvas: qrCanvas,
        value:  joinValue,
        size:   8
    });
}

//自定义消息框，参数为需提示的消息
function showAlert(aleString) {
    var d = dialog({
        content: aleString
    });
    d.show();
    setTimeout(function () {
        d.close().remove();
    }, 2500);
}

