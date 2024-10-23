/**
 * Handles the Setup process
*/
const TelegramBot = require('node-telegram-bot-api');
const USERS = require('./data'); //global exports
const bot = require('./bot')
const {getGroupAdmins, isGroupAdmin} = require('./group')
const {isEvm, isSol, getTokenInfo} = require('./utils')
const User = require("./model/user")

// Handle the /start command
exports.start = (msg) => { 
    //group trigger message
    if (msg.chat.type === 'supergroup' || msg.chat.type === 'group') {
        regUser(msg.from.id)
        getGroupAdmins(msg.chat.id, msg.chat.title);
        return
    }
    const chatId = msg.chat.id;
    const setUpMsg = `
    ⚙️ To start tracking new buys, use /setup           
    `
    // Send the welcome message
    bot.sendMessage(chatId, setUpMsg);
};
//handle the setup command
exports.setup = (msg) => { 
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'supergroup' || msg.chat.type !== 'group') {
        const setUpMsg = `
        ❔ Add ${process.env.BOT_USER_NAME} to your group with administrator rights and head back to this chat.
        If the bot has already being added, send the /start command from the group to trigger the setup process
        `
        // Send the welcome message
        bot.sendMessage(chatId, setUpMsg);
        regUser(chatId)
    }
};
//to listen to message
exports.finishUp = (msg) => { 
    const chatId = msg.chat.id;
    // Check if bot is expecting a token address from this user
    if (USERS[chatId]?.state == 'token') {
        const tokenAddress = msg.text;
        //verify if its a valid sol or evm address
        if(isEvm(tokenAddress)) {
            //send the eth and bnb options
            const messageText = "Select network ❔";
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'ETH', // Button text
                                callback_data: 'eth' // Custom callback data
                            },
                            {
                                text: 'BSC', // Button text
                                callback_data: 'bsc' // Custom callback data
                            }
                        ]
                    ]
                }
            };
            bot.sendMessage(chatId, messageText, options);
            USERS[chatId]['token'] = tokenAddress
        }
        else if(isSol(tokenAddress)) {
            //move on to the next part
            USERS[chatId]['network'] = 'sol'
            USERS[chatId]['state'] = "done"
            USERS[chatId]['token'] = tokenAddress
            saveUserToDb(chatId)
        }
        else{
            //send invalid token given
            bot.sendMessage(chatId, `${USERS[chatId]?.name || ""} \nThis is an invalid address.\nTry sending another`);
        }
    }
}
//callback query
exports.callbackQuery = (msg) => { 
    const message = msg.message;
    const chatId = message.chat.id;
    // Check if the callback data is 'send_custom_message'
    if ((msg.data === 'eth' || msg.data === 'bsc') && USERS[chatId]) {
        //reg user network
        USERS[chatId]['network'] = msg.data
        USERS[chatId]['state'] = "done"
        saveUserToDb(chatId)
    }
    // Optionally, answer the callback query to acknowledge the interaction
    bot.answerCallbackQuery(msg.id);
};
// Handle the /settings command
exports.settings = async (msg) => { 
    //group trigger message
    if (msg.chat.type === 'supergroup' || msg.chat.type === 'group') {
        //from group, use
        isGroupAdmin(msg.chat.id, msg.from.id,async () => {
            const messageText = "Continue in private chat, click the button below to continue:";
            // Create the inline keyboard with a link to the bot's private chat
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Continue',
                                url: `https://t.me/${process.env.BOT_USER_NAME.replace('@',"")}`
                            }
                        ]
                    ]
                }
            };
            //get the current token
            if(USERS[msg.from.id]) {
                if(USERS[msg.from.id]['group'] == msg.chat.id) {
                    //in the group, show
                    tokenDashboard(msg.from.id)
                    //send the setup commands
                    bot.sendMessage(msg.chat.id, messageText, options);
                    return
                }
            }
            //not in the group, switch to group
            const isReg = await User.find({id:msg.from.id, group:msg.chat.id})
            if(isReg.length > 0) {
                USERS[msg.from.id] = isReg[0]
                tokenDashboard(msg.from.id)
                bot.sendMessage(msg.chat.id, messageText, options);
            }
            else{
                //show nothing set message
                bot.sendMessage(msg.chat.id, "No token has been added yet.\nUse /start to setup a token")
            }
        })
    }
    else{
        //get the current token
        if(USERS[msg.chat.id]) {
            if((USERS[msg.chat.id]?.supply || 0) > 0) {
                //in the group, show
                tokenDashboard(msg.chat.id)
                return
            }
        }
        //check db
        const isReg = await User.find({id:msg.chat.id})
        if(isReg.length > 0) {
            USERS[msg.from.id] = isReg[0]
            tokenDashboard(msg.chat.id)
        }
        else{
            //show nothing set message
            bot.sendMessage(msg.chat.id, "No token has been added yet.\nUse /setup to setup a token")
        }
    }
};
//to register user for tracking msg
const regUser = (id) => {
    USERS['users'] = USERS['users'] || []
    if(!USERS['users'].includes(id)){
        USERS['users'].push(id)
    }
}
//save user to db
const saveUserToDb = async (id) => {
    //get tokenInfo
    const tokenInfo = await getTokenInfo(USERS[id]['network'], [USERS[id]['token']])
    if(tokenInfo){
        USERS[id]['id'] = id
        USERS[id]['tokenName'] = tokenInfo[0]?.name || ""
        USERS[id]['supply'] = tokenInfo[0]?.market_data?.total_supply || 0
        USERS[id]['shuffle'] = true; // Assigning shuffle enabled
        USERS[id]['buyEmoji'] = "🟢"; // Assigning emoji for buy notifications
        USERS[id]['buyStep'] = 5; // Assigning step for buying (e.g., $50)
        USERS[id]['minBuy'] = 10; // Assigning minimum buy amount ($10)
        USERS[id]['price'] = true; // Assigning price tracking enabled
        USERS[id]['market'] = false; // Assigning market cap tracking disabled
        USERS[id]['chart'] = "Dexscreener"; //default to descreener
        USERS[id]['layout'] = "Default"; // using default
        //first check if it already exists
        const isReg = await User.find({id, group:USERS[id]['group']})
        if(isReg.length > 0) {
            bot.sendMessage(id, "Token already setup")
            USERS[id] = isReg[0]
            tokenDashboard(id)
        }
        else{
            const res = await User.create({
                ...USERS[id]
            })
            //created, show token dashboard
          if(res){tokenDashboard(id)}
        }
    }
    else {
        bot.sendMessage(id, "Unable to register token")
    }
}
//setup complete msg with settings
const tokenDashboard = (chatId) => {
    if(USERS[chatId]){
        let msg = "ℹ️ Coat TestBot lets you track real-time buy trades seamlessly. Stay updated on every trade with instant notifications."
        msg += "\n\n↗️ Current group:" + USERS[chatId]['groupName'] + "\n⤵️ Token Info:\nName: " + USERS[chatId]['tokenName'] + "\nAddress: " + USERS[chatId]['token'] + ".\nToken Supply:" + USERS[chatId]['supply'] + "\n⤴️ Chain:" + USERS[chatId]['network']
        //construct the settings
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `🌇 Gif / Video / Image:`, // Button text
                            callback_data: 'media_setting' // Custom callback data
                        }
                    ],
                    [
                        {
                            text: `🔀 Shuffle: ${(USERS[chatId]['shuffle'] === true) ? '✅' : '☑️'}`, // Button text
                            callback_data: 'shuffle_setting' // Custom callback data
                        }
                    ],
                    [
                        {
                            text: `Buy Emoji ${USERS[chatId]['buyEmoji']}`, // Button text
                            callback_data: 'buy_setting' // Custom callback data
                        }
                    ],
                    [
                        {
                            text: `💲 Buy Step: $${USERS[chatId]['buyStep']}`, // Button text
                            callback_data: 'step_setting' // Custom callback data
                        }
                    ],
                    [
                        {
                            text: `⏫ Min. Buy: $${USERS[chatId]['minBuy']}`, // Button text
                            callback_data: 'min_setting' // Custom callback data
                        }
                    ],
                    [
                        {
                            text: `💲 Token Price: ${(USERS[chatId]['price'] === true) ? '✅' : '☑️'}`, // Button text
                            callback_data: 'price_setting' // Custom callback data
                        }
                    ],
                    [
                        {
                            text: `💸 Market Cap: ${(USERS[chatId]['market'] === true) ? '✅' : '☑️'}`, // Button text
                            callback_data: 'market_setting' // Custom callback data
                        }
                    ],
                    [
                        {
                            text: `🦅 Chart: ${USERS[chatId]['chart']}`, // Button text
                            callback_data: 'chart_setting' // Custom callback data
                        }
                    ],
                    [
                        {
                            text: `🎨 Emoji Layout Style: ${USERS[chatId]['layout']}`, // Button text
                            callback_data: 'emoji_setting' // Custom callback data
                        }
                    ],
                ]
            }
        };
        // Sending the message with the vertically arranged buttons
        bot.sendMessage(chatId, msg, options);
        
    }
} 
