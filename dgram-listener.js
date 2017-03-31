var dgram = require('dgram')

var _udpSocket = dgram.createSocket('udp4')

_udpSocket.on('message', function (msg, rinfo) {
  var packet = JSON.parse(msg)
  switch (packet.evt) {
    case 'chat':
      var doc = packet.data
      console.log(doc.channel + ' ' + doc.user + ': ' + doc.message)
      break

    default: // ignore
  }
})

_udpSocket.on('listening', function () {
  var address = _udpSocket.address()
  console.log('udp socket listening at %s:%s', address.address, address.port)
})

_udpSocket.bind({
  port: 40400,
  address: '127.0.0.1'
})

