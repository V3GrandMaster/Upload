const tokensMainnet = {
  bsc: [
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    '0x55d398326f99059fF775485246999027B3197955', // USDT
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
    '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'  // CAKE
  ],
  ethereum: [
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eb48'  // USDC
  ],
  polygon: [
    '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'  // USDT
  ],
  arbitrum: [
    '0x82aF49447D8a07e3bd95BD0d56f352415231aa11', // WETH
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'  // USDC
  ],
  base: [
    '0x4200000000000000000000000000000000000006', // WETH
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // USDC
  ],
  avalanche: [
    '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
    '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'  // USDC
  ]
};

const tokensTestnet = {
  bsc: [
    '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd', // USDT Testnet (Quan trọng nhất)
    '0xed24fc36d5ee211ea25a80239fb8c4cfd80f12ee', // BUSD Testnet
    '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd', // WBNB Testnet
    '0xFa60D973F7642B748046464e165A65B7323b0DEE', // CAKE Testnet
    '0x8ba1f109551bd432803012645ac136ddd64dba72', // BTCB Testnet
    '0x64544969ed7eb0db99466654e6902ec000310afc', // ETH Testnet
    '0xd66c6b4f0be8ce5b39d52e0fd1344c389929b378'  // DOT Testnet
  ],
  // Các mạng khác để trống nếu bạn chưa chạy
  ethereum: [],
  polygon: [],
  arbitrum: [],
  base: [],
  avalanche: []
};

module.exports = process.env.IS_TESTNET === 'true' ? tokensTestnet : tokensMainnet;