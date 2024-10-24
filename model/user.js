const {Schema} = require('mongoose');
const mongoose = require('./model')

const userSchema = new Schema({
    id: String,
    group: String,
    groupName: String,
    network:String,
    token: String,
    tokenName: String,
    supply: Number,  
    shuffle: Boolean,  
    buyEmoji: String,
    buyStep: Number,  
    minBuy: Number,  
    price: Boolean,  
    market: Boolean,  
    chart: String,  
    layout: String,
    setting:Object
  });
  

const User = mongoose.model(process.env.DB_NAME + "TELEGRAM_USERS", userSchema);

module.exports = User;
