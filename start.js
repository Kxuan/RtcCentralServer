//Load configuration
var fs = require('fs');

var configFile = process.argv[2];
if (!configFile) {
    console.error("Usage: node start.js <configuration file>");
    process.exit(1);
}
global.config = JSON.parse(fs.readFileSync(configFile));
if (config.debug)
    require('debug').enable(config.debug);


//Start the server
require('./bin/www');