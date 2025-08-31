module.exports.config = {
    name: "voidcascade",
    aliases: ["voidcas"],
    version: "1.0.0",
    hasPermission: 0,
    credits: "LHAnh",
    description: "Kiểm tra nhiệm vụ Void Cascade",
    commandCategory: "Tiện ích",
    usages: "",
    cooldowns: 5
};

module.exports.run = async function ({ api, event }) {
    const send = (msg) => api.sendMessage(msg, event.threadID, event.messageID);
    const axios = require('axios');
    send("🔍 Đang kiểm tra nhiệm vụ Void Cascade...");
    try {
        const response = await axios.get("https://api.warframestat.us/pc/fissures", { timeout: 10000 });
        const fissures = response.data;
        const cascades = fissures.filter(mission =>
            mission.missionType === "Void Cascade" &&
            mission.isHard === true &&
            mission.active === true &&
            mission.expired === false
        );
        if (cascades.length > 0) {
            let message = "🔥 NHIỆM VỤ VOID CASCADE HIỆN TẠI 🔥\n\n";
            cascades.forEach(mission => {
                message += `📍 ${mission.node}\n`;
                message += `🎯 Nhiệm vụ: ${mission.missionType}\n`;
                message += `⚔️ Kẻ thù: ${mission.enemy}\n`;
                message += `⏰ Thời gian còn lại: ${mission.eta}\n`;
                message += `🔹 Steel Path: ${mission.isSteelPath ? '❌' : '✔'}\n\n`;
            });
            message += "⚡ Hành động nhanh, Tenno!";
            send(message);
        } else {
            send("❌ Không có nhiệm vụ Void Cascade nào đang hoạt động!");
        }
    } catch (error) {
        send(`❌ Lỗi API: ${error.message}`);
    }
};
