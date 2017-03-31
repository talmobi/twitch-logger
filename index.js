var net = require('net') // connect to IRC server (TCP)
var fs = require('fs')
var parseIRCMessage = require('irc-message').parse

var dgram = require('dgram') // send and forget chat messages on local port
                             // for local processes that want to listen for live events

function log () {
  if (process.env.SILENT || process.env.silent) return undefined
  var _args = arguments
  var args = Object.keys( _args ).map(function ( key ) {
    return _args[key]
  })
  args[0] = '[twitch-logger]: ' + args[0]
  // args[args.length - 1] = String(args[args.length - 1]).trim()
  console.log.apply(this, args)
}

function start (opts) {
  if (typeof opts === 'string') { // assume host string
    opts = { host: opts }
  }
  if (!opts.host) {
    throw new Error('No irc host specified (eg: irc.freenode.net)')
  }

  if (!opts.port) opts.port = 6667
  if (!opts.nick) opts.nick = 'guest' + (Date.now()).toString(16).slice(5)

  var _udpSocket
  var _udpPort = process.env.UDP_PORT || 40400
  var _udpAddress = process.env.UDP_ADDRESS || process.env.UDP_HOST || '127.0.0.1'
  if (!process.env.DISABLE_UDP) {
    _udpSocket = dgram.createSocket('udp4')
  }

  var _channels = []
  var _channelsActiveAt = {}
  var _connectedSuccessfully = false
  var _reconnectionInterval = 1000 * 60

  var _reconnectionTick = function () {
    if (_connectedSuccessfully) {
      fs.readFile('./channels.txt', function (err, data) {
        setTimeout(_reconnectionTick, 1000)

        if (!err && data) {
          var now = Date.now()
          var newChannels = data
                              .toString('utf8')
                              .trim()
                              .split(/[\s,#]+/g)
                              .filter(function (channel) {
                                return channel.trim().length > 2
                              })

          newChannels.forEach(function (channel) {
            var isActive = (
              _channelsActiveAt[channel] &&
              (now - _channelsActiveAt[channel]) < _reconnectionInterval
            )
            if (!isActive) {
              _channelsActiveAt[channel] = now
              var hashChannel = (channel[0] === '#') ? channel : ('#' + channel)
              log(' -- joining channel: ' + hashChannel)
              client.write('JOIN ' + hashChannel + '\n')
            }
          })

          // part from channels no longer monitored
          _channels.forEach(function (channel) {
            if (newChannels.indexOf(channel) === -1) {
              var hashChannel = (channel[0] === '#') ? channel : ('#' + channel)
              log(' -- parting from channel: ' + hashChannel)
              client.write('PART ' + hashChannel + '\n')
            }
          })

          _channels = newChannels
        }
      })
    }
  }

  // connect to twitch irc
  log('connecting to ' + opts.host + ':' + opts.port)
  var client = net.connect({
    host: opts.host,
    port: opts.port
  })

  client.on('connect', function () {
    log("connected to %s", opts.host)

    // authenticate with twitch
    log('authenticating with twitch using oauth...')
    opts.pass && client.write('PASS ' + opts.pass + '\n')
    opts.nick && client.write('NICK ' + opts.nick + '\n')
  })

  var dataCounter = 0
  var buffer = ''

  client.on('data', function ( data ) {
    dataCounter++
    // log("received data.length: %s", data.toString('utf8').length)

    // push to buffer
    buffer += data.toString('utf8')

    var lines = buffer.split('\n') // split into lines
    buffer = lines.pop() // rewind buffer
    lines.forEach(function (line) { // process complete lines
      log("irc message: %s", line)
      handleMessage(line)
    })
  })

  client.on('end', function () {
    log("disconnected from %s", opts.host)
  })

  function handleMessage (line) {
    var msg = parseIRCMessage(line)

    var msgDoc = Object.assign({}, msg, { created_at: Date.now() })
    emit('irc-message', msgDoc)

    switch (msg.command) {
      case '001': // welcome message
        log('Connected Successfully.')
        _connectedSuccessfully = true
        setTimeout(function () {
          _reconnectionTick()
        }, 1000)
        break

      case 'JOIN':
        var user = msg.prefix.split(/[!@]/g)[0]
        if (user === opts.nick) {
          log(' >> joined channel: ' + msg.params[0])
        }
        break

      case 'PART':
        if (user === opts.nick) {
          log(' << parted channel: ' + msg.params[0])
        }
        break

      case 'PING':
        client.write("PONG " + opts.host + "\n")
        log("PONG")
        break

      case 'PRIVMSG':
        var channel = msg.params[0]
        var message = String(msg.params[msg.params.length - 1]).trim()
        var user = msg.prefix.split(/[!@]/g)[0]

        // document format
        var doc = {
          channel: channel,
          user: user,
          message: message,
          created_at: Date.now()
        }

        _channelsActiveAt[doc.channel] = Date.now()

        // log(doc.channel + ' ' + doc.user + ': ' + doc.message)
        emit('chat', doc)
        break

      default: // ignore
    }
  }

  function stop () {
    _udpSocket && _udpSocket.close()
    client.end()
  }

  var _listeners = {}
  function emit (evt, data) {
    _listeners[evt] &&  _listeners[evt].forEach(function (callback) {
      callback(data)
    })

    try {
      var packet = JSON.stringify({
        evt: evt,
        data: data
      })
      _udpSocket && _udpSocket.send(packet, _udpPort, _udpAddress, function (err) {
        if (err) throw err
        log(' >> >> udp packet sent of size: ' + packet.length)
      })
    } catch (err) {
      throw err
    }
  }

  function on (evt, callback) {
    _listeners[evt] = _listeners[evt] || []
    _listeners[evt].push(callback)

    return function off () {
      var i = _listeners[evt].indexOf(callback)
      _listeners[evt].splice(i, 1)
    }
  }

  return {
    on,
    stop
  }
}

module.exports = {
  start: start
}
