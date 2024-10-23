const TelegramBot = require('node-telegram-bot-api');

// Retrieve bot token from the environment variables
const token = process.env.BOT_TOKEN;
// Create a new bot instance
module.exports = new TelegramBot(token, { polling: true });
