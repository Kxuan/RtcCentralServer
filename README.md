# AppRTC - NodeJS implementation of the Google WebRTC Demo

## About
RtcCentralServer contains full PC Browser Codes and provider room connection information for clients. It supports multi people video chat in same time.

## Setup
Setting up the environment just requires the following:

```
git clone https://github.com/Kxuan/RtcCentralServer.git ./RtcCentralServer
cd ./RtcCentralServer
npm install
cd install
npm install
```

## Configuration File
The server will find the configure file from these place:
- argv[1]
- $(PWD)/config.json
- $(PWD)/central.json
- __dirname/config.json
- __dirname/central.json
- /etc/apprtc/central.json

If the server can not find any config file, it will start the installer(./install), you can config the application in web page. Then, save config file and restart the server.
   

## Running the AppRTC Node Server
Just use node to execute "start.js"
```
node ./start.js [/path/to/config.json]
```
