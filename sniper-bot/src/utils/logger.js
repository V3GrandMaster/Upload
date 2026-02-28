const chalk = require('chalk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const networks = require('../config/networks');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ID_STORAGE_PATH = path.join(process.cwd(), 'logs', 'msg_ids.json');

if (!fs.existsSync(path.dirname(ID_STORAGE_PATH))) {
    fs.mkdirSync(path.dirname(ID_STORAGE_PATH), { recursive: true });
}

let lastMessageIds = { scanning: null, balance: null, system: null };
if (fs.existsSync(ID_STORAGE_PATH)) {
    try {
        lastMessageIds = JSON.parse(fs.readFileSync(ID_STORAGE_PATH, 'utf8'));
    } catch (e) {
        lastMessageIds = { scanning: null, balance: null, system: null };
    }
}

const saveIds = () => {
    try {
        fs.writeFileSync(ID_STORAGE_PATH, JSON.stringify(lastMessageIds, null, 2));
    } catch (e) {
        console.error(chalk.red("❌ [ERROR] Lỗi ghi file log ID:"), e.message);
    }
};

const getVNTime = () => {
    return new Date().toLocaleString('vi-VN', { 
        timeZone: 'Asia/Ho_Chi_Minh', hour12: false 
    });
};

const logger = {
    clearAllOnRestart: async () => {
        console.log(chalk.magenta('🧹 [SYSTEM] Đang dọn dẹp tin nhắn cũ...'));
        for (const type in lastMessageIds) {
            if (lastMessageIds[type]) {
                try {
                    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`, {
                        chat_id: CHAT_ID,
                        message_id: lastMessageIds[type]
                    });
                } catch (e) {}
            }
        }
        lastMessageIds = { scanning: null, balance: null, system: null };
        saveIds();
    },

    status: async (message, type = 'balance') => {
        const vnTime = getVNTime().split(' ')[1];
        const icon = type === 'balance' ? '💰' : (type === 'scanning' ? '🔍' : '⚙️');
        
        if (lastMessageIds[type]) {
            try {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`, {
                    chat_id: CHAT_ID,
                    message_id: lastMessageIds[type]
                });
            } catch (e) {}
        }

        try {
            const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            if (response.data && response.data.ok) {
                lastMessageIds[type] = response.data.result.message_id;
                saveIds();
                console.log(chalk.cyan(icon), `[${vnTime}] Đã cập nhật ${type}`);
            }
        } catch (error) {
            console.error(chalk.red(`❌ [TELEGRAM] Lỗi gửi ${type}:`), error.message);
        }
    },

    // --- HÀM MỚI: HIỂN THỊ DANH SÁCH TOKEN ĐANG QUÉT ---
    displayScanningStatus: async (network, tokensArray) => {
        const vnTime = getVNTime().split(' ')[1];
        let message = `🔍 <b>HỆ THỐNG ĐANG QUÉT TRÊN:</b> ${network.toUpperCase()}\n`;
        message += `------------------------------------------\n`;
        
        if (!tokensArray || tokensArray.length === 0) {
            message += `<i>Chưa có token nào trong danh sách quét...</i>`;
        } else {
            tokensArray.forEach((token, index) => {
                // Đánh số thứ tự - [Symbol] - Địa chỉ Contract (click để copy)
                message += `${index + 1}. <b>[${token.symbol}]</b> <code>${token.address}</code>\n`;
            });
        }

        message += `\n------------------------------------------\n`;
        message += `📈 <b>Tổng cộng:</b> ${tokensArray.length} Tokens\n`;
        message += `⏰ <b>Cập nhật:</b> ${vnTime}`;

        // Gọi lại hàm status với type 'scanning' để tự động ghi đè tin cũ
        await logger.status(message, 'scanning');
    },

    newDiscovery: (network, symbol, address) => {
        const msg = `🎓 <b>NEW TOKEN DISCOVERY</b>\n----------------------------------\n🌐 <b>Mạng:</b> ${network.toUpperCase()}\n💎 <b>Token:</b> ${symbol}\n📍 <b>Địa chỉ:</b> <code>${address}</code>\n✅ <b>Trạng thái:</b> Đã lọc thanh khoản & thêm vào Database.`;
        axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: msg,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        }).catch(() => {});
    },

    success: (message, network = 'bsc', txHash = null) => {
        const time = getVNTime();
        let link = "";
        if (txHash) {
            const baseUrl = networks[network]?.scanUrl || 'https://bscscan.com';
            link = `\n🔗 <b>Explorer:</b> <a href="${baseUrl}/tx/${txHash}">Xem giao dịch</a>`;
        }
        axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: `✨ <b>VICTORY ACHIEVED!</b> ✨\n----------------------------------\n💰 <b>Trạng thái:</b> 🟢 THÀNH CÔNG\n⏰ <b>Thời gian:</b> ${time}\n📝 <b>Chi tiết:</b> ${message}${link}`,
            parse_mode: 'HTML',
            disable_web_page_preview: false
        }).catch(() => {});
    },

    info: (msg) => console.log(chalk.blue('ℹ'), `[${getVNTime().split(' ')[1]}]`, msg),
    error: (msg) => console.error(chalk.red('✖'), `[${getVNTime()}]`, msg)
};

module.exports = logger;