var net = require('net');

var auth = require('./private/auth.json');

var messageCounter = 0;
var savedMessageCounter = 0;
var started_at = Date.now();
var channels_active = [];

var connection = null;
r = require('rethinkdb');
r.connect({ host: 'localhost', port: 28015 }, function (err, conn) {
  if (err) throw err;
  connection = conn;

  started_at = Date.now();

  r.db('test').tableCreate('messages').run(conn, function (err, res) {
    if (err) {
      if (err.msg.indexOf('already exists') < 0) {
        throw err;
      }
    } else {
      console.log(res);
    }
  });

  // connect to twitch irc
  var client = net.connect({ host: auth.host, port: auth.port });

  client.on('connect', function () {
    console.log("connected to %s", auth.host);

    // authenticate with twitch
    console.log("sending twitch oauth authentication...");
    client.write("PASS " + auth.oauth + "\n");
    client.write("NICK " + auth.nick + "\n");
  });

  var dataCounter = 0;
  var buffer = "";
  var joined = false;

  client.on('data', function (data) {
    dataCounter++;
    var str = data.toString('utf8');

    //console.log("received data: %s", str);

    // parse the message
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

      auth.channels.forEach(function (val, ind, arr) {
        var channel = val[0] == '#' ? val : ('#' + val);
        client.write("JOIN " + channel + "\n");
      });
    }
  });

  client.on('end', function () {
    // exit (and let pm2/forever restart for a reconnection )
    console.log("disconnected from %s", auth.host);
    process.exit(1); // exit failure
  });

  /*
  r.db('test').tableCreate('tv_shows').run(conn, function (err, res) {
    if (err) throw err;
    console.log(res);

    var doc = {
      name: "Star Trek TNG"
    };

    r.table('tv_shows').insert(doc).run(conn, function (err, res) {
      if (err) throw err;
      console.log(res);
    });
  });
  */

});

function handleMessage (client, msg) {
  switch (msg.command.trim()) {
    case 'PING':
        client.write("PONG " + auth.host + "\n");
        console.log("PONG!");
      break;
    case 'PRIVMSG':
        messageCounter++;

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
        r.table('messages').insert(doc).run(connection, function (err, res) {
          if (err) {
            throw err;
          }
          savedMessageCounter++;
          if (channels_active.indexOf(doc.channel) == -1) {
            channels_active.push(doc.channel);
          }
          //console.log("saved message to database successfully from user: %s", user);
        });
      break;
  };
};

var LogTimer = {
  max: 30000,
  next: 2000,
  plus: 1000,
  update: function () {
    this.next = Math.min( this.max, this.next + this.plus);
  }
};

function logger () {
  console.log("===============");
  console.log("started at [%s]", new Date(started_at));
  console.log("[%s / %s] messages saved", savedMessageCounter, messageCounter);
  console.log("messages lost: [%s]", messageCounter - savedMessageCounter);
  console.log("channels active: %s", channels_active.join());
  console.log("===============");

  channels_active = [];
  LogTimer.update();
  setTimeout(logger, LogTimer.next);
};
logger();

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
  } else { // <middle> <params> found
  }

  // return a message object
  return {
    raw: input,
    prefix: prefix,
    command: command,
    params: params
  }
};
