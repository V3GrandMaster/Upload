const { ethers } = require('ethers');
const walletManager = require('./wallet');
const dexes = require('../config/dexes');
const logger = require('../utils/logger');
const scanner = require('./scanner'); 
const chalk = require('chalk');

class PairListener {
  constructor() {
    this.listeners = [];
    this.isListening = false;
    this.pairCache = new Map(); // MỚI: Cache thông tin Pair để tăng tốc độ xử lý
  }

  async startListening(onSwapCallback) {
    if (this.isListening) return;
    this.isListening = true;

    for (const [network, dexList] of Object.entries(dexes)) {
      const provider = walletManager.getProvider(network);
      if (!provider) continue;

      // Filter lắng nghe sự kiện Swap - Trái tim của mọi biến động giá
      const swapTopic = ethers.utils.id("Swap(address,uint256,uint256,uint256,uint256,address)");
      
      const filter = {
        topics: [swapTopic]
      };

      logger.info(chalk.cyan(`📡 Đang bám theo dòng tiền (Active Swap) trên ${network}...`));

      provider.on(filter, async (log) => {
        try {
          const pairAddress = log.address.toLowerCase();

          // 1. Lấy thông tin token thực tế (Sử dụng Cache để tối ưu tốc độ)
          let pairInfo = this.pairCache.get(pairAddress);
          if (!pairInfo) {
            pairInfo = await scanner.getPairInfo(network, log.address);
            if (pairInfo) this.pairCache.set(pairAddress, pairInfo);
          }
          
          if (!pairInfo || !pairInfo.token0 || !pairInfo.token1) return;

          // 2. Xác định đâu là Token tiềm năng (không phải là Native Token)
          const wNative = require('../config/networks')[network]?.wNative?.toLowerCase();
          
          let targetToken = null;
          let isBuy = false;

          if (pairInfo.token0.toLowerCase() === wNative) {
            targetToken = pairInfo.token1;
          } else if (pairInfo.token1.toLowerCase() === wNative) {
            targetToken = pairInfo.token0;
          }

          if (targetToken) {
            // MỚI: Giải mã dữ liệu Swap để biết khối lượng giao dịch (Volume) và chiều giao dịch
            // Swap (sender, amount0In, amount1In, amount0Out, amount1Out, to)
            const decoded = ethers.utils.defaultAbiCoder.decode(
              ['uint256', 'uint256', 'uint256', 'uint256'], 
              log.data
            );
            
            const amount0In = decoded[0];
            const amount1In = decoded[1];
            const amount0Out = decoded[2];
            const amount1Out = decoded[3];

            // Xác định xem đây là lệnh Mua hay Bán targetToken
            // Nếu Native Token đi vào (In) và Target Token đi ra (Out) -> MUA
            if (pairInfo.token0.toLowerCase() === wNative) {
                isBuy = amount0In.gt(0) && amount1Out.gt(0);
            } else {
                isBuy = amount1In.gt(0) && amount0Out.gt(0);
            }

            // Nhận diện sàn DEX dựa trên địa chỉ (Nếu bạn có danh sách Factory)
            const dexName = dexList[0].name; 

            const eventData = {
              network,
              dex: dexName, 
              pairAddress: log.address,
              token0: pairInfo.token0,
              token1: pairInfo.token1,
              targetToken: targetToken,
              isBuy: isBuy, // Thông tin quý giá cho Sniping Logic
              amountIn: isBuy ? (pairInfo.token0.toLowerCase() === wNative ? amount0In : amount1In) : null,
              timestamp: Date.now()
            };

            // 3. Chuyển dữ liệu về index.js
            if (onSwapCallback) {
              await onSwapCallback(eventData);
            }
          }

        } catch (innerError) {
          // Bỏ qua lỗi rác khi parse log
        }
      });

      this.listeners.push({ network, provider });
    }
  }

  stopListening() {
    this.listeners.forEach(({ provider }) => {
      logger.info(chalk.yellow(`🛑 Dừng lắng nghe dòng tiền...`));
      provider.removeAllListeners();
    });
    this.listeners = [];
    this.pairCache.clear();
    this.isListening = false;
  }
}

module.exports = new PairListener();