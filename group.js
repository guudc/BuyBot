/** Handles Group Interactions */
const bot = require('./bot')
const USERS = require('./data'); //global exports


//to handle group joining
exports.group = (msg) => {
    if (msg.chat.type === 'supergroup' || msg.chat.type === 'group') {
        this.getGroupAdmins(msg.chat.id, msg.chat.title);
    }
}
// Function to get group administrators
exports.getGroupAdmins = (chatId, groupName) => {  
    bot.getChatAdministrators(chatId).then((admins) => {
        let n = admins.length;
        admins.forEach((admin) => {
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
                bot.sendMessage(userId, `Hello ${name}\nSend the token address`);
                USERS[userId] = {
                    id:userId,
                    state:'token',
                    name,
                    group:chatId,
                    groupName
                }
            }
            else {
                if(n == 0) {
                    //last one and not recognised as admin
                    bot.sendMessage(chatId, "Only admins of this group can set me up.")
                }
            }
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
