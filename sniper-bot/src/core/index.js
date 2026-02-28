require('dotenv').config();
const { ethers } = require('ethers'); 
const chalk = require('chalk');
const logger = require('../utils/logger');
const walletManager = require('./wallet');
const listener = require('./listener');
const scanner = require('./scanner');
const executor = require('./executor');
const arbitrageScanner = require('./arbitrageScanner');
const profitCalculator = require('./profitCalculator'); 
const dexConfigs = require('../config/dexes');          
const { showBanner } = require('../utils/helpers');

/**
 * Utility: Lấy thời gian Việt Nam định dạng chuẩn
 */
const getVNTimeFull = () => {
    const d = new Date();
    const datePart = d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const timePart = d.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
    return `${timePart} ${datePart}`;
};

async function main() {
  try {
    showBanner();

    // 1. KHỞI TẠO VÀ DỌN DẸP
    await logger.clearAllOnRestart();
    logger.info("🚀 Hệ thống khởi động: CHẾ ĐỘ MUA-BÁN TỨC THÌ (ATOMIC LOGIC)...");
    
    // Khởi tạo ví trước khi làm bất cứ việc gì khác
    await walletManager.init();
    const network = 'bsc'; 
    const myAddress = walletManager.getAddress(network);

    if (!myAddress || !ethers.utils.isAddress(myAddress)) {
        throw new Error("Không thể xác định địa chỉ ví. Kiểm tra PRIVATE_KEY trong .env");
    }

    // 2. CẤU HÌNH SMART CONTRACT & PROVIDER
    const flashAddr = process.env.FLASH_CONTRACT_ADDRESS;
    const isTest = process.env.TEST_MODE === 'true' || process.env.IS_TESTNET === 'true';
    const currency = isTest ? 'tBNB' : 'BNB';

    // Đảm bảo Flash Contract Address hợp lệ để tránh lỗi ENS
    if (flashAddr && ethers.utils.isAddress(flashAddr) && flashAddr !== ethers.constants.AddressZero) {
        executor.setFlashContractAddress(network, flashAddr);
    } else {
        logger.warn("⚠️ Cảnh báo: Flash Contract chưa được cấu hình. Chế độ Arbitrage Swap sẽ bị hạn chế.");
    }

    // Ưu tiên dùng Private RPC để giảm độ trễ (Latency)
    const rpcUrl = process.env.BSC_PRIVATE_RPC || process.env.BSC_RPC;
    if (!rpcUrl) throw new Error("Thiếu cấu hình RPC trong .env");
    
    const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);

    // Theo dõi tiến độ Block
    provider.on('block', (blockNumber) => {
        if (blockNumber % 5 === 0) {
            const timeOnly = new Date().toLocaleTimeString('vi-VN', { hour12: false });
            console.log(chalk.gray(`[${timeOnly}] 📦 Block: ${blockNumber}`));
        }
    });

    // Khởi tạo Scanner (Nạp ABI và các Router)
    await scanner.init();

    // 3. CẬP NHẬT TRẠNG THÁI QUÉT (Mỗi 30 giây)
    setInterval(async () => {
        try {
            const activeTokens = arbitrageScanner.tokensToScan || []; 
            if (activeTokens.length > 0) {
                await logger.displayScanningStatus(network, activeTokens);
            } else {
                await logger.status(`🔍 <b>Hệ thống:</b> Đang chờ nạp danh sách Token...`, 'scanning');
            }
        } catch (err) {
            console.error(chalk.red("❌ Lỗi hiển thị danh sách quét:"), err.message);
        }
    }, 30000); 

    // 4. BÁO CÁO TÀI SẢN ĐỊNH KỲ (Mỗi 6 phút)
    setInterval(async () => {
        try {
            const walletBalance = await provider.getBalance(myAddress);
            const walletEth = ethers.utils.formatEther(walletBalance);

            let contractEth = "0.0000";
            if (flashAddr && ethers.utils.isAddress(flashAddr)) {
                try {
                    const cBalance = await provider.getBalance(flashAddr);
                    contractEth = ethers.utils.formatEther(cBalance);
                } catch (e) { contractEth = "N/A"; }
            }

            const balanceReport = 
`💰 <b>BÁO CÁO TÀI SẢN</b>
----------------------------------
👤 <b>Ví cá nhân:</b> <code>${parseFloat(walletEth).toFixed(5)}</code> ${currency}
🤖 <b>Contract:</b> <code>${parseFloat(contractEth).toFixed(5)}</code> ${currency}
----------------------------------
⏱ <b>Cập nhật:</b> ${getVNTimeFull()}`;

            await logger.status(balanceReport, 'balance');
        } catch (err) {
            logger.error(`Lỗi cập nhật số dư: ${err.message}`);
        }
    }, 360000); 

    // 5. LUỒNG SNIPING & KHÁM PHÁ TOKEN (REAL-TIME)
    listener.startListening(async (pairData) => {
      try {
        const currentNetwork = pairData.network || network;
        const targetToken = pairData.targetToken;

        if (!targetToken || !ethers.utils.isAddress(targetToken)) return;

        // TỰ ĐỘNG HỌC TOKEN (Discovery Mode)
        const learned = await arbitrageScanner.addDynamicToken(currentNetwork, targetToken);
        if (learned && learned.symbol) {
            logger.newDiscovery(currentNetwork, learned.symbol, targetToken);
        }

        // Kiểm tra cấu hình sàn DEX tương ứng
        const dex = dexConfigs[currentNetwork]?.find(d => d.name === pairData.dex);
        if (!dex) return;

        const amountIn = process.env.BUY_AMOUNT || '0.1';
        
        // Phân tích lợi nhuận & Check Honeypot/Tax
        const analysis = await profitCalculator.calculateSnipingCost(currentNetwork, dex, targetToken, amountIn);
        
        if (analysis && analysis.isWorth) {
          logger.success(`🎯 Kèo thơm! Lãi ròng dự kiến: ${analysis.netProfit} ${currency}`, currentNetwork);
          
          // Thực thi Atomic Swap: Buy -> Sell
          const buyReceipt = await executor.executeBuy(currentNetwork, pairData.dex, targetToken, amountIn);
          
          if (buyReceipt && buyReceipt.status === 1) {
             logger.info(`🔥 Đã mua thành công, đang thực hiện bán chốt lãi...`);
             const sellReceipt = await executor.executeSell(currentNetwork, pairData.dex, targetToken);
             
             if (sellReceipt && sellReceipt.status === 1) {
                 logger.success(`✅ CHU KỲ HOÀN TẤT! Đã chốt lãi thành công.`, currentNetwork, sellReceipt.transactionHash);
             }
          }
        }
      } catch (err) {
        logger.error(`⚠️ Lỗi luồng xử lý: ${err.message}`);
      }
    });

    // 6. KÍCH HOẠT QUÉT GIÁ (ARBITRAGE SCAN)
    arbitrageScanner.startScanning(network, 5000);
    
    await logger.status('✅ <b>Hệ thống:</b> Bot đã sẵn sàng chiến đấu.', 'system');

    // Dừng bot an toàn
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n🛑 Đang đóng các kết nối...'));
      await logger.status('🛑 <b>Hệ thống:</b> Bot đã dừng.', 'system');
      process.exit(0);
    });

  } catch (error) {
    logger.error("❌ Lỗi khởi động nghiêm trọng: " + error.message);
    process.exit(1);
  }
}

main();