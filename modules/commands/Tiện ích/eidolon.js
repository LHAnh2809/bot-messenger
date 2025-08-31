module.exports.config = {
    name: "eidolon",
    version: "1.0.0",
    hasPermission: 0,
    credits: "LHAnh",
    description: "Kiểm tra chu kỳ ngày/đêm Cetus (Eidolon)",
    commandCategory: "Tiện ích",
    usages: "",
    cooldowns: 5
};

module.exports.run = async function ({ api, event }) {
    const send = (msg) => api.sendMessage(msg, event.threadID, event.messageID);
    const axios = require('axios');
    send('🔍 Đang kiểm tra chu kỳ Cetus...');
    try {
        const { data } = await axios.get('https://api.warframestat.us/pc/cetusCycle', { timeout: 10000 });
        const { isDay, timeLeft, expiry } = data;
        if (isDay) {
            send(`🌞 Đang BAN NGÀY — sẽ chuyển sang TỐI sau: ${timeLeft} (lúc ${new Date(expiry).toLocaleString('vi-VN', { hour12: false })})`);
        } else {
            send(`🌙 ĐANG BAN ĐÊM — sẽ chuyển sang NGÀY sau: ${timeLeft} (lúc ${new Date(expiry).toLocaleString('vi-VN', { hour12: false })})`);
        }
    } catch (error) {
        send(`❌ Lỗi API Cetus: ${error.message}`);
    }
};
