require('debug').enable('*');
//Load configuration
var fs = require('fs');
var path = require('path');
var util = require('util');
var debug = require('debug')('launcher');

function tryConfigFile(filename) {
    return function () {
        return new Promise(function (resolve, reject) {
            debug("try config file: ", filename);
            fs.readFile(filename, {
                encoding: 'utf-8'
            }, function (err, content) {
                if (err) {
                    debug("Error: ", err.message);
                    reject(err);
                    return;
                }

                var config;
                try {
                    config = JSON.parse(content);
                } catch (ex) {
                }

                if (!config) {
                    debug("Error: Fail to parse file content as JSON");
                    reject();
                    return;
                }

                resolve(config);
            });
        });
    }
}
function findConfigFile() {
    var configFromArgv;
    if (process.argv[2]) {
        configFromArgv = tryConfigFile(process.argv[2])();
    } else {
        configFromArgv = Promise.reject();
    }
    configFromArgv
        .catch(tryConfigFile(path.join(process.cwd(), 'config.json')))
        .catch(tryConfigFile(path.join(process.cwd(), 'central.json')))
        .catch(tryConfigFile(path.join(__dirname, 'config.json')))
        .catch(tryConfigFile(path.join(__dirname, 'central.json')))
        .catch(tryConfigFile('/etc/apprtc/central.json'))
        .then(startApplication, startInstaller)

}
function startInstaller() {
    debug("Cannot find any config file. Start installer");
    require('./install');
}
function startApplication(config) {
    debug("Start application ");
    global.config = config;
    if (config.debug) {
        var debugCfg = config.debug;
        var libDebug = require('debug');
        if (typeof debugCfg == "string") {
            libDebug.enable(debugCfg);
        } else {
            if (debugCfg.redirect) {
                var stream = global.logStream = fs.createWriteStream(debugCfg.output, {
                    flags: 'a',
                    mode:  0x180//-rw------- 0600
                });

                var oldLog = libDebug.log;
                libDebug.log = function () {
                    stream.write(util.format.apply(this, arguments) + '\n');
                    return oldLog.apply(this, arguments);
                }
            }
            if (debugCfg.filters) {
                libDebug.enable(debugCfg.filters);
            }
        }
    }
    //Start the server
    require('./bin/www');
}

findConfigFile();