# Poll Site

This is a simple node webapp for creating and distributing polls quickly. 

You can create a poll with a free response text area or a poll with fixed multiple choice answers

Anyone can submit a vote or a response 

You can limit how many times a specific IP is allowed to submit using the `.env` file (implemented with `express-rate-limit`).
*Note that this is disabled unless `process.env.NODE_ENVIRONMENT=='production'`

Results of all polls are viewable by everyone 

When created, polls are given a public ID that is used to both submit and view responses. They 
also receive a "master key" which is a private identifier that the creator (or anyone who gets
their hands on it) can use to lock, unlock, and delete the poll. Locked polls do not accept 
new submissions and unlocked ones do. Polls are unlocked by default on creation. Deleted polls 
cannot be seen and their responses are destroyed.

Inspired by @shiffman and his attempts to make a live poll overlay 

Uses: `express`, `express-rate-limit`, `nedb`, `pug`, `dotenv`, and `materializecss`