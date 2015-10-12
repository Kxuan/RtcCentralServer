var express = require('express');
var path = require('path');
var crypto = require('crypto');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'public/html'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.text());
app.use(cookieParser());
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
var hmac = function (key, content) {
    var method = crypto.createHmac('sha1', key);
    method.setEncoding('base64');
    method.write(content);
    method.end();
    return method.read();
};

app.get('/turn', function (req, resp, next) {

    var query = req.query;
    var key = '4080218913'; // 这里的 key 是事先设置好的, 我们把他当成一个常亮来看, 所以就不从HTTP请求参数里读取了
    resp.header("Access-Control-Allow-Origin", "*");

    if (!query['username']) {
        return resp.send({'error': 'AppError', 'message': 'Must provide username.'});
    } else {
        var time_to_live = 600;
        var timestamp = Math.floor(Date.now() / 1000) + time_to_live;
        var turn_username = timestamp + ':' + query['username'];
        var password = hmac(key, turn_username);
        resp.json({
            username: turn_username,
            password: password,
            ttl: time_to_live,
            "uris": [
                "turn:apprtc.ixuan.org:3478?transport=udp",
                "turn:apprtc.ixuan.org:3478?transport=tcp",
                "turn:apprtc.ixuan.org:3479?transport=udp",
                "turn:apprtc.ixuan.org:3479?transport=tcp"
            ]
        });
    }

});
// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
