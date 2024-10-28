const { Connection } = require("@solana/web3.js");

/**
 * Monitors Sol
*/
const DEXS = [
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", 
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", 
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", 
]
const WRAPPED_SOL = "So11111111111111111111111111111111111111112"
const connection = new Connection(process.env.SOL_RPC_URL, 'confirmed');
const slow = new Connection(process.env.SOL_RPC_URL_OTHER, 'confirmed');
let LOGS = [] 
let TOKENS = []
process.on('message', ({type, data}) => {
    if(type == 'tokens') {
        TOKENS = data
    }
});

// Function to start listening for confirmed transactions
slow.onLogs('all', async ({logs, signature}) => {
        try{
            // /push the log to the array
            if(isDex(logs)) {  
                LOGS.push(signature) //push to array for processing
            }
        }
        catch(e){console.log(e)}
}, 'finalized');
//processTx
const processTx = async () => {  
    const sigs = LOGS.slice(0, 70);
    LOGS = LOGS.slice(70)
    try{
        if(sigs.length>0){ 
            const txs = (await connection.getParsedTransactions(sigs, {maxSupportedTransactionVersion:0}));
            if(txs.length>0){
                for(let i=0;i<txs.length;i++){
                    const tx = txs[i]; const signature = tx?.transaction.signatures[0];  
                    if(tx?.meta && signature) {
                        const actKeys = tx?.transaction.message.accountKeys
                        const solBal = (tx?.meta.postBalances[0] - tx?.meta.preBalances[0] + tx?.meta.fee)/1E9
                        if(solBal < 0){  
                            //a sol sell
                            for(let i=0;i<tx?.meta.postTokenBalances.length;i++) { 
                                if(tx?.meta.postTokenBalances[i]?.owner == actKeys[0]?.pubkey){ 
                                    const tokenBal = (tx?.meta.postTokenBalances[i]?.uiTokenAmount?.uiAmount || 0) - (tx?.meta.preTokenBalances[i]?.uiTokenAmount?.uiAmount || 0)
                                    const mint = tx?.meta.postTokenBalances[i]?.mint
                                    if(tokenBal > 0){ 
                                        //check if the token is not a wrapped sol
                                        if(mint !== WRAPPED_SOL) {   
                                            //check if the token is in the registered tokens
                                            if(TOKENS['token'].includes(mint)){console.log(mint, TOKENS['token'].includes(mint))
                                                //registered token, send the msg to the group
                                                process.send({type:'mint', data:[
                                                    mint, 
                                                    Math.abs(solBal), 
                                                    Math.abs(tx?.meta.postTokenBalances[i]?.uiTokenAmount?.uiAmount * 1),
                                                    Math.abs(tx?.meta.preTokenBalances[i]?.uiTokenAmount?.uiAmount * 1),
                                                    tx?.meta.postTokenBalances[i]?.owner,
                                                    signature,
                                                    "sol"
                                                ]})
                                                break;
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
    setTimeout(processTx, process.env.TX_TIME)
}
processTx()
//to check if its a swap transaction
const isDex = (log) => {
    for(let i=0;i<log.length;i++){ 
        if((log[i].toLowerCase().indexOf('swap') > -1
         || log[i].indexOf(DEXS[0]) > -1
         || log[i].indexOf(DEXS[1]) > -1
         || log[i].indexOf(DEXS[2]) > -1)
         && log[i].toLowerCase().indexOf('failed') == -1) {
            return true
        }
    }
    return false
}
