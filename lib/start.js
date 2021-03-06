/**
 * @file 启动edp web
 * @author errorrik[errorrik@gmail.com]
 */

var express = require('express');
var edp = require('edp-core');
var path = require('path');
var fs = require('fs');
var util = require('./util');

/**
 * 机器ip
 *
 * @inner
 * @type {string}
 */
var ip = (function() {
    var ifaces = require( 'os' ).networkInterfaces();
    var defultAddress = '127.0.0.1';
    var ip = defultAddress;

    function x( details ) {
        if (ip === defultAddress && details.family === 'IPv4') {
            ip = details.address;
        }
    }

    for ( var dev in ifaces ) {
        ifaces[ dev ].forEach( x );
    }

    return ip;
})();

/**
 * 启动edp web
 *
 * @param {number=} port 启动端口号
 */
exports = module.exports = function (port) {
    var app = express();
    app.use(express.static(__dirname + '/../public'));

    var files = fs.readdirSync(__dirname);
    files.forEach(function (file) {
        var dir = path.resolve(__dirname, file);
        var indexFile = path.resolve(dir, 'index.js');
        if (fs.statSync(dir).isDirectory() && fs.existsSync(indexFile)) {
            var indexModule = require(indexFile);
            if (typeof indexModule.init === 'function') {
                indexModule.init(app);
            }
        }
    });

    var server = app.listen(port);
    var io = startWebSocketServer(server);

    extensionInit(app, io);

    edp.log.info('Edp Web start.');
    edp.log.info('Visit ' + underlineString('http://localhost:' + port)
        + ' or ' + underlineString('http://' + ip + ':' + port));
    edp.log.info('To stop, Press Ctrl+C');
};

/**
 * 对输出命令行的字符串添加下划线
 *
 * @inner
 * @param {string} str 源字符串
 * @return {string}
 */
function underlineString(str) {
    return '\033[4m'+ str + '\033[0m';
}

/**
 * 初始化extension包的定制扩展
 *
 * @inner
 * @param {express} app Express服务实例
 * @param {socket.io} io Socket.io服务实例
 */
function extensionInit(app, io) {
    var extensionDirs = util.getExtensionDirs();
    extensionDirs.forEach(function (dir) {
        var pkgName = path.basename(dir);

        // ln path "/_static/edp-xxx" to "package/web/public"
        app.use('/_static/' + pkgName, express.static(dir + '/web/public'));

        // launch extension init
        var indexModuleFile = path.resolve(dir, 'web', 'lib', 'index.js');
        if (fs.existsSync(indexModuleFile)) {
            var mod = require(indexModuleFile);
            mod(app, io);
        }
    });
}

/**
 * 启动Socket.io服务
 *
 * @param {http.Server} httpServer http服务实例
 * @return {socket.io}
 */
function startWebSocketServer(httpServer) {
    var io = require('socket.io')(httpServer);

    io.on('connection', function (socket) {
        socket.on('launch', function (data) {
            var cmd = data.cmd.split(' ');
            var cwd = data.cwd;

            if (cmd[0] !== 'edp') {
                socket.emit('cmd-stderr', 'Only `edp` command is allowed.');
                socket.emit('cmd-exit');
                return;
            }

            // process.env.CLICOLOR = '1';
            // process.env.LS_OPTIONS='--color=auto';
            var launcher = require('child_process').spawn(
                cmd[0],
                cmd.slice(1) || [],
                {
                    env: process.env,
                    cwd: cwd
                }
            );

            launcher.stdout.setEncoding('UTF-8');
            launcher.stdout.on('data', function (data) {
                socket.emit('cmd-stdout', data);
            });


            launcher.stderr.setEncoding('UTF-8');
            launcher.stderr.on('data', function (data) {
                socket.emit('cmd-stderr', data);
            });

            launcher.on('close', function() {
                socket.emit('cmd-exit');
            });
        });


        // 广播信息给除当前用户之外的用户
        // socket.broadcast.emit('user connected');
        // 广播给全体客户端
        // io.sockets.emit('all users');
    });

    return io;
}

