const { ethers } = require('ethers');
const walletManager = require('./wallet');
const logger = require('../utils/logger');

class Mempool {
  constructor() {
    this.wallets = {}; // Cache các ví đã kết nối với provider
    this.pendingTxHashes = new Set(); // MỚI: Theo dõi các giao dịch đang chờ xử lý
  }

  /**
   * Lấy ví đã được kết nối với Provider tương ứng
   */
  getConnectedWallet(network, isPrivate = true) {
    const key = `${network}_${isPrivate ? 'private' : 'public'}`;
    if (this.wallets[key]) return this.wallets[key];

    // Bổ sung kiểm tra hàm lấy provider tránh lỗi undefined
    const provider = isPrivate 
      ? (walletManager.getPrivateProvider ? walletManager.getPrivateProvider(network) : walletManager.getProvider(network))
      : walletManager.getProvider(network);
    
    const baseWallet = walletManager.getWallet(network);
    if (!baseWallet) return null;

    const wallet = baseWallet.connect(provider);
    this.wallets[key] = wallet;
    return wallet;
  }

  async sendTransaction(network, tx) {
    try {
      // 1. Thử gửi qua Private RPC (Tránh bị bot khác soi Mempool - Frontrun)
      const privateWallet = this.getConnectedWallet(network, true);
      
      logger.info(`📤 Đang gửi giao dịch qua Private Mempool (${network})...`);
      
      // Bổ sung: Gắn nonce thủ công nếu cần để tránh kẹt giao dịch
      if (!tx.nonce) {
          tx.nonce = await privateWallet.getTransactionCount("pending");
      }

      const response = await privateWallet.sendTransaction(tx);
      this.pendingTxHashes.add(response.hash);
      
      return response;
    } catch (error) {
      // Nếu lỗi không phải do mạng (ví dụ: Gas quá thấp), không cần fallback
      if (error.message.includes('insufficient funds') || error.message.includes('gas too low')) {
        throw error;
      }

      logger.warn(`⚠️ Private RPC lỗi hoặc không hỗ trợ, đang chuyển sang Public RPC...`);
      
      // 2. Fallback sang Public RPC (Cần tốc độ bù lại rủi ro)
      const publicWallet = this.getConnectedWallet(network, false);
      const response = await publicWallet.sendTransaction(tx);
      this.pendingTxHashes.add(response.hash);
      
      return response;
    }
  }

  /**
   * MỚI: Chờ giao dịch được xác nhận trên Blockchain
   */
  async waitForTransaction(network, txResponse, confirmations = 1) {
    try {
      logger.info(`⏳ Đang chờ xác nhận giao dịch: ${txResponse.hash}`);
      const receipt = await txResponse.wait(confirmations);
      
      if (receipt.status === 1) {
        logger.success(`✅ Giao dịch thành công tại block: ${receipt.blockNumber}`);
      } else {
        logger.error(`❌ Giao dịch thất bại (Reverted)`);
      }
      
      this.pendingTxHashes.delete(txResponse.hash);
      return receipt;
    } catch (error) {
      logger.error(`❌ Lỗi khi xác nhận giao dịch: ${error.message}`);
      this.pendingTxHashes.delete(txResponse.hash);
      return null;
    }
  }

  /**
   * MỚI: Gửi đồng thời lên nhiều node (Tăng tỉ lệ thắng khi Sniping)
   * Lưu ý: Chỉ dùng khi chấp nhận bị lộ Mempool nhưng cần tốc độ cực cao
   */
  async broadcastTurbo(network, tx) {
    const privWallet = this.getConnectedWallet(network, true);
    const pubWallet = this.getConnectedWallet(network, false);
    
    logger.info(`🚀 [TURBO] Phát sóng giao dịch lên tất cả các node...`);
    
    // Gửi đồng thời không chờ đợi lẫn nhau
    return Promise.any([
        privWallet.sendTransaction(tx),
        pubWallet.sendTransaction(tx)
    ]);
  }
}

module.exports = new Mempool();