//Import the mongoose module
const mongoose = require('mongoose');
 
//Set up default mongoose connection
const mongoDB = process.env.MONGO_DB_CLUSTER;
mongoose.connect(mongoDB, {useNewUrlParser: true, useUnifiedTopology: true});
console.log("Connected")

//Get the default connection
const db = mongoose.connection;

//Bind connection to error event (to get notification of connection errors)
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

module.exports = mongoose