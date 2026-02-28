const { ethers } = require('ethers');
const networks = require('../config/networks');

class WalletManager {
  constructor() {
    this.wallets = {};
    this.providers = {};
  }

  async init() {
    const isTestnet = process.env.IS_TESTNET === 'true';
    const networkName = 'bsc';
    const config = networks[networkName];

    const staticNetwork = {
      name: isTestnet ? 'bnbt' : 'bsc',
      chainId: isTestnet ? 97 : 56
    };

    const rpcUrl = process.env.BSC_RPC;

    try {
      if (rpcUrl.startsWith('wss')) {
        this.providers[networkName] = new ethers.providers.WebSocketProvider(rpcUrl, staticNetwork);
        
        // MỚI: Thêm cơ chế xử lý lỗi WebSocket để tự động reconnect
        this.providers[networkName]._websocket.on('close', () => {
           console.log(`⚠️ WebSocket [${config.name}] closed. Reconnecting...`);
           setTimeout(() => this.init(), 5000);
        });

        console.log(`⚡ WebSocket [${config.name}]: Connected.`);
      } else {
        this.providers[networkName] = new ethers.providers.StaticJsonRpcProvider(rpcUrl, staticNetwork);
        console.log(`🌐 HTTP RPC [${config.name}]: Connected.`);
      }

      const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.providers[networkName]);
      this.wallets[networkName] = wallet;

      const balance = await wallet.getBalance();
      
      console.log('══════════════════════════════════════════════════');
      console.log(`✅ Wallet: ${wallet.address}`);
      console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} ${config.nativeToken}`);
      console.log('══════════════════════════════════════════════════');

    } catch (err) {
      console.error(`❌ WalletManager Error: ${err.message}`);
      // MỚI: Nếu lỗi kết nối, thử lại sau 10 giây thay vì sập bot hoàn toàn
      setTimeout(() => this.init(), 10000);
    }
  }

  // --- HÀM MỚI THÊM VÀO ĐỂ SỬA LỖI CHO INDEX.JS ---
  getAddress(network = 'bsc') {
    return this.wallets[network]?.address;
  }

  getWallet(network = 'bsc') { 
    return this.wallets[network]; 
  }

  getProvider(network = 'bsc') { 
    return this.providers[network]; 
  }

  // MỚI: Lấy Signer để thực hiện ký giao dịch nhanh (dùng cho Executor)
  getSigner(network = 'bsc') {
    return this.wallets[network];
  }

  // MỚI: Hàm kiểm tra số dư nhanh (trả về số thực)
  async getBalanceInEther(network = 'bsc') {
    try {
        const balance = await this.wallets[network].getBalance();
        return parseFloat(ethers.utils.formatEther(balance));
    } catch (e) {
        return 0;
    }
  }
}

module.exports = new WalletManager();