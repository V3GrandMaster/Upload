const scanner = require('./scanner');
const profitCalc = require('./profitCalculator');
const executor = require('./executor');
const dexes = require('../config/dexes');
const popularTokens = require('../config/tokens');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class ArbitrageScanner {
  constructor() {
    this.isScanning = false;
    this.dynamicTokens = []; 
    this.currentTokenInfo = "Đang khởi động..."; 
    this.currentIndex = 0;
    this.totalTokens = 0;
    this.tokensToScan = []; // Mảng chứa object {symbol, address} để logger hiển thị
  }

  /**
   * Lưu token mới vĩnh viễn vào file cấu hình tokens.js
   */
  async saveTokenToFile(network, tokenAddress) {
    try {
        const filePath = path.join(process.cwd(), 'src', 'config', 'tokens.js');
        delete require.cache[require.resolve(filePath)];
        const currentData = require(filePath);
        
        if (!currentData[network]) currentData[network] = [];
        
        const addr = tokenAddress.toLowerCase();
        if (!currentData[network].includes(addr)) {
            currentData[network].push(addr);
            const content = `module.exports = ${JSON.stringify(currentData, null, 4)};`;
            fs.writeFileSync(filePath, content);
            console.log(chalk.green(`[DATABASE] Đã lưu vĩnh viễn token mới: ${addr}`));
        }
    } catch (e) {
        console.error(chalk.red(`[ERROR] Không thể ghi file tokens.js: ${e.message}`));
    }
  }

  /**
   * Kiểm tra thanh khoản token
   */
  async checkLiquidityRequirement(network, tokenAddress) {
    if (process.env.TEST_MODE === 'true') return true;
    try {
        const liquidityUSD = await scanner.getLiquidityUSD(network, tokenAddress);
        const minLiquidity = 1000; 
        if (liquidityUSD >= minLiquidity) return true;
        return false;
    } catch (e) {
        return false;
    }
  }

  /**
   * Thêm token mới vào danh sách quét và trả về thông tin để Logger thông báo
   */
  async addDynamicToken(network, tokenAddress) {
    if (!tokenAddress) return null;
    const addr = tokenAddress.toLowerCase();
    
    const allKnown = [...(popularTokens[network] || []), ...this.dynamicTokens];
    if (allKnown.includes(addr)) return null;

    const isValid = await this.checkLiquidityRequirement(network, addr);
    
    if (isValid) {
        this.dynamicTokens.push(addr);
        await this.saveTokenToFile(network, addr);
        
        // Lấy symbol để báo về main.js
        const symbol = await scanner.getTokenSymbol(network, addr) || "Unknown";
        console.log(chalk.magenta(`[LEARNING] Đã nạp token tiềm năng: ${symbol} (${addr})`));
        return { symbol, address: addr };
    }
    return null;
  }

  /**
   * Cập nhật mảng tokensToScan để Logger lấy dữ liệu in ra Telegram
   */
  async updateTokensToScan(network) {
    const defaultTokens = popularTokens[network] || [];
    const allAddresses = [...new Set([...defaultTokens, ...this.dynamicTokens])];
    
    const updatedList = [];
    for (const addr of allAddresses) {
        try {
            const symbol = await scanner.getTokenSymbol(network, addr) || "Unknown";
            updatedList.push({ symbol, address: addr });
        } catch (e) {
            updatedList.push({ symbol: '???', address: addr });
        }
    }
    this.tokensToScan = updatedList;
    this.totalTokens = updatedList.length;
  }

  startScanning(network, interval = 3000) {
    logger.info(`🚀 Bắt đầu quét Arbitrage trên mạng ${network}...`);
    
    // Cập nhật danh sách hiển thị lần đầu
    this.updateTokensToScan(network).catch(() => {});

    setInterval(async () => {
      if (this.isScanning) return;
      
      try {
        this.isScanning = true;
        
        // Làm mới danh sách token mỗi chu kỳ để cập nhật token mới học được
        await this.updateTokensToScan(network);
        
        for (let i = 0; i < this.tokensToScan.length; i++) {
          const token = this.tokensToScan[i];
          this.currentIndex = i + 1;
          
          this.currentTokenInfo = `${this.currentIndex}/${this.totalTokens} (${token.symbol})`;

          await this.checkArbitrageForToken(network, token.address);
        }
      } catch (error) {
      } finally {
        this.isScanning = false;
      }
    }, interval);
  }

  async checkArbitrageForToken(network, tokenAddress) {
    try {
      const dexList = dexes[network] || [];
      const prices = {};

      await Promise.all(dexList.map(async (dex) => {
        try {
          // Lấy giá với lượng nhỏ để check nhanh
          const price = await scanner.getTokenPrice(network, dex.name, tokenAddress, '0.1');
          if (price) prices[dex.name] = price;
        } catch (e) { }
      }));

      const dexNames = Object.keys(prices);
      if (dexNames.length < 2) return;

      for (let i = 0; i < dexNames.length; i++) {
        for (let j = i + 1; j < dexNames.length; j++) {
          const dexA = dexNames[i];
          const dexB = dexNames[j];
          const priceA = prices[dexA];
          const priceB = prices[dexB];

          if (priceA.lt(priceB)) {
            await this.evaluateTrade(network, dexA, dexB, tokenAddress);
          } else if (priceB.lt(priceA)) {
            await this.evaluateTrade(network, dexB, dexA, tokenAddress);
          }
        }
      }
    } catch (error) { }
  }

  async evaluateTrade(network, buyDexName, sellDexName, tokenAddress) {
    try {
      const isTestMode = process.env.TEST_MODE === 'true';
      const dexList = dexes[network];
      const buyDex = dexList.find(d => d.name === buyDexName);
      const sellDex = dexList.find(d => d.name === sellDexName);
      const amountIn = process.env.ARBITRAGE_AMOUNT || '0.05';

      const profitData = await profitCalc.calculateFlashArbitrageProfit(
        network, buyDex, sellDex, tokenAddress, amountIn
      );

      if (profitData && profitData.isProfitable) {
        if (isTestMode) {
          logger.success(`🛠 [TEST] Chênh lệch giá tại: ${tokenAddress}`);
        } else {
          logger.success(`🔥 KÈO NGON: Mua ${buyDexName} -> Bán ${sellDexName}`);
        }

        logger.info(`Lợi nhuận dự tính: ${profitData.netProfit} ${network.toUpperCase()}`);
        
        await executor.executeFlashArbitrage(
          network, buyDex, sellDex, tokenAddress, amountIn, profitData.netProfit
        );
      }
    } catch (error) {
      logger.error(`Lỗi khi đánh giá giao dịch: ${error.message}`);
    }
  }
}

module.exports = new ArbitrageScanner();