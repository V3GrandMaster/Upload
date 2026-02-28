require("@nomiclabs/hardhat-waffle");
require("dotenv").config();

module.exports = {
  solidity: "0.8.0",
  networks: {
    bscTestnet: {
      url: process.env.BSC_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 97
    }
  }
};