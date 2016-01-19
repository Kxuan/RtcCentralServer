var fs = require('fs');
var os = require('os');
var path = require('path');
var util = require('util');
var express = require('express');
var open = require('open');
var debug = require('debug')('installer');
var app = express();
app.use('/', express.static(path.join(__dirname, 'public')));

app.put('/save', function (req, res, next) {
    var length = +req.header('Content-Length');
    if (isNaN(length)) {
        next(403);
        return;
    }
    var postData = new Buffer(length),
        ptr      = 0;
    req.on('data', function (chunk) {
        chunk.copy(postData, ptr);
        ptr += chunk.length;
        if (ptr == chunk.length) {
            testConfig(postData)
                .then(writeConfig(postData))
                .then(function (filename) {

                    res.send({
                        error:    null,
                        filename: filename
                    });
                })
                .catch(function (err) {
                    res.send({
                        error: err.message
                    })
                });
        }
    });
});
app.listen(function (err) {
    if (err) {
        debug("Can not listen any tcp port. Installer abort");
        process.exit(1);
    }
    var address = this.address();
    debug("Installer is Listening on %d", address.port);
    var url = getLocalUrl(address.port);
    if (!url) {
        debug("Can not found any local address. You should try it yourself.");
        return;
    }
    open(url, null, function (err) {
        if (err instanceof Error) {
            debug("Installer can not open your default web browser. use your web browser to access these addresses:");
            dumpAccessURL(address.port);
        }
    });
});
function getLocalUrl(port) {
    var url = null;
    var ifs = os.networkInterfaces();
    for (var ifname in ifs) {
        for (var i = 0; i < ifs[ifname].length; i++) {
            var addr = ifs[ifname][i];
            switch (addr.family) {
                case 'IPv4':
                    return util.format("http://%s:%d", addr.address, port);
                    break;
                case 'IPv6':
                    url = util.format("http://[%s]:%d", addr.address, port);
                    break;
            }
        }
    }
    return url;
}

function dumpAccessURL(port) {
    var os = require('os');
    var ifs = os.networkInterfaces();
    for (var ifname in ifs) {
        ifs[ifname].forEach(function (addr) {
            switch (addr.family) {
                case 'IPv4':
                    debug("http://%s:%d", addr.address, port);
                    break;
                case 'IPv6':
                    debug("http://[%s]:%d", addr.address, port);
                    break;
            }
        })
    }
}
function tryConfigFile(filename, data) {
    return function () {
        return new Promise(function (resolve, reject) {
            fs.writeFile(filename, data, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(filename);
                }
            });
        });
    }
}

function writeConfig(data) {
    return function () {
        return Promise.reject()
            .catch(tryConfigFile(path.join(__dirname, '..', 'config.json'), data))
            .catch(tryConfigFile(path.join(__dirname, '..', 'central.json'), data))
            .catch(tryConfigFile('/etc/apprtc/central.json', data))
    }
}
function checkFileReadable(filename) {
    return function () {
        return new Promise(function (resolve, reject) {
            fs.access(filename, fs.R_OK, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        });
    }
}

function checkFileWritable(filename) {
    return function () {
        return new Promise(function (resolve, reject) {
            fs.appendFile(filename, new Buffer(0), function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        });
    }
}
function testConfig(rawData) {
    var config;
    try {
        config = JSON.parse(rawData);
    } catch (ex) {
    }
    if (!config) {
        return Promise.reject(new Error("Parse JSON Error"));
    }
    var p = Promise.resolve();

    if (config.debug.redirect) {
        p = p.then(checkFileWritable(config.debug.output));
    }
    if (config.server.https) {
        p = p.then(checkFileReadable(config.server.key));
        p = p.then(checkFileReadable(config.server.cert));
        config.server.ca.forEach(function (filename) {
            p = p.then(checkFileReadable(filename));
        });
    }
    return p;
}