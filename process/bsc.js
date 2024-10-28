/**
 * ETH PROCESS
 */
const {Web3} = require('web3');

const WRAPPED_BNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"
const web3 = new Web3(process.env.BSC_RPC_URL);
    
let TOKENS = []
let BSC_BLOCK = 0;
process.on('message', ({type, data}) => {
    if(type == 'tokens') {
        TOKENS = data
    }
});
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
                        if (logs && from) {console.log(from)
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
//processBsc()
