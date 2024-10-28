const { Connection } = require("@solana/web3.js")
const User = require("./model/user")
const bot = require('./bot')
const { getTokenInfo, getTokenBalance, clean, getBatchUsdBal } = require("./utils")
const {Web3} = require('web3');
const { isBotInGroup } = require("./group");


/** To Monitor Trades */
const TOKENS = {info:[]}
const WRAPPED_SOL = "So11111111111111111111111111111111111111112"
const WRAPPED_BNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"
const WRAPPED_ETH= "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
const testToken = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"
const NETWORK_PRICE = {
    'eth':1000, 'sol':300, 'bsc':10
}
let LOGS = [] 
let BSC_BLOCK = 0;
let ETH_BLOCK = 0;

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
        syncUsdVal() //services to sync usd
        kickOff() //start monitoring buys
    }catch(e){console.log(e)}
}
//start monitoring
const kickOff = () => {
    // Connect to the Solana
    const connection = new Connection(process.env.SOL_RPC_URL, 'confirmed');  
    // Function to start listening for confirmed transactions
    connection.onLogs('all', async ({logs, signature}) => {
        try{
            // /push the log to the array
            if(isDex(logs)) {
                LOGS.push(signature) //push to array for processing
            }
        }
        catch(e){console.log(e)}
    }, 'finalized');
    //for bsc
    const web3 = new Web3(process.env.BSC_RPC_URL);
    const ethWeb3 = new Web3(process.env.ETH_RPC_URL);
    //for sol
    const procesTx = async () => {  
        const sigs = LOGS.slice(0, 20);
        LOGS = LOGS.slice(20)
        try{
            if(sigs.length>0){ 
                const txs = (await connection.getParsedTransactions(sigs, {maxSupportedTransactionVersion:0}));
                if(txs.length>0){
                    for(let i=0;i<txs.length;i++){
                        const tx = txs[i]
                        if(tx?.meta) {
                            const actKeys = tx?.transaction.message.accountKeys
                            const solBal = (tx?.meta.postBalances[0] - tx?.meta.preBalances[0] + tx?.meta.fee)/1E9
                            if(solBal < 0){ 
                                //a sol sell
                                for(let i=0;i<tx?.meta.postTokenBalances.length && i < 1;i++) { 
                                    if(tx?.meta.postTokenBalances[i]?.owner == actKeys[0]?.pubkey){ 
                                        const tokenBal = (tx?.meta.postTokenBalances[i]?.uiTokenAmount?.uiAmount || 0) - (tx?.meta.preTokenBalances[i]?.uiTokenAmount?.uiAmount || 0)
                                        const mint = tx?.meta.preTokenBalances[i]?.mint
                                        if(tokenBal > 0){ 
                                            //check if the token is not a wrapped sol
                                            if(mint !== WRAPPED_SOL) {   
                                                //check if the token is in the registered tokens
                                                if(TOKENS['token'].includes(mint)){ 
                                                    //registered token, send the msg to the group
                                                    await infoGroup(
                                                        mint, 
                                                        Math.abs(solBal), 
                                                        Math.abs(tx?.meta.postTokenBalances[i]?.uiTokenAmount?.uiAmount * 1),
                                                        Math.abs(tx?.meta.preTokenBalances[i]?.uiTokenAmount?.uiAmount * 1),
                                                        tx?.meta.postTokenBalances[i]?.owner,
                                                        signature,
                                                        "sol"
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            
                        }
                    }
                }
                
            }
        }
        catch(e){console.log(e)}
        setTimeout(procesTx, process.env.TX_TIME)
    }
    //for bsc
    const processBsc = async () => {
        try {
            // Fetch the latest block
            const block = await web3.eth.getBlock('latest');c
            if(block && BSC_BLOCK != block.number) { 
                BSC_BLOCK = block.number
                const {transactions=null} = block
                if(transactions) {
                    //append it the tx lists
                    for(let i=transactions.length-1;i>-1;i--){
                        const hash = transactions[i]
                        if(hash) { 
                            //get the logs of the tx
                            let {logs, from} = await web3.eth.getTransactionReceipt(hash);
                            if (logs && from) {
                                from = from.toLowerCase()
                                // decode the logs
                                const tokenBals = {}
                                for(let i=0;i<logs.length;i++){
                                    if (logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                                        //transfer log
                                        const decoded = web3.eth.abi.decodeLog(
                                            [
                                                { type: 'address', name: 'from', indexed: true },
                                                { type: 'address', name: 'to', indexed: true },
                                                { type: 'uint256', name: 'value' }
                                            ],
                                            logs[i].data,
                                            logs[i].topics.slice(1) // Remove the first topic which is the event signature
                                        );
                                        //seperate the from
                                        const tokenAddress = logs[i]?.address.toLowerCase()
                                        if(decoded?.from.toLowerCase() == from && tokenAddress == WRAPPED_BNB) {
                                            //save all the wbn sent
                                            tokenBals['wbnb'] = tokenBals['wbnb'] || 0n
                                            tokenBals['wbnb']+= decoded?.value
                                        }
                                        else if(decoded?.to.toLowerCase() == from && TOKENS['token'].includes(tokenAddress)) {
                                            //save the token monitored
                                            tokenBals[tokenAddress] = tokenBals[tokenAddress] || 0n
                                            tokenBals[tokenAddress]+= decoded?.value //add value
                                        }
                                        else if(decoded?.from.toLowerCase() == from && TOKENS['token'].includes(tokenAddress)) {
                                            //save the token monitored
                                            tokenBals[tokenAddress] = tokenBals[tokenAddress] || 0n
                                            tokenBals[tokenAddress]-= decoded?.value //subtract value
                                        }
                                    }
                                }
                                //check for wbnb tx
                                if(tokenBals['wbnb']) {
                                    const keys = Object.keys(tokenBals)
                                    for(let i =0;i<keys.length;i++){
                                        if(keys[i] != 'wbnb' && tokenBals[keys[i]] > 0){
                                            //registered token, send the msg to the group
                                            await infoGroup(
                                                keys[i], 
                                                tokenBals['wbnb'], 
                                                tokenBals[keys[i]],
                                                0,
                                                from,
                                                hash,
                                                "bsc"
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        //put a 10s delay
                        await new Promise(resolve => setTimeout(resolve, process.env.TX_TIME));
                    }
                }
            }
            //fetch the next batch in the next 4s
        } catch (error) {console.error('Error fetching latest block:', error);}
        setTimeout(processBsc, 4000)
    }
    //for eth
    const processEth = async () => {
        try {
            // Fetch the latest block
            const block = await ethWeb3.eth.getBlock('latest');
            if(block && ETH_BLOCK != block.number) {  
                ETH_BLOCK = block.number; 
                const {transactions=null} = block
                if(transactions) {
                    //append it the tx lists
                    for(let i=transactions.length-1;i>-1;i--){
                        const hash = transactions[i]
                        if(hash) { 
                            //get the logs of the tx
                            let {logs, from} = await ethWeb3.eth.getTransactionReceipt(hash);
                            if (logs && from) {
                                from = from.toLowerCase()
                                // decode the logs
                                const tokenBals = {}
                                for(let i=0;i<logs.length;i++){
                                    if (logs[i].topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                                        //transfer log
                                        const decoded = ethWeb3.eth.abi.decodeLog(
                                            [
                                                { type: 'address', name: 'from', indexed: true },
                                                { type: 'address', name: 'to', indexed: true },
                                                { type: 'uint256', name: 'value' }
                                            ],
                                            logs[i].data,
                                            logs[i].topics.slice(1) // Remove the first topic which is the event signature
                                        );
                                        //seperate the from
                                        const tokenAddress = logs[i]?.address.toLowerCase()
                                        if(decoded?.from.toLowerCase() == from && tokenAddress == WRAPPED_ETH) {
                                            //save all the wbn sent
                                            tokenBals['weth'] = tokenBals['wbnb'] || 0n
                                            tokenBals['weth']+= decoded?.value
                                        }
                                        else if(decoded?.to.toLowerCase() == from && TOKENS['token'].includes(tokenAddress)) {
                                            //save the token monitored
                                            tokenBals[tokenAddress] = tokenBals[tokenAddress] || 0n
                                            tokenBals[tokenAddress]+= decoded?.value //add value
                                        }
                                        else if(decoded?.from.toLowerCase() == from && TOKENS['token'].includes(tokenAddress)) {
                                            //save the token monitored
                                            tokenBals[tokenAddress] = tokenBals[tokenAddress] || 0n
                                            tokenBals[tokenAddress]-= decoded?.value //subtract value
                                        }
                                    }
                                }
                                //check for wbnb tx
                                if(tokenBals['weth']) {
                                    const keys = Object.keys(tokenBals)
                                    for(let i =0;i<keys.length;i++){
                                        if(keys[i] != 'weth' && tokenBals[keys[i]] > 0){
                                            //registered token, send the msg to the group
                                            await infoGroup(
                                                keys[i], 
                                                tokenBals['weth'], 
                                                tokenBals[keys[i]],
                                                0,
                                                from,
                                                hash,
                                                "bsc"
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        //put a 10s delay
                        await new Promise(resolve => setTimeout(resolve, process.env.TX_TIME));
                    }
                }
            }
        } catch (error) {console.error('Error fetching latest block:', error);}
        //fetch the next batch in the next 15
        setTimeout(processEth, 15000)
    }
    processBsc()
    processEth()
    procesTx()
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
                if(msgInfo?.spent?.usd >= reg[i]?.minBuy){
                    if(Math.abs(reg[i]?.usd - msgInfo?.spent?.usd) >= reg[i]?.buyStep) {
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
//to check if its a swap transaction
const isDex = (log) => {
    for(let i=0;i<log.length;i++){
        if(log[i].toLowerCase().indexOf('swap') > -1) {
            return true
        }
    }
    return false
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
${emoJis[setting?.layout.toLowerCase()]['pos']}  ${(params?.holder > 0)?"Position +" + params?.holder + "%": "New holder"}
${emoJis[setting?.layout.toLowerCase()]['price']}${(setting?.price)?" Price $" + params?.price.toLocaleString('en-US', options) : ""}
${emoJis[setting?.layout.toLowerCase()]['market']}${(setting?.market)?"💸 Market Cap $" + params?.market.toLocaleString('en-US', options):""}

${(setting?.chart == 'DexScreener')?'<a href="' + params?.dex + '">Screener</a>':'<a href="' + params?.bird + '">BirdEye</a>'} | <a href="${params?.buy}">Buy</a> | <a href="${params?.tx}">TX</a>
`
}
//synce usd value
const syncUsdVal = async () => {
    const res = await getBatchUsdBal('eth,sol,bnb')
    if(res) {
        NETWORK_PRICE['eth'] = res['ETH']['USD']
        NETWORK_PRICE['sol'] = res['SOL']['USD']
        NETWORK_PRICE['bsc'] = res['BNB']['USD']
    }
    setTimeout(syncUsdVal, 86400*1E3) //refresh in the next 24 hrs
}

