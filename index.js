var net = require('net');

function start (opts, callback) {
  if (!opts || typeof opts !== 'object' || !opts.host || !opts.port ||
      !opts.oauth || !opts.nick) {
    return new Error("opts error. See: { host, port, channels, oauth, nick }" );;
  }

  // connect to twitch irc
  var client = net.connect(opts);

  client.on('connect', function () {
    console.log("connected to %s", opts.host);

    // opts.nticate with twitch
    console.log("sending twitch oauth.authentication...");
    client.write("PASS " + opts.oauth + "\n");
    client.write("NICK " + opts.nick + "\n");
  });

  var dataCounter = 0;
  var buffer = "";
  var joined = false;

  client.on('data', function (data) {
    dataCounter++;
    var str = data.toString('utf8');

    //console.log("received data: %s", str);

    // split data into lines of text
    buffer += str;
    while (buffer.indexOf('\n') >= 0) {
      var newLineIndex = buffer.indexOf('\n');

      var line = buffer.substring(0, newLineIndex);
      // rewind the buffer
      buffer = buffer.substring(newLineIndex + 1);

      // parse the message
      var message = buildIRCMessage( line );
      handleMessage(client, message);
    }

    if (!joined) {
      joined = true;
      console.log("joining channels..");

      opts.channels.forEach(function (val, ind, arr) {
        var channel = val[0] == '#' ? val : ('#' + val);
        client.write("JOIN " + channel + "\n");
      });
    }
  });

  client.on('end', function () {
    // exit (and let pm2/forever restart for a reconnection )
    console.log("disconnected from %s", opts.host);
    callback(new Error("disconnected from server - process exiting soon"), null);
    setTimeout(function () {
      stop();
    }, 1000 * 30);
  });

  function handleMessage (client, msg) {
    switch (msg.command.trim()) {
      case 'PING':
        client.write("PONG " + opts.host + "\n");
        console.log("PONG!");
        break;
      case 'PRIVMSG':
        var chatMessageIndexOf = msg.params.indexOf(':');
        var channel = msg.params.slice(0, chatMessageIndexOf).trim();
        var chatMessage = msg.params.slice(chatMessageIndexOf + 1).trim();
        var user = msg.prefix.user.slice(1).trim();

        // save to database
        var doc = {
          channel: channel,
          user: user,
          message: chatMessage,
          created_at: Date.now()
        };

        callback(null, doc);
        break;
    };
  };

  function buildIRCMessage (input) {
    /** RFC 1459, 2.3.1
     * <message>  ::= [':' <prefix> <SPACE> ] <command> <params> <crlf>
     * <prefix>   ::= <servername> | <nick> [ '!' <user> ] [ '@' <host> ]
     * <command>  ::= <letter> { <letter> } | <number> <number> <number>
     * <SPACE>    ::= ' ' { ' ' }
     * <params>   ::= <SPACE> [ ':' <trailing> | <middle> <params> ]
     * <middle>   ::= <Any *non-empty* sequence of octets not including SPACE
     *                or NUL or CR or LF, the first of which may not be ':'>
     *                <trailing> ::= <Any, possibly *empty*, sequence of octets not including
     *                                NUL or CR or LF>
     *                                <crlf>     ::= CR LF
     *                                */

    var str = input.trim();

    var prefix = null; // optional
    var command = null; // required
    var params = null; // required

    //parse prefix
    if (str[0] === ':') { // optional <prefix> found
      var l = prefixString = str.slice(0, str.indexOf(' ')).trim();
      var indexOfUser = l.indexOf('!');
      var indexOfHost = l.indexOf('@');

      var host = ''; // optional
      if (~indexOfHost) {
        host = l.slice( indexOfHost );
        l = l.slice(0, -host.length);
      }

      var user = ''; // optional
      if (~indexOfUser) {
        user = l.slice( indexOfUser );
        l = l.slice(0, -user.length);
      }

      var name = ''; // either <servername> or <nick>
      name = l.slice(1);

      prefix = {
        name: name,
        user: user,
        host: host,
        //data: prefixString
      }

      str = str.slice(prefixString.length); // cut out the prefix part
    } // eof prefix parse

    // str is now assumed to be without the prefix information
    str = str.trim();
    var indexOfParams = str.indexOf(' ');
    var command = str.slice(0, indexOfParams).trim();
    var params = str.slice(indexOfParams).trim();

    // check optionals
    if (params[0] === ':') { // <trailing> found
      // ignore it
    } else { // <middle> <params> found
      // ignore it
    }

    // return a message object
    return {
      raw: input,
        prefix: prefix,
        command: command,
        params: params
    }
  };

  function stop () {
    callback(new Error("disconnected from server - process exiting"), null);
    client.end();
  };

  return function () {
    stop();
  };
};

module.exports = {
  start: start
};
