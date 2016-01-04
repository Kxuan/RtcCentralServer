# AppRTC - NodeJS implementation of the Google WebRTC Demo

## About
AppRTC-node-server is a straight port of the AppRTC Python Server from the Google WebRTC Demo to run entirely in the NodeJS environment.

## Notes
This still a work in progress. We are in the process of cleaning up the code and making several enhancements:

1. Implementing as a node module so you can easily adapt to your project
2. Refactoring the code to optimize for NodeJS
3. Implementing options for memcache or redis cluster for scaling video chat sessions
4. Providing more documentation and extensibility
5. Adding a built-in Turn Server for better WebRTC portability


## Setup
Setting up the environment just requires the following:

```
git clone https://github.com/Kxuan/apprtc-node-server.git ./apprtc-node-server
cd ./apprtc-node-server
npm install
```

## Configuration File
You need a configuration file to start the server.
The example configuration file:
```json
{
  "debug": "*",
  "server": {
    "listen": 3000,
    "https": true,
    "key": "/path/to/unencrypted/rsa/private/key",
    "cert": "/path/to/unencrypted/x509certificate",
    "ca": [
      "/path/to/unencrypted/CA/certificate"
    ],
    "handshakeTimeout": 10000
  }
}
```

## Running the AppRTC Node Server
The apprtc-node-server uses ExpressJS. To run the node server after setup just execute:

```
node ./start.js /path/to/configuration/file
```

Navigate to `https://localhost:3000` to run the WebRTC Demo