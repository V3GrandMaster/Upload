const { ethers } = require('ethers');
const walletManager = require('./wallet');

class GasManager {
  constructor() {
    this.lastGasPrice = {};
  }

  /**
   * Lấy giá Gas tối ưu dựa trên tình trạng mạng thực tế
   */
  async getOptimalGasPrice(network, isHighPriority = true) {
    try {
      const provider = walletManager.getProvider(network);
      
      // 1. Lấy dữ liệu gas từ mạng lưới (Hỗ trợ cả Legacy và EIP-1559 nếu có)
      const feeData = await provider.getFeeData();
      let gasPrice = feeData.gasPrice || await provider.getGasPrice();
      
      // Cập nhật bộ nhớ đệm
      this.lastGasPrice[network] = gasPrice;

      // 2. Tăng giá gas dựa trên mức độ ưu tiên
      // Snipe và Flashloan cần cạnh tranh nên thường tăng từ 20% - 50%
      if (isHighPriority) {
        const multiplier = process.env.GAS_MULTIPLIER || 125; // Mặc định tăng 25%
        gasPrice = gasPrice.mul(multiplier).div(100);
      }

      // 3. Giới hạn giá Gas trần (MAX_GAS_PRICE) để tránh cháy tài khoản khi mạng nghẽn
      const maxGasPrice = ethers.utils.parseUnits(process.env.MAX_GAS_PRICE || '15', 'gwei');

      if (gasPrice.gt(maxGasPrice)) {
        // Nếu là lệnh bán (Sell) thì vẫn nên cho phép gas cao để thoát hàng, 
        // nhưng ở đây ta tuân thủ giới hạn của người dùng.
        return maxGasPrice;
      }

      return gasPrice;
    } catch (error) {
      console.error(`❌ Lỗi lấy Gas Price: ${error.message}`);
      // Trả về giá gas mặc định an toàn nếu lỗi mạng
      return this.lastGasPrice[network] || ethers.utils.parseUnits('7', 'gwei');
    }
  }

  /**
   * Tính toán tổng chi phí Gas dự kiến theo đơn vị Wei
   */
  async estimateGasCostWei(network, gasLimit = 500000) {
    try {
      const gasPrice = await this.getOptimalGasPrice(network);
      return gasPrice.mul(gasLimit);
    } catch (e) {
      return ethers.utils.parseUnits('0.0035', 'ether'); // Mức phí dự phòng (~0.0035 BNB)
    }
  }

  /**
   * MỚI: Tính toán cấu hình EIP-1559 (MaxFeePerGas & MaxPriorityFeePerGas)
   * Giúp bot chạy mượt trên các mạng hiện đại
   */
  async getEIP1559Fees(network) {
    try {
      const provider = walletManager.getProvider(network);
      const feeData = await provider.getFeeData();
      
      // Tăng Priority Fee để thợ đào ưu tiên đóng block cho mình
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas.mul(150).div(100); 
      const maxFeePerGas = feeData.maxFeePerGas.mul(120).div(100);

      return {
        maxPriorityFeePerGas,
        maxFeePerGas
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * MỚI: Kiểm tra xem số dư có đủ để trả phí Gas hay không
   */
  async isBalanceEnoughForGas(network, address, gasLimit = 500000) {
    const provider = walletManager.getProvider(network);
    const balance = await provider.getBalance(address);
    const estimatedCost = await this.estimateGasCostWei(network, gasLimit);
    
    return balance.gt(estimatedCost);
  }
}

module.exports = new GasManager();