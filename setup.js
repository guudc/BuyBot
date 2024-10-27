/**
 * Handles the Setup process
*/
const TelegramBot = require('node-telegram-bot-api');
const USERS = require('./data'); //global exports
const bot = require('./bot')
const {getGroupAdmins, isGroupAdmin, isBotInGroup} = require('./group')
const {isEvm, isSol, getTokenInfo, downloadFile} = require('./utils')
const User = require("./model/user");
const { setUp, removeToken } = require('./monitor');

// Handle the /start command
exports.start = (msg) => { 
    try{
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
    }
    catch(e){}
};
//handle the setup command
exports.setup = (msg) => { 
    try{
        const chatId = msg.chat.id;
        if (msg.chat.type !== 'supergroup' || msg.chat.type !== 'group') {
            const setUpMsg = `
❔ Add ${process.env.BOT_USER_NAME} to your group and head back to this chat.

If the bot has already being added, send the /start command from the group to trigger the setup process.
Only an admin of the group can do this.
    `
            // Send the welcome message
            bot.sendMessage(chatId, setUpMsg);
            regUser(chatId)
        }
    }catch(e){}
};
//to listen to message
exports.finishUp = async  (msg) => { 
    try{
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
        //for settings
        else if (USERS[chatId]?.state == 'media_setting') {
            let file = null;let fileId=null;let mime = ""
            // Check for image (photo)
            if (msg.photo) {
                //find the fileid thats less than 1mb
                if(msg.photo[msg.photo.length - 1] <= process.env.MAX_FILE_SIZE){
                    fileId = msg.photo[msg.photo.length - 1].file_id; // Get the highest resolution image
                    file = await downloadFile(fileId);
                    mime = "image/png"
                }
                else{bot.sendMessage(chatId, `🚫 Max size exceeded.\nSend a file lesser than ${process.env.MAX_FILE_SIZE/1E6}mb.`);return;}
            } else if (msg.video) {
                if(msg.video.file_size <= process.env.MAX_FILE_SIZE){
                    fileId = msg.video.file_id;
                    file = await downloadFile(fileId);
                    mime = "video/mp4"
                }
                else{bot.sendMessage(chatId, `🚫 Max size exceeded.\nSend a file lesser than ${process.env.MAX_FILE_SIZE/1E6}mb.`);return;}
            } else if (msg.animation) {
                if(msg.animation.file_size <= process.env.MAX_FILE_SIZE){
                    fileId = msg.animation.file_id;
                    file = await downloadFile(fileId);
                    mime = msg?.animation?.mime_type || "video/mp4"
                }
                else{bot.sendMessage(chatId, `🚫 Max size exceeded.\nSend a file lesser than ${process.env.MAX_FILE_SIZE/1E6}mb.`);return;}
            } else if (msg.document && msg.document.mime_type.indexOf('gif') > -1) { 
                if(msg.document.file_size <= process.env.MAX_FILE_SIZE){
                    fileId = msg.document.file_id;
                    file = await downloadFile(fileId);
                    mime = "image/gif"
                }
                else{bot.sendMessage(chatId, `🚫 Max size exceeded.\nSend a file lesser than ${process.env.MAX_FILE_SIZE/1E6}mb.`);return;}
            }
            //check if file was sent
            if(file){
                //saved to db
                USERS[chatId]['setting'] = USERS[chatId]['setting'] || {}
                USERS[chatId]['setting']['media'] = {file, mime, fileId} 
                const res = await User.findOneAndUpdate(
                    { id: chatId, group:USERS[chatId]['group'] },   
                    { 
                        $set: { setting: USERS[chatId]['setting'] }, 
                    },
                    { new: true, upsert: false }   
                );
                setUp(USERS[chatId]?.token, USERS[chatId]?.id, USERS[chatId]?.group, USERS[chatId])
                if(res){
                    bot.sendMessage(chatId, 'Media saved!');
                }else{bot.sendMessage(chatId, 'Something went wrong');}
                //apply a 1s delay
                await new Promise(resolve => setTimeout(resolve, 1000));
                //show the settings
                tokenDashboard(chatId)
            }
            else{bot.sendMessage(chatId, '🚫 Invalid media sent.\nSend another one.');}
        }
        else if (USERS[chatId]?.state == 'buy_setting') {
            USERS[chatId]['buyEmoji'] = msg.text.trim().substring(0, 5)
            if(await saveUserInfo(chatId, USERS[chatId]['group'], {
                buyEmoji: USERS[chatId]['buyEmoji']
            })){
                //show the results
                tokenDashboard(chatId)
            }
        }
        else if (USERS[chatId]?.state == 'step_setting') {
            const step = msg.text.trim() * 1
            if(!isNaN(step)){
                USERS[chatId]['buyStep']  = step
                if(await saveUserInfo(chatId, USERS[chatId]['group'], {
                    buyStep: USERS[chatId]['buyStep']
                })){
                    //show the results
                    tokenDashboard(chatId)
                }
            }
            else{
                bot.sendMessage(chatId, "🚫 Not a number.\nSend a new step in $")
            }
        }
        else if (USERS[chatId]?.state == 'min_setting') {
            const step = msg.text.trim() * 1
            if(!isNaN(step)){
                USERS[chatId]['minBuy']  = step
                if(await saveUserInfo(chatId, USERS[chatId]['group'], {
                    minBuy: USERS[chatId]['minBuy']
                })){
                    //show the results
                    tokenDashboard(chatId)
                }
            }
            else{
                bot.sendMessage(chatId, "🚫 Not a number.\nSend a min in $")
            }
        }
    }
    catch(e){}
}
//callback query
exports.callbackQuery = async (msg) => { 
    try{
        const message = msg.message;
        const chatId = message.chat.id;
        // Check if the callback data is 'send_custom_message'
        if ((msg.data === 'eth' || msg.data === 'bsc') && USERS[chatId]) {
            //reg user network
            USERS[chatId]['network'] = msg.data
            USERS[chatId]['state'] = "done"
            saveUserToDb(chatId)
        }
        else if(msg.data.indexOf('setting') > -1){
            //check if the user is set
            if(!USERS[chatId]){
                const isReg = await User.find({id:chatId})
                if(isReg.length > 0) {
                    USERS[chatId] = isReg[0]
                    USERS[chatId]['db'] = isReg
                }
            }
            //for settings info
            if(msg.data === 'media_setting') {
                bot.sendMessage(chatId, `❔ Send media (gif, image or video).\nMax size ${process.env.MAX_FILE_SIZE/1E6}mb`)
                //set the user settings
                USERS[chatId]['state'] = 'media_setting'
            }
            else if(msg.data === 'shuffle_setting') {
                //save the shuffle
                USERS[chatId]['shuffle'] = !USERS[chatId]['shuffle']
                if(await saveUserInfo(chatId, USERS[chatId]['group'], {
                    shuffle: USERS[chatId]['shuffle']
                })){
                    //show the results
                    tokenDashboard(chatId, true)
                }
            }
            else if(msg.data === 'buy_setting') {
                //save the shuffle
                bot.sendMessage(chatId, "❔ Send emoji.ℹ️ Custom Emojis Is Available Now!\n\nTry it now with default animated emojis pack\nhttps://t.me/addemoji/RestrictedEmoji.") 
                //set the user settings
                USERS[chatId]['state'] = 'buy_setting'
            }
            else if(msg.data === 'step_setting') {
                //save the shuffle
                bot.sendMessage(chatId, "❔ Set buy step in $.") 
                //set the user settings
                USERS[chatId]['state'] = 'step_setting'
            }
            else if(msg.data === 'min_setting') {
                //save the shuffle
                bot.sendMessage(chatId, "❔ Set min buy amount in $.") 
                //set the user settings
                USERS[chatId]['state'] = 'min_setting'
            }
            else if(msg.data === 'price_setting') {
                //save the shuffle
                USERS[chatId]['price'] = !USERS[chatId]['price']
                if(await saveUserInfo(chatId, USERS[chatId]['group'], {
                    price: USERS[chatId]['price']
                })){
                    //show the results
                    tokenDashboard(chatId, true)
                }
            }
            else if(msg.data === 'market_setting') {
                //save the shuffle
                USERS[chatId]['market'] = !USERS[chatId]['market']
                if(await saveUserInfo(chatId, USERS[chatId]['group'], {
                    market: USERS[chatId]['market']
                })){
                    //show the results
                    tokenDashboard(chatId, true)
                }
            }
            else if(msg.data === 'chart_setting') {
                //save the shuffle
                const msg = "❔ Choose your preferred DexChart"
                //construct the settings
                const options = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: `BirdEye`, // Button text
                                    callback_data: 'market_birdeye_setting' // Custom callback data
                                },
                                {
                                    text: `Dexscreener`, // Button text
                                    callback_data: 'market_dex_setting' // Custom callback data
                                }
                            ],
                            [
                                {
                                    text: `Go Back`, // Button text
                                    callback_data: 'market_back_setting' // Custom callback data
                                }
                            ],
                        ]
                    }
                };
                //delete previous message if existing
                if(USERS[chatId]['msg_id'] != "" && USERS[chatId]['msg_id']) bot.deleteMessage(chatId, USERS[chatId]['msg_id'])
                USERS[chatId]['msg_id'] = (await bot.sendMessage(chatId, msg, options)).message_id;
                //set the user settings
                USERS[chatId]['state'] = 'chart_setting'
            }
            else if (msg.data === 'market_birdeye_setting') {
                USERS[chatId]['chart']  = "BirdEye"
                if(await saveUserInfo(chatId, USERS[chatId]['group'], {
                    chart: USERS[chatId]['chart']
                })){
                    //show the results
                    tokenDashboard(chatId)
                }
            }
            else if (msg.data === 'market_dex_setting') {
                USERS[chatId]['chart']  = "DexScreener"
                if(await saveUserInfo(chatId, USERS[chatId]['group'], {
                    chart: USERS[chatId]['chart']
                })){
                    //show the results
                    tokenDashboard(chatId)
                }
            }
            else if (msg.data === 'market_back_setting') {
                //show the results
                tokenDashboard(chatId)
            }
            else if(msg.data === 'emoji_setting') {
                //save the shuffle
                USERS[chatId]['layout'] = (USERS[chatId]['layout'] == "Default") ? "Dark" : "Default"
                if(await saveUserInfo(chatId, USERS[chatId]['group'], {
                    layout: USERS[chatId]['layout']
                })){
                    //show the results
                    tokenDashboard(chatId, true)
                }
            }
            else if(msg.data === 'token_setting') {
                bot.sendMessage(chatId, `Send the token address`);
                //set the user settings
                USERS[chatId]['state'] = 'token'
            }
        }
    }
    catch(e){}
    // Optionally, answer the callback query to acknowledge the interaction
    bot.answerCallbackQuery(msg.id);
};
// Handle the /settings command
exports.settings = async (msg) => { 
    try{
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
                    USERS[msg.from.id]['db'] = isReg
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
                //check if bot is part of group
                if((await isBotInGroup(isReg[0]['group'])) === true){
                    USERS[msg.from.id] = isReg[0]
                    USERS[msg.from.id]['db'] = isReg
                    tokenDashboard(msg.chat.id)
                }
                else { 
                    bot.sendMessage(msg.chat.id, "No token has been added yet.\nUse /setup to setup a token")
                    //deele the group info from the db
                    const res = await User.deleteOne({id:msg.chat.id, group:isReg[0]['group']})
                    console.log(res)
                    removeToken(isReg[0]['token'], msg.chat.id, isReg[0]['group'], isReg[0]['network'])
                }
            }
            else{
                //show nothing set message
                bot.sendMessage(msg.chat.id, "No token has been added yet.\nUse /setup to setup a token")
            }
        }
    }
    catch(e){}
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
    try{
        //get tokenInfo
        const tokenInfo = await getTokenInfo(USERS[id]['network'], USERS[id]['token'])
        if(tokenInfo['name']){
            USERS[id]['id'] = id
            USERS[id]['tokenName'] = tokenInfo?.name || ""
            USERS[id]['supply'] = tokenInfo?.supply || 0
            USERS[id]['shuffle'] = USERS[id]?.shuffle || true; // Assigning shuffle enabled
            USERS[id]['buyEmoji'] = USERS[id]?.buyEmoji || "💵"; // Assigning emoji for buy notifications
            USERS[id]['buyStep'] = USERS[id]?.buyStep || 5; // Assigning step for buying (e.g., $5)
            USERS[id]['minBuy'] = USERS[id]?.minBuy || 10; // Assigning minimum buy amount ($10)
            USERS[id]['price'] = USERS[id]?.price || true; // Assigning price tracking enabled
            USERS[id]['market'] = USERS[id]?.market || false; // Assigning market cap tracking disabled
            USERS[id]['chart'] = USERS[id]?.chart || "DexScreener"; //default to descreener
            USERS[id]['layout'] = USERS[id]?.layout || "Default"; // using default
            //first check if it already exists 
            const isReg = await User.find({id, group:USERS[id]['group']})
            if(isReg.length > 0) {
                bot.sendMessage(id, "Token updated")
                //save it 
                saveUserInfo(id, USERS[id]['group'], USERS[id])
                USERS[id]['db'] = await User.find({id, group:USERS[id]['group']})
                tokenDashboard(id)
            }
            else{
                const res = await User.create({
                    ...USERS[id]
                })
                USERS[id]['db'] = res
                //created, show token dashboard
                if(res){tokenDashboard(id)}
            }
            setUp(USERS[id]?.token, USERS[id]?.id, USERS[id]?.group, USERS[id])
        }
        else {
            bot.sendMessage(id, "Unable to register token")
            bot.sendMessage(id, `Send the token address`);
            USERS[id]['state'] = 'token'
        }
    }catch(e){}
}
//setup complete msg with settings
const tokenDashboard = async (chatId, update=false) => {
    try{
        if(USERS[chatId]){
            USERS[chatId]['state'] = 'done' //reset state
            let msg = "😎 Coat TestBot lets you track real-time buy trades seamlessly. Stay updated on every trade with instant notifications🤖."
            msg += "\n\n✳️ Current group: " + USERS[chatId]['groupName'] + "\n✳️Token Name: " + USERS[chatId]['tokenName'] + "\n✳️Address: " + USERS[chatId]['token'] + ".\n✳️Token Supply: " + USERS[chatId]['supply'] + "\n✳️ Chain: " + USERS[chatId]['network'].toUpperCase()
            //construct the settings
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: `👓 Set display media`, // Button text
                                callback_data: 'media_setting' // Custom callback data
                            },
                            {
                                text: `🔀 Shuffle: ${(USERS[chatId]['shuffle'] === true) ? '✅' : '☑️'}`, // Button text
                                callback_data: 'shuffle_setting' // Custom callback data
                            }
                        ],
                        [
                            {
                                text: `🎨Set Emoji Style: ${USERS[chatId]['layout']}`, // Button text
                                callback_data: 'emoji_setting' // Custom callback data
                            },
                            {
                                text: `${USERS[chatId]['buyEmoji']} Buy Emoji`, // Button text
                                callback_data: 'buy_setting' // Custom callback data
                            }
                        ],
                        [
                            {
                                text: `🧩 Set Buy Step: $${USERS[chatId]['buyStep']}`, // Button text
                                callback_data: 'step_setting' // Custom callback data
                            },
                            {
                                text: `⤴️ Min Buy: $${USERS[chatId]['minBuy']}`, // Button text
                                callback_data: 'min_setting' // Custom callback data
                            }
                        ],
                        [
                            {
                                text: `💲 Show Token Price: ${(USERS[chatId]['price'] === true) ? '✅' : '☑️'}`, // Button text
                                callback_data: 'price_setting' // Custom callback data
                            },
                            {
                                text: `💸 Show Market Cap: ${(USERS[chatId]['market'] === true) ? '✅' : '☑️'}`, // Button text
                                callback_data: 'market_setting' // Custom callback data
                            }
                        ],
                        [
                            {
                                text: `📈 Set Dex Chart: ${USERS[chatId]['chart']}`, // Button text
                                callback_data: 'chart_setting' // Custom callback data
                            }
                        ],
                        [
                            {
                                text: `🪙 Change Token`, // Button text
                                callback_data: 'token_setting' // Custom callback data
                            },
                        ],
                    ]
                }
            };
            if(!update || (USERS[chatId]['msg_id'] == "" || !USERS[chatId]['msg_id'])){
                // Sending the message with the vertically arranged buttons
                if(USERS[chatId]['msg_id'] != "" && USERS[chatId]['msg_id']) bot.deleteMessage(chatId, USERS[chatId]['msg_id'])
                USERS[chatId]['msg_id'] = (await bot.sendMessage(chatId, msg, options)).message_id;
            }
            else if(USERS[chatId]['msg_id'] != "" && USERS[chatId]['msg_id']){
                bot.editMessageReplyMarkup(options.reply_markup, {
                chat_id: chatId, message_id: USERS[chatId]['msg_id']});
            }
        }
    }catch(e){}
} 
//const save UserInfo
const saveUserInfo = async (id, group, info) => {
    try{
        const res = await User.findOneAndUpdate(
            { id, group },   
            { 
                $set: info, 
            },
            { new: true, upsert: false }   
        );
        setUp(USERS[id]?.token, USERS[id]?.id, USERS[id]?.group, USERS[id])
        return res != null;
    }
    catch(e){}
    return false
}
