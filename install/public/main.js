var data = {
    "debug":  {
        redirect: false,
        output:   '',
        filters:  [
            {enable: true, rule: '*'},
            {enable: false, rule: 'express:*'}
        ]
    },
    "server": {
        "listen":           443,
        "origin":           "apprtc.ixuan.org:443",
        "https":            true,
        "key":              "/data/certs/apprtc.key",
        "cert":             "/data/certs/apprtc.crt",
        "ca":               [],
        "handshakeTimeout": 10000
    },
    "turn":   {
        "static_key": "4080218913",
        "servers":    [
            "ixuan.org:3478",
            "ixuan.org:3479"
        ]
    },
    "wss":    {
        "server": "apprtc.ixuan.org:8089"
    }
};


function openSaveModal(closable, title, text) {
    document.body.classList.add('modal-open');
    var modal = document.getElementById('myModal');
    var footerEl = modal.querySelector('.modal-footer');
    var bodyEl = modal.querySelector('.modal-body');
    var titleEl = modal.querySelector('.modal-title');
    modal.classList.add('show');

    if (closable) {
        footerEl.classList.remove('hide');
    } else {
        footerEl.classList.add('hide')
    }
    titleEl.innerText = title;
    bodyEl.innerText = text;
    +modal.clientHeight;
    modal.classList.add('in');
}

function closeSaveModal() {
    document.body.classList.remove('modal-open');
    var modal = document.getElementById('myModal');
    modal.classList.remove('show');
}

function saveConfig() {
    var configFile = {
        debug:  normalizeDebugConfig(),
        server: data.server,
        turn:   data.turn,
        wss:    data.wss
    };
    var xhr = new XMLHttpRequest();
    xhr.open("PUT", '/save');
    xhr.onload = function (res) {
        var r = JSON.parse(xhr.responseText);
        if (r.error) {
            openSaveModal(true, "配置失败", r.error);
        } else {
            openSaveModal(false, "配置成功", '配置文件已成功保存在：' + r.filename + "\n如需重新配置服务器，请删除该文件并重启服务器，服务器会自动进入安装模式\n\n现在可以重新启动服务器");
        }
    };
    xhr.send(JSON.stringify(configFile));
    openSaveModal(false, "保存配置", "正在保存配置");
}
function normalizeDebugConfig() {
    var filter = '';
    var debugCfg = data['debug'];
    filter = debugCfg.filters.map(function (cfg) {
        return cfg.enable ? cfg.rule : '-' + cfg.rule;
    }).join(',');

    return {
        redirect: debugCfg.redirect,
        output:   debugCfg.output,
        filters:  filter
    }
}
new Vue({
    el:   '#debug',
    data: data['debug']
});
new Vue({
    el:   '#server',
    data: data['server']
});
new Vue({
    el:   '#turn',
    data: data['turn']
});

new Vue({
    el:   '#wss',
    data: data['wss']
});
