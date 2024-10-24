require('dotenv').config();
const {start, setup, finishUp, callbackQuery, settings} = require('./setup')
const express = require("express")
const {group} = require('./group')
const bot = require('./bot'); 
/** KEEP SERVER RUNNING FOR MONGODB SAKE */
const app = express()
//configuring port
let port =  3333
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`App listening on port ${port}`)
})

// Handle the /start command
bot.onText(/\/start/, start);
//handle the setup command
bot.onText(/\/setup/, setup);
//setup command
bot.onText(/\/settings/, settings);
//listen to msg
bot.on('message', (msg) => { 
    if (msg.chat.type !== 'supergroup' || msg.chat.type !== 'group') {
        finishUp(msg) //for others
    }
    else{
        group(msg) //in group
    }
});
//to listen to callbacks
bot.on('callback_query', callbackQuery);

// Error handling
bot.on("polling_error", console.error);
console.log('Running Bot') 




 
