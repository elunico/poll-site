const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const pug = require('pug');
const crypto = require('crypto')

require('dotenv').config();

const db = require('nedb');
const store = new db({
    filename: process.env.DATABASE_FILE || "database.txt",
    autoload: true
});

const app = express();
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
    }
    app.get('/poll/all', (req, res) => {
        db.find({}, (err, docs) => {
            if (err) {
                res.status(500).json(err);
            } else {
                res.json(docs);
            }
        })
    });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'index.html'));
});

app.get('/poll/new', (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'create.html'));
})

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

app.post('/poll/create', (req, res) => {
    let created = Date.now();
    let id = generateID();
    store.insert({
        ...req.body,
        created: created,
        pollID: id,
        responses: []
    }, (err, doc) => {
        if (err) {
            res.status(500).json({
                success: false,
                err: err
            })
        } else {
            res.json({
                pollID: id,
                created: created,
                success: true
            });
        }
    });
});

const pollRenderer = pug.compileFile(path.join(__dirname, 'private', 'poll.pug'))
const resultRenderer = pug.compileFile(path.join(__dirname, 'private', 'results.pug'))

app.get('/poll/:id', (req, res) => {
    let id = req.params.id;
    store.findOne({
        pollID: id || -1
    }, (err, doc) => {
        if (err) {
            res.status(500).json({
                success: false,
                err: err
            })
        } else {
            res.send(pollRenderer({
                pollID: id,
                ...doc
            }));
        }
    });
});

app.post('/poll/submit', submitMiddleware(), (req, res) => {
    let pollID = req.body.pollID;
    let response = {
        ...req.body.response
    }

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
            })
        } else {
            res.json({
                success: true,
                response: response,
                pollID: pollID
            });
        }
    })

});

app.get('/poll/results/:id', (req, res) => {
    store.findOne({
        pollID: req.params.id
    }, (err, doc) => {
        if (err) {
            res.status(500).json({
                success: false,
                err: err
            })
        } else {
            res.send(resultRenderer(doc));
        }
    })
})

app.listen(8000);