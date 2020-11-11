const express = require('express');

function responseError(res, id, error) {
    res.status(500).json({
        success: false,
        pollID: id,
        reason: 'Internal server error: ',
        error: error
    });
}

function responseNotFound(res, id) {
    res.status(404).json({
        success: false,
        pollID: id,
        reason: 'Record not found'
    })
}

function responseDocument(res, id, doc) {
    res.status(200).json({
        success: true,
        pollID: id,
        reason: 'Ok',
        document: doc
    })
}

function responseSuccess(res, id, method) {
    res.status(200).json({
        success: true,
        pollID: id,
        reason: 'Successfully performed requested operation',
        method: method
    })
}

function responseUnauthorized(res, id) {
    res.status(403).json({
        success: false,
        pollID: id,
        reason: "Unauthorized!"
    })
}

module.exports = function (store) {
    const router = express.Router();

    router.get('/poll/:id', (req, res) => {
        store.findOne({
            pollID: req.params.id
        }, (err, doc) => {
            if (err) {
                responseError(res, req.params.id, err);
            } else if (doc == null) {
                responseNotFound(res, req.params.id);
            } else {
                responseDocument(res, req.params.id, doc);
            }
        });
    });

    router.delete('/poll/:id', (req, res) => {
        let id = req.params.id;
        let key = req.body.master_key;
        store.findOne({
            pollID: id
        }, (err, doc) => {
            if (err) {
                responseError(res, id, err);
            } else if (doc == null) {
                responseNotFound(res, id);
            } else {
                if (doc.master_key == key) {
                    store.remove({
                        pollID: id
                    }, (err1, num) => {
                        if (err1) {
                            responseError(res, id, err1);
                        } else {
                            responseSuccess(res, id, 'deleted');
                        }
                    })
                } else {
                    responseUnauthorized(res, id);
                }
            }
        })
    });

    router.get('/poll/results/:id', (req, res) => {
        store.findOne({
            pollID: req.params.id
        }, (err, doc) => {
            if (err) {
                responseError(res, req.params.id, err);
            } else if (doc === null) {
                responseNotFound(res, req.params.id);
            } else {
                responseDocument(res, req.params.id, {
                    question: doc.question,
                    pollID: doc.pollID,
                    responses: doc.responses
                });
            }
        })
    })

    return router;

}