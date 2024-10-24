/** Utilities **/
const { Connection, PublicKey } = require('@solana/web3.js');
const { Metaplex } = require("@metaplex-foundation/js");
const { getMint } = require('@solana/spl-token');
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
        const mintInfo = await connection.getParsedAccountInfo(mintAddress);
        const mintTokenInfo = await getMint(connection, mintAddress);
        const totalSupply = Number(mintTokenInfo.supply) / Math.pow(10, mintTokenInfo.decimals);
        // Get the number of decimals
        if (mintInfo.value.data.parsed.info) {
          const decimal = mintInfo.value.data.parsed.info.decimals;
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
      const chains = {'eth':1, 'bsc':56}
      const tokens = "&addresses" + encodeURIComponent(`[1]`) + `=${tokenAddress}`;
      const url = `https://deep-index.moralis.io/api/v2.2/erc20/metadata?chain=0x${Number(
        chains[chain]
      ).toString(16)}${tokens}`;
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-API-Key": `${process.env.MORALIS_KEY}`,
        },
      });
      if (resp.ok) {
        const meta = await resp.json();
        return {
          name:meta[0]?.name,
          symbol:meta[0]?.symbol,
          supply:meta[0]?.total_supply_formatted
        } 
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
      return buffer
  } catch (error) {
      console.error('Error downloading file:', error);
  }
  return false
};