/** Handles Group Interactions */
const bot = require('./bot')
const USERS = require('./data'); //global exports
const User = require('./model/user');


//to handle group joining
exports.group = (msg) => {
    try{
        if (msg.chat.type === 'supergroup' || msg.chat.type === 'group') {
            this.getGroupAdmins(msg.chat.id, msg.chat.title);
        }
    }catch(e){}
}
// Function to get group administrators
exports.getGroupAdmins = (chatId, groupName) => {  
    bot.getChatAdministrators(chatId).then((admins) => {
        let n = admins.length;
        admins.forEach(async (admin) => {
            try{
                const userId = admin.user.id;
                n--
                if((USERS['users'] || []).includes(userId)) {
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
                    const name = admin.user.first_name || '';
                    //send the setup commands
                    bot.sendMessage(chatId, messageText, options);
                    //check if there is already a set up already
                    const isReg = await User.find({group:chatId})
                    if(isReg.length > 0) {
                        //check if the user that set it up
                        if(isReg[0]?.id == userId){
                            USERS[userId] = isReg[0]
                            USERS[userId]['db'] = isReg
                            bot.sendMessage(userId, `Hello ${name}\n🟢 Token already setted up,Use the /settings to configure for ${USERS[userId]['groupName']} group`);
                        }
                        else{
                            bot.sendMessage(userId, `Hello ${name}\n🖐️${isReg[0]['groupName'] || "This"} group has already being configured by another user`);
                        }
                    }
                    else{
                        //registering for new group
                        bot.sendMessage(userId, `Hello ${name}\nSend the token address`);
                        USERS[userId] = {
                            id:userId,
                            state:'token',
                            name,
                            group:chatId,
                            groupName
                        }
                    }
                }
                else {
                    if(n == 0) {
                        //last one and not recognised as admin
                        bot.sendMessage(chatId, "Only admins of this group can set me up.")
                    }
                }
            }
            catch(e){}
        });
    }).catch((err) => console.error(err));
};
// Function to know if its admin
exports.isGroupAdmin = (chatId, userId, callback) => {  
    bot.getChatAdministrators(chatId).then((admins) => {
        let n = admins.length;
        admins.forEach((admin) => {
            n--
            if(userId == admin.user.id) {
                 callback()
            }
            else {
                if(n == 0) {
                    //last one and not recognised as admin
                    bot.sendMessage(chatId, "Only admins of this group can use this command.")
                }
            }
        });
    }).catch((err) => console.error(err));
};
//check if bot is in the group
exports.isBotInGroup = async (groupId) => {
    let botInfo
    try {
        const botId = (process.env.BOT_TOKEN).substring(0, (process.env.BOT_TOKEN).indexOf(":"))
        botInfo = await bot.getChatMember(groupId, botId);
        // Check the status of the bot in the group
        if (botInfo.status === 'member' || botInfo.status === 'administrator' || botInfo.status === 'creator') {
            return true;
        } else {
            return false;
        }
    } catch (error) { 
        if (error.response && error.response.statusCode === 400) {
            return false;
        } else {
            return false
        }
    }
}
