/** Utilities **/
const { Connection, PublicKey } = require('@solana/web3.js');
const { Metaplex } = require("@metaplex-foundation/js");
const {Web3} = require('web3');
const bot = require('./bot');

// Function to check if an address is a valid EVM address
exports.isEvm = (address) => {
    // Check if the address is a 42-character string starting with '0x' and is a valid hex string
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
// Function to check if an address is a valid Solana address
exports.isSol = (address) => {
    // Solana uses Base58 and addresses are typically between 32 and 44 characters
    const base58Regex = /^[A-HJ-NP-Za-km-z1-9]{32,44}$/;
    return base58Regex.test(address);
}
//get token information by contract address
exports.getTokenInfo = async (chain = 'eth', tokenAddress) => { 
    //fecth the resourcess
    if(chain == 'sol'){
      // Solana mainnet endpoint
      const connection = new Connection(process.env.SOL_RPC_URL);
      // Replace with the mint address of the Solana token
      const mintAddress = new PublicKey(tokenAddress);
      try {
        const mintTokenInfo = await fetch(process.env.SOL_RPC_URL, {
          method: "POST",
          headers: {
              "Content-Type": "application/json"
          },
          body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getTokenSupply",
              params: [tokenAddress]
          })
        })
        let totalSupply = 0;let decimal = 0;
        // Get the number of decimals
        if (mintTokenInfo.ok) {
          const res = await mintTokenInfo.json()
          totalSupply = res?.result?.value?.uiAmount
          decimal = res?.result?.value?.decimals
          const meta = Metaplex.make(connection);
          const tokenMetadata = await meta
            .nfts()
            .findAllByMintList({ mints: [mintAddress] });
          for (let i = 0; i < tokenMetadata.length; i++) {
            if (tokenMetadata[i] != null) {
              //fectch the meta info
              try{
                const metaInfo = await fetch(tokenMetadata[i]?.uri)
                if(metaInfo.ok) {
                  const info = await metaInfo.json()
                  tokenMetadata[i] = {...tokenMetadata[i], ...info}
                }
              }catch(e){}
             
              return {
                address:tokenAddress,
                name: tokenMetadata[i].name,
                symbol: tokenMetadata[i].symbol,
                meta_uri: tokenMetadata[i].uri,
                description:tokenMetadata[i]?.description,
                logo:tokenMetadata[i]?.image || tokenMetadata[i]?.logo,
                decimal,
                supply:totalSupply
              };
            }
          }
        }
      } catch (error) {
          console.error('Error getting token info:', error);
      }
    }
    else { 
      // Connect to an Ethereum node (e.g., Infura or your own node)
      const web3 = new Web3((chain=='bsc')?process.env.BSC_RPC_URL:process.env.ETH_RPC_URL);
      // Minimal ABI with `name`, `symbol`, and `totalSupply` functions
      const minABI = [
          // name
          {
              "constant": true,
              "inputs": [],
              "name": "name",
              "outputs": [{"name": "", "type": "string"}],
              "type": "function"
          },
          // symbol
          {
              "constant": true,
              "inputs": [],
              "name": "symbol",
              "outputs": [{"name": "", "type": "string"}],
              "type": "function"
          },
          // totalSupply
          {
              "constant": true,
              "inputs": [],
              "name": "totalSupply",
              "outputs": [{"name": "", "type": "uint256"}],
              "type": "function"
          },
          //decimals
          {
            "constant": true,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint256"}],
            "type": "function"
        }
      ];
      // Create contract instance with the minimal ABI
      const contract = new web3.eth.Contract(minABI, tokenAddress);
      const name = await contract.methods.name().call();
      const symbol = await contract.methods.symbol().call();
      const totalSupply = await contract.methods.totalSupply().call();
      const decimal = await contract.methods.decimals().call();
      return {
        name, symbol, decimal:Number(decimal), supply:Number(totalSupply/BigInt(10**Number(decimal)))
      }
    }
    return {}
}
//download media sent
exports.downloadFile = async (fileId) => {
  try { 
      // Get file path
      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      // Fetch the file as an ArrayBuffer
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      // Convert ArrayBuffer to Buffer for saving to file
      const buffer = Buffer.from(arrayBuffer);
      const base64String = buffer.toString('base64');
      return base64String
  } catch (error) {
      console.error('Error downloading file:', error);
  }
  return false
};
//get the token balance of a user
exports.getTokenBalance = async (contractAddress, walletAddress, network='bsc') => {
    try {
        const web3 = new Web3((network=='bsc')?process.env.BSC_RPC_URL:process.env.ETH_RPC_URL);
        const minABI = [
          // balanceOf
          {
              "constant": true,
              "inputs": [{"name": "_owner", "type": "address"}],
              "name": "balanceOf",
              "outputs": [{"name": "balance", "type": "uint256"}],
              "type": "function"
          }
        ];
        // Create a new contract instance with the minimal ABI
        const contract = new web3.eth.Contract(minABI, contractAddress);

        // Call balanceOf method
        const bal = await contract.methods.balanceOf(walletAddress).call();

        return bal
    } catch (error) {
        console.error('Error fetching token balance:', error);
    }
}
//clean array
exports.clean = (arr) => {
  return arr.filter(item => {
    // Check for non-empty strings, numbers, booleans, and non-empty objects/arrays
    if (typeof item === 'string') return item.trim() !== ''; // Remove empty strings
    if (Array.isArray(item)) return item.length > 0; // Remove empty arrays
    if (typeof item === 'object' && item !== null) return Object.keys(item).length > 0; // Remove empty objects
    return item !== null && item !== undefined; // Remove null or undefined
  });
}
//to return usd value of token by batch
exports.getBatchUsdBal = async (token = 'eth') => {
  const url = `https://api.coingecko.com/api/v3/coins/${token}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const options = {
    method: 'GET',
    headers: {accept: 'application/json', 'x-cg-demo-api-key': process.env.COIN_GECKO}
  };
  const res = await fetch(url, options)
  if(res.ok) {
    const resp = await res.json()
    return resp?.market_data?.current_price?.usd || 0
  }
  return 0
}