require('dotenv').config();
const {start, setup, finishUp, callbackQuery, settings} = require('./setup')
const express = require("express")
const {group} = require('./group')
const bot = require('./bot'); 
const { getAllTokens } = require('./monitor');
const User = require('./model/user');
/** KEEP SERVER RUNNING FOR MONGODB SAKE */
const app = express()
//endpoint for image and vide retrieval
app.get('/file/:id/:group/:token', async (req, res) => {
    const {id, group, token} = req.params
    try {
        if (id && group && token) {
            const user = await User.findOne({id, group, token})
            if(user){
                if (user?.setting?.media?.file && user?.setting?.media?.mime) {
                    // Set the content type and send the file data as a response
                    res.setHeader('Content-Type', user?.setting?.media?.mime);
                    res.send(user?.setting?.media?.file);
                } else {
                    res.status(404).send({ status: false, message: 'Image not found' });
                }
            }
        } else {
            res.status(404).send({ status: false });
        }
    } catch (e) {
        res.status(500).send({ status: false, message: 'Internal Server Error' });
    }
});

//configuring port
let port =  Math.floor(Math.random() * 1000)
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

// // Error handling
bot.on("polling_error", () => {
    console.log("Two bot instance running")
    //kill this process
    process.exit()
}
);
getAllTokens()
console.log('Running Bot') 




 
