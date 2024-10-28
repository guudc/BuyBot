const User = require("./model/user")
const bot = require('./bot')
const { getTokenInfo, getTokenBalance, clean, getBatchUsdBal } = require("./utils")
const { isBotInGroup } = require("./group");
const { fork } = require('child_process');


/** To Monitor Trades */
const TOKENS = {info:[]}
const NETWORK_PRICE = {
    'eth':1000, 'sol':300, 'bsc':10
}
let SOL_SERVICE = null;
let ETH_SERVICE = null
let BSC_SERVICE = null

//set up the tokens
exports.setUp = (tokenAddress, userId, groupId, setting) => {
    try{
        setUpToken(tokenAddress, userId, groupId, setting)
    }catch(e){console.log(e)}
}
//set up the tokens
exports.removeToken = (tokenAddress, userId, groupId, network) => {
    try{
        removeToken(tokenAddress, userId, groupId, network)
    }catch(e){console.log(e)}
}
//inward setup
const setUpToken = (tokenAddress, userId, groupId, setting) => {
    try {
        if(setting['network'] != 'sol') tokenAddress = tokenAddress.toLowerCase() //convert to lowercase
        // Set up all the tokens for monitoring
        TOKENS['token'] = TOKENS['token'] || [];
        // Check if the tokenAddress is present
        if (!TOKENS['token'].includes(tokenAddress)) {
            TOKENS['token'].push(tokenAddress);
        }
        // Attach the group id and chat id to the token
        TOKENS[tokenAddress] = TOKENS[tokenAddress] || [];
        const entryIndex = TOKENS[tokenAddress].findIndex(
            entry => entry.userId === userId && entry.groupId === groupId
        );
        // If it exists, update the existing entry
        if (entryIndex !== -1) {
            TOKENS[tokenAddress][entryIndex] = { userId, groupId, setting, usd: 0 }; // Update with new values
        } else {
            // If it doesn't exist, add the new entry
            TOKENS[tokenAddress].push({ userId, groupId, setting, usd: 0 });
        }
        if(SOL_SERVICE  && ETH_SERVICE && BSC_SERVICE) {
            SOL_SERVICE.send({type:'tokens', data:TOKENS})
            ETH_SERVICE.send({type:'tokens', data:TOKENS})
            BSC_SERVICE.send({type:'tokens', data:TOKENS})
        }
    } catch (e) {
        console.log(e);
    }
    
}
//remove reg token
const removeToken = (tokenAddress, userId, groupId, network) => {
    try { 
        if(network != 'sol') tokenAddress = tokenAddress.toLowerCase() //convert to lowercase
        // Set up all the tokens for monitoring
        TOKENS['token'] = TOKENS['token'] || [];
        // Check if the tokenAddress is present
        if (TOKENS['token'].includes(tokenAddress)) { 
            // find the token
            TOKENS[tokenAddress] = TOKENS[tokenAddress] || [];
            const index = TOKENS[tokenAddress].findIndex(
                entry => entry.userId == userId && entry.groupId == groupId
            );
            if(index !== -1){
                TOKENS[tokenAddress][index] = null
                TOKENS[tokenAddress] = clean(TOKENS[tokenAddress])
                if(TOKENS[tokenAddress].length == 0 || (TOKENS[tokenAddress].length == 1 && TOKENS[tokenAddress]['info'])) {
                    //remove the token from the monitored
                    TOKENS['token'][TOKENS['token'].indexOf(tokenAddress)] = null
                    TOKENS['token'] = clean(TOKENS['token'])
                    delete TOKENS[tokenAddress] 
                    if(TOKENS['info'][tokenAddress]) delete TOKENS['info'][tokenAddress]
                }
            }
            //post the tokens to all services
            if(SOL_SERVICE  && ETH_SERVICE && BSC_SERVICE) {
                SOL_SERVICE.send({type:'tokens', data:TOKENS})
                ETH_SERVICE.send({type:'tokens', data:TOKENS})
                BSC_SERVICE.send({type:'tokens', data:TOKENS})
            }
        }
    } catch (e) {
        console.log(e);
    }
    
}
//get all tokens
exports.getAllTokens = async () => {
    //get all registered user
    try{
        const users = await User.find({})
        if(users.length > 0){
            for(let i=0;i<users.length;i++) {
                setUpToken(users[i]?.token, users[i]?.id, users[i]?.group, users[i])
            }
        }
        //fetch the current price
        await syncUsdVal() //services to sync usd
        kickOff() //start monitoring buys
    }catch(e){console.log(e)}
}
//start monitoring
const kickOff = () => {
    startSol()
    startEth()
    startBsc()
}
//start sol services
const startSol = () => {console.log('sol started')
    //for sol
    SOL_SERVICE = fork('./process/sol.js');
    SOL_SERVICE.send({type:'tokens', data:TOKENS})
    SOL_SERVICE.on('message', ({type, data}) => { 
        if(type == 'mint'){ 
            infoGroup(data[0], data[1], data[2], data[3], data[4], data[5], data[6])
        }
    });
    SOL_SERVICE.on('exit', (code) => { 
        //restart
        startSol()
    });
}
//start eth services
const startEth = () => {console.log('eth started')
    //for eth
    ETH_SERVICE = fork('./process/eth.js');
    ETH_SERVICE.send({type:'tokens', data:TOKENS})
    ETH_SERVICE.on('message', ({type, data}) => {
        if(type == 'mint'){
            infoGroup(data[0], data[1], data[2], data[3], data[4], data[5], data[6])
        }
    });
    ETH_SERVICE.on('exit', (code) => { 
        //restart
        startEth()
    });
}
//start eth services
const startBsc = () => {console.log('bsc started')
    //for eth
    BSC_SERVICE = fork('./process/bsc.js');
    BSC_SERVICE.send({type:'tokens', data:TOKENS})
    BSC_SERVICE.on('message', ({type, data}) => {
        if(type == 'mint'){
            infoGroup(data[0], data[1], data[2], data[3], data[4], data[5], data[6])
        }
    });
    BSC_SERVICE.on('exit', (code) => { 
        //restart
        startBsc()
    });
}
//to send message to group
const infoGroup = async (token, tokBal, postBal, preBal, trader, hash, network='sol') => {
    try{
        //loop through registered tokens
        const reg = TOKENS[token] || [] //replace with the actual token
        //construct the message first
        const msgInfo = (network=='sol')?await fetchTokenInfo(token, network, tokBal, (postBal - preBal),preBal, trader, hash, token):await fetchTokenInfo(token, network, tokBal, postBal,preBal, trader, hash, token)
        //check if the min buy and buy step is followed
        for(let i =0;i<reg.length;i++) {  
                if(msgInfo?.spent?.usd >= reg[i]?.setting.minBuy){
                    if(Math.abs(reg[i]?.usd - msgInfo?.spent?.usd) >= reg[i]?.setting.buyStep) {
                        //check if bot still part of the group
                        if((await isBotInGroup(reg[i]?.groupId))){
                            reg[i].usd = msgInfo?.spent?.usd //save the current usd value
                            const msgData = msg(msgInfo, reg[i]?.setting)
                            const imgF = Buffer.from((reg[i]?.setting?.setting?.media?.file), 'base64')
                            if((reg[i]?.setting?.setting?.media?.mime || "").indexOf('image') > -1){console.log(0)
                                bot.sendPhoto(reg[i]?.groupId, imgF, { 
                                    caption: msgData, 
                                    parse_mode: 'HTML' 
                                });
                            }
                            else if((reg[i]?.setting?.setting?.media?.mime || "").indexOf('video') > -1){
                                bot.sendVideo(reg[i]?.groupId, imgF, { 
                                    caption: msgData, 
                                    parse_mode: 'HTML' 
                                });
                            }
                            else{
                                bot.sendMessage(reg[i]?.groupId, msgData, { parse_mode: "HTML" })
                            }
                        }
                        else{
                            removeToken(token, reg[i]?.userId, reg[i]?.groupId, network)
                        }
                    }
                }
        }
    }
    catch(e){console.log(e)}
}
const fetchTokenInfo = async (token, network='sol', solBal, tokBal, preBal, trader, sig, tt) => {
    try{
        if(network == 'sol') {
            const price = ((solBal / tokBal) * NETWORK_PRICE[network]) || 0
            //fetch the market cap
            if(!TOKENS['info'][token]?.info){
                TOKENS['info'][token] = await getTokenInfo(network, tt)
            }
            return {
                name:TOKENS['info'][token]?.name,
                symbol:TOKENS['info'][token]?.symbol,
                market:(TOKENS['info'][token]?.supply * price) || 0,
                spent:{usd:(solBal * NETWORK_PRICE[network]) || 0, bal:(solBal || 0)},
                got:{usd:(tokBal * price) || 0, bal:(tokBal || 0)},
                price,
                holder:(preBal > 0)?((tokBal/preBal) * 100) || 0:0,
                dex:`https://dexscreener.com/solana/${token}`,
                bird:`https://birdeye.so/token/${token}?chain=solana`,
                buyer:`https://solscan.io/account/${trader}`,
                tx:`https://solscan.io/tx/${sig}`,
                token:`https://solscan.io/token/${token}`,
                buy:`https://jup.ag/swap/SOL-${token}`,
                network
            }
        }
        else {
            //fetch the market cap
            if(!TOKENS['info'][token]?.info){
                TOKENS['info'][token] = await getTokenInfo(network, tt)
            }
            solBal = (Number(solBal) / 1E18)
            tokBal = (Number(tokBal) / 10**TOKENS['info'][token]?.decimal)
            const price = ((solBal / tokBal) * NETWORK_PRICE[network] || 0)
            //fetch the pre balance of the user
            const preTokBal = (Number(await getTokenBalance(token, trader, network)) / 10**TOKENS['info'][token]?.decimal)-tokBal
            return {
                name:TOKENS['info'][token]?.name,
                symbol:TOKENS['info'][token]?.symbol,
                market:(TOKENS['info'][token]?.supply * price) || 0,
                spent:{usd:(solBal * NETWORK_PRICE[network]) || 0, bal:(solBal || 0)},
                got:{usd:(tokBal * price) || 0, bal:(tokBal || 0)},
                price,
                holder:(preTokBal > 0)?((tokBal/preTokBal) * 100) || 0:0,
                dex:`https://dexscreener.com/${network}/${token}`,
                bird:`https://birdeye.so/token/${token}?chain=${network}`,
                buyer:`https://${(network=='bsc')?'bscscan.com':'etherscan.io'}/address/${trader}`,
                tx:(network=='bsc')?`https://bscscan.com/tx/${sig}`:`https://etherscan.io/tx/${sig}`,
                token:(network=='bsc')?`https://bscscan.com/token/${token}`:`https://etherscan.io/token/${token}`,
                buy:`https://app.uniswap.org/swap`,
                network:(network=='bsc')?'bnb':'eth'
            }
        }
    }
    catch(e){return {}}
}
//generate the emoJi
function genEmoji(char, num) {
    let count;num = num * 1;
    // Determine the number of times to repeat the character
    if (num < 1000) {
        count = 20;
    } else if (num < 20000) {
        count = 35;
    } else if (num >= 100000) {
        count = 50;
    } else {
        count = 0; // Optional, handle as needed
    }
    // Return the character repeated `count` times
    return char.repeat(count);
}
//generate the msg
const msg = (params, setting) => {
const options = {
    minimumFractionDigits: 4,  
    maximumFractionDigits: 4,  
}
const emoJis = {
    'default':{
        buy:'💰',
        sold:'💰',
        buyer:'👤',
        pos:'💹',
        price:'🏷️',
        market:'💱'
    },
    'dark':{
        buy:'☑️',
        sold:'☑️',
        buyer:'👤',
        pos:'➰',
        price:'⚙️',
        market:'⚙️'
    }
}

return `
<a href="${params?.token}">${params?.name || ""}</a> Buy!
${genEmoji(setting?.buyEmoji, params?.spent?.usd)}

${emoJis[setting?.layout.toLowerCase()]['sold']} Sold <b>$${params?.spent?.usd?.toLocaleString('en-US', options)} (${params?.spent?.bal?.toLocaleString('en-US', options)} ${params.network.toUpperCase()})</b>
${emoJis[setting?.layout.toLowerCase()]['buy']} <b style='color:limegreen'>Bought (${params?.got?.bal?.toLocaleString('en-US', options)} ${params?.symbol})</b>
${emoJis[setting?.layout.toLowerCase()]['buyer']}  <a href="${params?.buyer}">Buyer</a>
${emoJis[setting?.layout.toLowerCase()]['pos']}  ${(params?.holder > 0)?"Position +" + params?.holder.toLocaleString('en-US', options) + "%": "New holder"}
${(setting?.price)?emoJis[setting?.layout.toLowerCase()]['price'] + " Price $" + params?.price.toLocaleString('en-US', options) : ""}
${(setting?.market)?emoJis[setting?.layout.toLowerCase()]['market'] + "💸 Market Cap $" + params?.market.toLocaleString('en-US', options):""}

${(setting?.chart == 'DexScreener')?'<a href="' + params?.dex + '">Screener</a>':'<a href="' + params?.bird + '">BirdEye</a>'} | <a href="${params?.buy}">Buy</a> | <a href="${params?.tx}">TX</a>
`
}
//synce usd value
const syncUsdVal = async () => {
    const eth = await getBatchUsdBal('ethereum')
    const bsc = await getBatchUsdBal('binancecoin')
    const sol = await getBatchUsdBal('solana')
    if(eth && bsc && sol) {
        NETWORK_PRICE['eth'] = eth
        NETWORK_PRICE['sol'] = bsc
        NETWORK_PRICE['bsc'] = sol
        setTimeout(syncUsdVal, 86400*1E3) //refresh in the next 24 hrs
    }
    else {
        setTimeout(syncUsdVal, 10000) //refresh in the 10s
    }
    console.log(NETWORK_PRICE)
}

