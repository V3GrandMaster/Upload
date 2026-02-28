const chalk = require('chalk');
const { ethers } = require('ethers');

/**
 * Tạm dừng thực thi trong một khoảng thời gian
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rút gọn địa chỉ ví/contract để hiển thị log đẹp hơn
 * Ví dụ: 0x1234...abcd
 */
function shortenAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format số lượng token dựa trên Decimals thực tế
 */
function formatUnits(wei, decimals = 18, precision = 4) {
  try {
    return Number(ethers.utils.formatUnits(wei, decimals)).toFixed(precision);
  } catch (error) {
    return "0.0000";
  }
}

/**
 * Chuyển đổi từ số thực sang BigNumber dựa trên Decimals
 */
function parseUnits(amount, decimals = 18) {
  try {
    return ethers.utils.parseUnits(amount.toString(), decimals);
  } catch (error) {
    return ethers.constants.Zero;
  }
}

/**
 * Hiển thị Banner khi khởi động Bot
 */
function showBanner() {
  console.clear();
  console.log(chalk.cyan(`
    ███████╗███╗   ██╗██╗██████╗ ███████╗██████╗ 
    ██╔════╝████╗  ██║██║██╔══██╗██╔════╝██╔══██╗
    ███████╗██╔██╗ ██║██║██████╔╝█████╗  ██████╔╝
    ╚════██║██║╚██╗██║██║██╔═══╝ ██╔══╝  ██╔══██╗
    ███████║██║ ╚████║██║██║     ███████╗██║  ██║
    ╚══════╝╚═╝  ╚═══╝╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝
  `));
  console.log(chalk.yellow('══════════════════════════════════════════════════'));
  console.log(chalk.green('        ULTRA-FAST SNIPER & ARBITRAGE BOT'));
  console.log(chalk.green('        FLASH SWAP + PRIVATE MEMPOOL'));
  console.log(chalk.yellow('══════════════════════════════════════════════════\n'));
}

module.exports = {
  sleep,
  shortenAddress,
  formatUnits,
  parseUnits,
  showBanner
};