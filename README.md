# Poll Site

This is a simple node webapp for creating and distributing polls quickly. 

You can create a poll with a free response text area or a poll with fixed multiple choice answers

Anyone can submit a vote or a response 

You can limit how many times a specific IP is allowed to submit using the `.env` file (implemented with `express-rate-limit`).
*Note that this is disabled unless `process.env.environment=='production'`

Results of all polls are viewable by everyone

Polls never close 

Inspired by @shiffman and his attempts to make a live poll overlay 

Uses: `express`, `express-rate-limit`, `nedb`, `pug`, `dotenv`, and `materializecss`