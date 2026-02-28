const { ethers } = require('ethers');

/**
 * CẤU HÌNH TESTNET
 */
const dexesTestnet = {
  bsc: [
    {
      name: 'PancakeSwap',
      factory: '0x6725F303b657a9451d8BA641348b6761A6CC7a17',
      router: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
      initCodeHash: '0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5',
      logo: '🥞',
      fee: 0.0025,
      isV2: true
    },
    {
      name: 'BakerySwap', 
      factory: '0x01b67773582a6980d6394f1c90b841ef02c82119', 
      router: '0xCDe33f42c2323fD61299942a000D01905E9b8054', // Địa chỉ gây lỗi Checksum
      initCodeHash: '0xe34f30c6607d353664d4c72a8323a6358cc10e97666276a6b9e5a8dae23b864b',
      logo: '🥐',
      fee: 0.003,
      isV2: true
    }
  ],
  ethereum: [
    {
      name: 'UniswapV2_Sepolia',
      factory: '0x7E0987E5b3a30e3f2828572Bb659A548460a3003',
      router: '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008',
      initCodeHash: '0x96e8ac5811a349022c901283736b6d973b551e8abed31ff8ad6dad06a7883c91',
      logo: '🦄',
      fee: 0.003,
      isV2: true
    }
  ]
};

const dexesMainnet = {
  bsc: [
    {
      name: 'PancakeSwap_V2',
      factory: '0xca143ce32fe78f1f7019d7d551a6402fc5350c73',
      router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      initCodeHash: '0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5',
      logo: '🥞',
      fee: 0.0025,
      isV2: true
    }
  ]
};

const isTestnet = process.env.IS_TESTNET === 'true';

/**
 * Hàm chuẩn hóa địa chỉ - Đã thêm toLowerCase() để tránh lỗi Checksum
 */
const validateAndFormat = (config) => {
  const formatted = {};
  for (const [chain, list] of Object.entries(config)) {
    formatted[chain] = list.map(dex => {
      try {
        return {
          ...dex,
          // Chuyển về lowercase trước khi đưa vào getAddress để Ethers tự tính lại Checksum đúng
          factory: ethers.utils.getAddress(dex.factory.toLowerCase()), 
          router: ethers.utils.getAddress(dex.router.toLowerCase())
        };
      } catch (e) {
        console.error(`❌ Lỗi định dạng địa chỉ tại sàn ${dex.name}: ${e.message}`);
        return dex;
      }
    });
  }
  return formatted;
};

const activeDexes = isTestnet ? dexesTestnet : dexesMainnet;

module.exports = validateAndFormat(activeDexes);