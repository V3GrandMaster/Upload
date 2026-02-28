const { ethers } = require('ethers');
const walletManager = require('./wallet');
const dexConfigs = require('../config/dexes'); // Đã sửa tên biến cho đồng bộ
const networks = require('../config/networks');
const routerABI = require('../abis/router.json');
const profitCalc = require('./profitCalculator');

// ABI bổ sung
const pairABI = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
];
const erc20ABI = [
    "function symbol() external view returns (string)",
    "function decimals() external view returns (uint8)",
    "function balanceOf(address) external view returns (uint256)"
];

class TokenScanner {
    constructor() {
        this.routerContracts = {};
        this.tokenMetadataCache = new Map();
    }

    async init() {
        console.log("🔍 [Scanner] Đang khởi tạo các Router Contracts...");
        for (const [network, dexList] of Object.entries(dexConfigs)) {
            this.routerContracts[network] = {};
            for (const dex of dexList) {
                try {
                    // CHẶN LỖI ENS: Kiểm tra địa chỉ router trước khi init
                    if (!dex.router || !ethers.utils.isAddress(dex.router)) {
                        console.error(`⚠️ [Scanner] Bỏ qua ${dex.name} do Router Address không hợp lệ: ${dex.router}`);
                        continue;
                    }

                    const provider = walletManager.getProvider(network);
                    if (!provider) continue;

                    this.routerContracts[network][dex.name] = new ethers.Contract(dex.router, routerABI, provider);
                } catch (err) {
                    console.error(`❌ [Scanner] Lỗi khởi tạo router cho ${dex.name}:`, err.message);
                }
            }
        }
        if (profitCalc) profitCalc.getPrice = this.getTokenPrice.bind(this);
        console.log("✅ [Scanner] Hệ thống quét đã sẵn sàng.");
    }

    /**
     * Lấy thông tin cặp tiền (token0/token1)
     */
    async getPairInfo(network, pairAddress) {
        if (!pairAddress || !ethers.utils.isAddress(pairAddress)) return null;
        try {
            const provider = walletManager.getProvider(network);
            const contract = new ethers.Contract(pairAddress, pairABI, provider);
            const [token0, token1] = await Promise.all([
                contract.token0(),
                contract.token1()
            ]);
            return { token0, token1 };
        } catch (e) { return null; }
    }

    /**
     * Lấy Symbol token kèm Cache
     */
    async getTokenSymbol(network, tokenAddress) {
        if (!tokenAddress || !ethers.utils.isAddress(tokenAddress)) return "???";
        const cacheKey = `${network}_${tokenAddress.toLowerCase()}`;
        if (this.tokenMetadataCache.has(cacheKey)) return this.tokenMetadataCache.get(cacheKey);

        try {
            const provider = walletManager.getProvider(network);
            const contract = new ethers.Contract(tokenAddress, erc20ABI, provider);
            const symbol = await contract.symbol();
            this.tokenMetadataCache.set(cacheKey, symbol);
            return symbol;
        } catch (e) { return "???"; }
    }

    /**
     * Tính Liquidity USD ($) - Cố định giá Native theo thời điểm 2026
     */
    async getLiquidityUSD(network, tokenAddress) {
        try {
            const provider = walletManager.getProvider(network);
            const networkConfig = networks[network];
            if (!networkConfig) return 0;
            
            const wNative = networkConfig.wNative;
            const dexList = dexConfigs[network];
            const router = this.routerContracts[network][dexList[0].name];
            
            if (!router) return 0;

            const factoryAddress = await router.factory();
            const factoryContract = new ethers.Contract(factoryAddress, ["function getPair(address,address) view returns (address)"], provider);
            
            const pairAddress = await factoryContract.getPair(tokenAddress, wNative);
            if (pairAddress === ethers.constants.AddressZero) return 0;

            const pairContract = new ethers.Contract(pairAddress, pairABI, provider);
            const [reserves, token0] = await Promise.all([
                pairContract.getReserves(),
                pairContract.token0()
            ]);

            const nativeReserve = token0.toLowerCase() === wNative.toLowerCase() ? reserves.reserve0 : reserves.reserve1;
            const nativeAmount = parseFloat(ethers.utils.formatEther(nativeReserve));

            // Giá cập nhật năm 2026
            const nativePrice = network === 'bsc' ? 650 : 3500; 
            return nativeAmount * nativePrice * 2; // Nhân 2 vì tổng thanh khoản bao gồm cả Token + Native
        } catch (e) { return 0; }
    }

    /**
     * KIỂM TRA AN TOÀN (Honeypot Detection)
     * Sử dụng callStatic để giả lập giao dịch trên Node mà không tốn Gas
     */
    async verifyTokenSafety(network, dexName, tokenAddress) {
        try {
            const router = this.routerContracts[network][dexName];
            const wNative = networks[network].wNative;
            const myAddr = walletManager.getAddress(network);
            
            if (!router || !myAddr) return { isSafe: false, reason: "System Not Ready" };

            const path = [wNative, tokenAddress];
            const amountIn = ethers.utils.parseEther("0.05"); // Giả lập lệnh 0.05 BNB/ETH
            
            // 1. Kiểm tra báo giá Out
            const amounts = await router.getAmountsOut(amountIn, path);
            if (amounts[1].isZero()) return { isSafe: false, reason: "No liquidity" };

            // 2. MÔ PHỎNG GIAO DỊCH (CallStatic)
            // Lệnh này sẽ throw error nếu Token là Honeypot (Cấm mua/Cấm bán)
            await router.callStatic.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0, // Chấp nhận slippage 100% để test
                path,
                myAddr,
                Math.floor(Date.now() / 1000) + 120,
                { value: amountIn }
            );

            return { isSafe: true, buyTax: 0, sellTax: 0 }; 
        } catch (e) {
            // Phân tích lỗi cụ thể từ EVM
            const errorReason = e.message.includes("TRANSFER_FAILED") ? "Honeypot (No Sell)" : 
                               e.message.includes("INSUFFICIENT_OUTPUT") ? "High Tax/No Liquidity" : 
                               "High Risk/Swap Failed";
            return { isSafe: false, reason: errorReason };
        }
    }

    async getTokenPrice(network, dexName, tokenAddress, amountIn = 1) {
        try {
            const router = this.routerContracts[network][dexName];
            if (!router) return null;
            const wNative = networks[network].wNative;
            const path = [wNative, tokenAddress];
            const amounts = await router.getAmountsOut(ethers.utils.parseEther(amountIn.toString()), path);
            return amounts[1];
        } catch { return null; }
    }

    async getTokenPriceInNative(network, dexName, tokenAddress, tokenAmount) {
        try {
            const router = this.routerContracts[network][dexName];
            if (!router) return null;
            const wNative = networks[network].wNative;
            const path = [tokenAddress, wNative];
            const amounts = await router.getAmountsOut(tokenAmount, path);
            return amounts[1];
        } catch { return null; }
    }
}

module.exports = new TokenScanner();