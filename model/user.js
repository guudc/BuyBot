const {Schema} = require('mongoose');
const mongoose = require('./model')

const userSchema = new Schema({
    id: String,
    group: String,
    groupName: String,
    network:String,
    token: String,
    tokenName: String,
    supply: Number, // Assuming supply is a numeric value
    shuffle: Boolean, // Assuming shuffle is a boolean
    buyEmoji: String,
    buyStep: Number, // Assuming buyStep is a numeric value
    minBuy: Number, // Assuming minBuy is a numeric value
    price: Boolean, // Assuming price is a boolean
    market: Boolean, // Assuming market is a boolean
    chart: String, // Assuming chart can be a string, e.g., a URL
    layout: String // Assuming layout is a string for emoji layout style
  });
  

const User = mongoose.model(process.env.DB_NAME + "TELEGRAM_USERS", userSchema);

module.exports = User;
