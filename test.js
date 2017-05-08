var tl = require('./index.js')

var MongoClient = require('mongodb').MongoClient
var mongodb_url = process.env.MONGODB_URL || 'mongodb://localhost:27017/twitch-logger'

var fs = require('fs')

var auth
try {
  auth = require('./auth.json')
} catch (err) {
  auth = {}
}

var opts = {
  host: process.env.HOST || auth.host || 'irc.freenode.net',
  port: process.env.PORT || auth.port || 6667,
  nick: process.env.NICK || auth.nick,
  pass: process.env.PASS || auth.pass
}

MongoClient.connect(mongodb_url, function (err, mongodb) {
  if (err) throw err
  console.log('Connected successfully to mongodb')

  console.log('Starting Twitch Logger...')
  var logger = tl.start(opts)

  logger.on('irc-message', function (doc) {
    // skip if this collection is not int he collectionsToSave mapping
    var channel = doc.channel || 'unknown'
    if (channel[0] === '#') channel = channel.slice(1)
    if (collectionsToSave.indexOf(channel.trim().toLowerCase()) === -1) return undefined

    saveDocument(mongodb, 'irc_messages', doc)
  })

  logger.on('chat', function (doc) {
    // skip if this collection is not int he collectionsToSave mapping
    var channel = doc.channel || 'unknown'
    if (channel[0] === '#') channel = channel.slice(1)
    if (collectionsToSave.indexOf(channel.trim().toLowerCase()) === -1) return undefined

    saveDocument(mongodb, 'channel_' + channel, doc)
  })
})

var collectionsToSave = [
  'sirpinkleton00',
  'strippin',
  'dexbonus',
  'netglow',
  'sjow',
  'sodapoppin',
  'totalbiscuit',
  'twitchpresents',
  'twitch',
  'twitchplayspokemon',
  'dexteritybonus',
  'dizzykitten',
  'athenelive',
  'bobross',
  'cryaotic',
  'esl_sc2',
  'mcill'
]

var collectionBuffers = {}

function saveDocument (mongodb, collection, docs) {
  if (docs instanceof Array === false) docs = [docs]

  collectionBuffers[collection] = collectionBuffers[collection] || (function () {
    var _collection = mongodb.collection(collection)
    var _docs = []
    var _lastSaveTime = Date.now()
    var _interval = 1000
    var _timeout = undefined

    var _trigger = function () {
      var now = Date.now()
      var delta = now - _lastSaveTime
      if (delta > _interval && _docs.length > 0) {
        _lastSaveTime = now
        var documents = _docs
        _docs = []
        _collection.insertMany(documents, function (err, result) {
          if (err) throw err
          if (result.ops.length !== documents.length) {
            console.log('documents saved length mismatch [' + (new Date()) + ']')
          }
        })
      }
    }

    return {
      add: function (doc) {
        _docs.push(doc)
        _trigger() // bulk save every _interval seconds
      }
    }
  })()

  docs.forEach(function (doc) {
    collectionBuffers[collection].add(doc)
  })
}
