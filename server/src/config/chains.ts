const API_KEY = process.env.ALCHEMY_API_KEY!;

export const BLOCKCHAINS = {
    ethereum: {
        ws: `wss://eth-mainnet.g.alchemy.com/v2/${API_KEY}`,
        https: `https://eth-mainnet.g.alchemy.com/v2/${API_KEY}`,
        chainId: 1
    },
};