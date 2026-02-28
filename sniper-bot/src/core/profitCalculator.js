const { ethers } = require('ethers');
const gasManager = require('./gasManager');
const logger = require('../utils/logger');

class ProfitCalculator {
  constructor() {
    this.scanner = null;
  }

  getScanner() {
    if (!this.scanner) {
      this.scanner = require('./scanner');
    }
    return this.scanner;
  }

  /**
   * Tính toán chi phí Sniping và lọc Tax (Token Rác)
   */
  async calculateSnipingCost(network, dex, tokenAddress, amountIn) {
    try {
      const isTestMode = process.env.TEST_MODE === 'true';
      const scanner = this.getScanner();
      
      // 1. Chuyển đổi amountIn sang Wei (BNB/ETH)
      const amountInWei = ethers.utils.parseEther(amountIn.toString());

      // 2. Ước tính phí Gas 3 bước: Mua (250k) + Approve (60k) + Bán (250k) = ~560k Gas
      // Chúng ta tính dôi dư lên 600k cho an toàn
      const totalGasWei = await gasManager.estimateGasCostWei(network, 600000); 
      
      // 3. Lấy số lượng Token nhận về khi Mua
      const tokensOut = await scanner.getTokenPrice(network, dex.name, tokenAddress, amountIn);
      if (!tokensOut || tokensOut.isZero()) return { isWorth: false };

      // 4. Lấy Decimals và chuyển đổi Token Out sang dạng đọc được để check giá Bán
      // Giả sử scanner đã có hàm getDecimals, nếu chưa ta dùng mặc định 18
      let decimals = 18;
      try {
          // Thêm hàm lấy decimals vào scanner nếu cần, hoặc mặc định
          decimals = await scanner.tokenMetadataCache.get(`${network}_${tokenAddress.toLowerCase()}_decimals`) || 18;
      } catch (e) {}

      const tokensOutFormatted = ethers.utils.formatUnits(tokensOut, decimals);

      // 5. Ước tính số Native (BNB/ETH) nhận lại nếu Xả ngay lập tức
      const nativeBackWei = await scanner.getTokenPriceInNative(network, dex.name, tokenAddress, tokensOut);

      if (!nativeBackWei || nativeBackWei.isZero()) return { isWorth: false };

      // 6. TÍNH TOÁN LỢI NHUẬN RÒNG
      // Net Profit = (Tiền thu về) - (Vốn bỏ ra) - (Phí Gas)
      const netProfitWei = nativeBackWei.sub(amountInWei).sub(totalGasWei);
      
      // Ngưỡng lợi nhuận tối thiểu (Ví dụ: 0.005 BNB)
      const minProfitTarget = ethers.utils.parseEther(process.env.MIN_PROFIT_TARGET || '0.005');

      // 7. BỘ LỌC TAX (Slippage + Tax)
      // Tính % thất thoát: ((Vốn - Thu về) / Vốn) * 100
      const lossPercent = amountInWei.sub(nativeBackWei).mul(100).div(amountInWei).toNumber();
      
      let isWorth = isTestMode ? true : netProfitWei.gt(minProfitTarget);
      
      // CẢNH BÁO CAO: Nếu chưa có biến động giá mà đã lỗ > 15% -> Token Tax cực cao (Rug-pull tiềm ẩn)
      if (lossPercent > 15 && !isTestMode) {
          logger.info(`⚠️ Né Token ${tokenAddress.slice(0,8)}: Tax/Trượt giá quá cao (${lossPercent}%)`);
          isWorth = false;
      }

      // 8. KIỂM TRA THANH KHOẢN THỰC TẾ
      const liquidityUSD = await scanner.getLiquidityUSD(network, tokenAddress);
      if (liquidityUSD < 1000 && !isTestMode) {
          logger.info(`📉 Thanh khoản quá thấp: $${liquidityUSD}`);
          isWorth = false;
      }

      return {
        totalCost: ethers.utils.formatEther(totalGasWei),
        netProfit: ethers.utils.formatEther(netProfitWei),
        lossPercent,
        isWorth,
        liquidityUSD
      };
    } catch (error) {
      logger.error(`❌ Lỗi ProfitCalc: ${error.message}`);
      return { isWorth: false };
    }
  }

  /**
   * Tính toán lợi nhuận Flash Arbitrage (Logic cũ được giữ lại và tối ưu)
   */
  async calculateFlashArbitrageProfit(network, buyDex, sellDex, tokenAddress, amountInNative) {
    try {
        const scanner = this.getScanner();
        const amountInWei = ethers.utils.parseEther(amountInNative.toString());
        
        // Phí gas cho Flashloan Arbitrage thường cao hơn (khoảng 800k - 1.2M gas)
        const totalGasWei = await gasManager.estimateGasCostWei(network, 1000000);

        const tokensFromA = await scanner.getTokenPrice(network, buyDex.name, tokenAddress, amountInNative);
        if (!tokensFromA) return { isProfitable: false };

        const nativeBackFromB = await scanner.getTokenPriceInNative(network, sellDex.name, tokenAddress, tokensFromA);
        if (!nativeBackFromB) return { isProfitable: false };

        const netProfitWei = nativeBackFromB.sub(amountInWei).sub(totalGasWei);

        return {
            isProfitable: netProfitWei.gt(0),
            netProfit: ethers.utils.formatEther(netProfitWei),
            totalGas: ethers.utils.formatEther(totalGasWei)
        };
    } catch (e) {
        return { isProfitable: false };
    }
  }
}

module.exports = new ProfitCalculator();