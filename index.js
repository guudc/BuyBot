require('dotenv').config();
const {start, setup, finishUp, callbackQuery, settings} = require('./setup')
const {group} = require('./group')
const bot = require('./bot')

// Handle the /start command
bot.onText(/\/start/, start);
//handle the setup command
bot.onText(/\/setup/, setup);
//setup command
bot.onText(/\/settings/, settings);
//listen to msg
bot.on('message', (msg) => { console.log(msg)
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