const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const pug = require('pug');
const crypto = require('crypto');

require('dotenv').config();

const db = require('nedb');
const store = new db({
  filename: process.env.DATABASE_FILE || "database.txt",
  autoload: true
});

function oneMonthAgoMillis() {
  let date = new Date();
  if (date.getMonth() == 0) { // January
    date.setFullYear(date.getFullYear() - 1);
  }
  date.setMonth((12 + date.getMonth() - 1) % 12);
  return date.getTime();
}

store.persistence.setAutocompactionInterval(1000 * 60 * 10); // 10 minutes

function clearExpiredPolls() {
  store.remove({
    created: {
      $lt: oneMonthAgoMillis()
    }
  }, {
    multi: true
  }, function (err, count) {
    if (err) {
      console.error(err);
      console.error("Could not remove old polls!! ");
    } else {
      console.log(`Pruned ${count} expired polls`);
    }
  });
}

setInterval(clearExpiredPolls, 1000 * 60 * 60 * 6); // 6 hours
clearExpiredPolls();

const app = express();
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'private'));
const server = require('http').createServer(app);
const io = require('socket.io')(server);
app.use(express.json());

const environment = process.env.NODE_ENVIRONMENT;
let submitMiddleware;

// slow mode for production use
if (environment == 'production') {
  submitMiddleware = () => rateLimit({
    max: process.env.RATE_LIMIT_SUBMISSIONS || 1,
    windowMs: process.env.RATE_LIMIT_WINDOW_MILLIS || (1000 * 60 * 1), // 1 minute
    message: {
      success: false,
      reason: 'Too many submission attempts!'
    }
  });
} else {
  submitMiddleware = function () {
    return (req, res, next) => {
      next();
    };
  };
  app.get('/poll', (req, res) => {
    db.find({}, (err, docs) => {
      if (err) {
        res.status(500).json(err);
      } else {
        res.json(docs);
      }
    });
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'index.html'));
});

app.get('/poll/new', (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'create.html'));
});

function randomLetters(count) {
  return crypto.randomBytes(2 << (count + 1))
    .toString('base64')
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[=+\/]/g, '')
    .substring(0, count);
}

function generateID() {
  return randomLetters(3) + '-' + Math.round(Math.random() * 1000) + '-' + randomLetters(3);
}

function generateSecret() {
  return randomLetters(6) + '-' + randomLetters(6);
}

app.post('/poll', (req, res) => {
  let created = Date.now();
  let id = generateID();
  let master_key = generateSecret();
  store.insert({
    ...req.body,
    created: created,
    pollID: id,
    responses: [],
    locked: false,
    master_key: master_key
  }, (err, doc) => {
    if (err) {
      res.status(500).json({
        success: false,
        err: err
      });
    } else if (doc === null) {
      res.status(404).json({
        success: false,
        reason: `Could not find the poll ${id}`
      });
    } else {
      res.json({
        pollID: id,
        created: created,
        success: true,
        master_key: master_key
      });
    }
  });
});

app.get('/poll/:id', (req, res) => {
  let id = req.params.id;
  store.findOne({
    pollID: id || -1
  }, (err, doc) => {
    if (err) {
      res.status(500).json({
        success: false,
        err: err
      });
    } else if (doc === null) {
      // render missing poll
      res.render('poll.pug', {
        free: false,
        choices: null
      });
    } else if (doc.locked) {
      res.sendFile(path.join(__dirname, 'private', 'locked.html'));
    } else {
      res.render('poll.pug', {
        pollID: id,
        ...doc
      });
    }
  });
});

app.put('/poll', submitMiddleware(), (req, res) => {
  let pollID = req.body.pollID;
  let response = {
    ...req.body.response
  };

  store.update({
    pollID: pollID
  }, {
    $push: {
      responses: response
    }
  }, {
    upsert: false
  }, (err, num) => {
    if (err || num > 1) {
      res.status(500).json({
        success: false,
        error: err || 'Number was greater than 1'
      });
    } else {
      res.json({
        success: true,
        response: response,
        pollID: pollID
      });
    }
  });

});

function changeLock(locked, req, res) {
  let id = req.params.id;
  let key = req.body.master_key;
  store.findOne({
    pollID: id
  }, (err, doc) => {
    if (err) {
      res.status(500).json({
        success: false,
        err: err
      });
    } else if (doc === null) {
      res.status(404).json({
        success: false,
        reason: `Poll was not found in the database`
      });
    } else {
      if (doc.master_key == key) {
        store.update({
          pollID: id
        }, {
          $set: {
            locked: locked
          }
        }, {
          upsert: false
        }, (err, num) => {
          if (err) {
            res.status(500).json({
              success: false,
              message: 'Could not ' + (locked ? 'lock' : 'unlock') + ' the poll!'
            });
          } else if (doc === null) {
            res.status(404).json({
              success: false,
              reason: `Poll was not found in the database`
            });
          } else {
            res.json({
              success: true,
              message: 'Successfully ' + (locked ? 'locked' : 'unlocked') + ' the poll!'
            });
          }
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Invalid master key for poll'
        });
      }
    }
  });
}

app.put('/poll/unlock/:id', (req, res) => {
  changeLock(false, req, res);
});

app.put('/poll/lock/:id', (req, res) => {
  changeLock(true, req, res);
});

app.delete('/poll/:id', (req, res) => {
  let param = req.body.master_key;
  store.findOne({
    pollID: req.params.id
  }, (err, doc) => {
    if (err) {
      res.status(500).json({
        success: false,
        err: err
      });
    } else if (doc === null) {
      res.status(404).json({
        success: false,
        reason: `Poll was not found in the database`
      });
    } else {
      if (doc.master_key == param) {
        store.remove({
          pollID: req.params.id
        }, {}, (err, num) => {
          if (err) {
            res.status(500).json({
              success: false,
              message: 'Could not delete the record!'
            });
          } else if (doc === null) {
            res.status(404).json({
              success: false,
              reason: `Poll was not found in the database`
            });
          } else {
            res.json({
              success: true,
              message: 'Successfully deleted poll'
            });
          }
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Invalid master key for poll'
        });
      }
    }
  });
});

app.get('/poll/results/:id', (req, res) => {
  store.findOne({
    pollID: req.params.id
  }, (err, doc) => {
    if (err) {
      res.status(500).json({
        success: false,
        err: err
      });
    } else if (doc === null) {
      res.render('results.pug', {
        free: false,
        choices: null
      });
    } else {
      res.render('results.pug', doc);
    }
  });
});

io.on('connection', (socket) => {
  let interval;
  socket.on('whoami', (msg) => {
    socket.userData = {
      pollID: msg
    };
    socket.join(msg);

    interval = setInterval(() => {
      let pollID = socket.userData.pollID;

      store.findOne({
        pollID
      }, (err, doc) => {
        if (err) {
          io.to(pollID).emit('receive', {
            success: false,
            err: err
          });
        } else if (doc === null) {
          io.to(pollID).emit('receive', {
            free: false,
            choices: null
          });
        } else {
          io.to(pollID).emit('receive', doc);
        }
      });

    }, 500);
  });

  socket.on('done', (msg) => clearInterval(interval));

  socket.on('disconnect', (msg) => {
    clearInterval(interval);
    console.log("Socket disconnecting!");
  });

});

app.get('/count', (req, res) => {
  store.find({}, function (err, docs) {
    if (err) {
      res.status(500);
      res.send('500: Internal Server Error');
    } else {
      res.status(200);
      res.json({
        pollCount: docs.length
      });
    }
  });
});

app.get('/api/poll/result/:id', (req, res) => {
  store.findOne({
    pollID: req.params.id
  }, (err, doc) => {
    if (err) {
      res.status(500).json({
        success: false,
        err: err
      });
    } else if (doc === null) {
      res.json({
        free: false,
        choices: null
      });
    } else {
      let result = {
        poll: doc,
        response: Date.now()
      };
      delete result.poll.master_key;
      res.json(result);
    }
  });
});


// function drop_root() {
//   process.setgid('nobody');
//   process.setuid('nobody');
// }

if (process.env.NODE_ENVIRONMENT == 'development') {
  app.get('/api/poll/results', (req, res) => {
    store.find({}, (err, docs) => {
      if (err) {
        res.status(500).json({
          success: false,
          err: err
        });
      } else if (docs === null || docs === []) {
        res.json({
          free: false,
          choices: null
        });
      } else {
        for (let doc of docs) {
          delete doc.master_key;
        }
        let result = {
          count: docs.length,
          polls: docs,
          response: Date.now()
        };
        res.json(result);
      }
    });
  });

  server.listen(8000);
} else {
  server.listen(80, () => {
    console.log("Listening...");
    console.log("Attempting to drop gid");
    // drop_root();
    console.log(`Group is now ${process.getgid()}`);
  });
}
