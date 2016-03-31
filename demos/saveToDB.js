var messageCounter = 0;
var savedMessages = {
  rethinkdb: 0,
  mongodb: 0
};
var started_at = Date.now();
var channels_active = {};

var tl = require('../index.js');

var db_name = "twitch_logger";

// start rethinkdb
var rethinkdb_connection = null;
r = require('rethinkdb');
r.connect({ host: 'localhost', port: 28015, db: db_name }, function (err, conn) {
  if (err) throw err;
  rethinkdb_connection = conn;

  r.dbCreate(db_name).run(conn, function (err, res) {
    if (err) {
      // ignore (probably since db already exists)
    };

    r.db(db_name).tableCreate('messages').run(conn, function (err, res) {
      if (err) {
        if (err.msg.indexOf('already exists') < 0) {
          throw err;
        }
      } else {
        // table already exists - that's fine -> continue
        console.log(res);
      }
    });
  });
});

// start mongodb
var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var url = "mongodb://localhost:27017/" + db_name;
var mongodb_connection = null;
MongoClient.connect(url, function (err, db) {
  if (err) throw err;
  mongodb_connection = db;
});

var auth = require('../private/auth.json');
tl.start(auth, function (err, doc) {
  if (err) {
    throw err;
  }

  messageCounter++;
  /* format
  var doc = {
    channel: channel,
    user: user,
    message: chatMessage,
    created_at: Date.now()
  };*/

  // save to rethinkdb
  r.db(db_name).table('messages').insert(doc).run(rethinkdb_connection, function (err, res) {
    if (err) {
      throw err;
    } else {
      savedMessages.rethinkdb++;
    }
  });

  // save to mongodb
  mongodb_connection.collection('messages').insert(doc, function (err, res) {
    if (err) {
      throw err;
    } else {
      savedMessages.mongodb++;
    }
  });
});

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
  console.log("%s messages received", messageCounter);
  console.log("rethinkdb messages lost: [%s]", messageCounter - savedMessages.rethinkdb);
  console.log("mongodb messages lost: [%s]", messageCounter - savedMessages.mongodb);
  console.log("channels active: %s", Object.keys(channels_active));
  console.log("===============");

  channels_active = {};

  channels_active = [];
  LogTimer.update();
  setTimeout(logger, LogTimer.next);
};
logger();
