/** Utilities **/

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
exports.getTokenInfo = async (chain = 1, tokenArr = []) => {
    //fecth the resourcess
    const supportedChains = {
        'eth':{
            coingeckoId:'ethereum',
        },
        'bsc':{
            cryptocompareId:'bnb',
        },
        'sol':{
            coingeckoId:'solana',
        }
    }
    try {
      //loop through
      let tokenMeta = [];
      while (tokenArr.length > 0) {
        const token = tokenArr.pop();
        //wait for the 50ms. fetch 20tokens per secs
        await new Promise((resolve) => setTimeout(resolve, 50));
        const url = `https://api.coingecko.com/api/v3/coins/${supportedChains[chain].coingeckoId}/contract/${token}`;
        const resp = await fetch(url, {
          method: "GET",
          headers: {
            accept: "application/json",
            "x-cg-demo-api-key": process.env.COINGECKO_KEY,
          },
        });
        if (resp.ok) {
          const meta = await resp.json();
          tokenMeta.push(meta);
        }
      }
      return tokenMeta;
    } catch (error) {
      console.log(error);
      return false;
    }
  };