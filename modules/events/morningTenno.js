module.exports.config = {
    name: "morningTenno",
    eventType: [],
    version: "1.0.0",
    credits: "LHAnh",
    description: "Tự động gửi thông báo TennoCon vào BOX_ID lúc 8h sáng mỗi ngày"
};

const sendMorningMessage = async (api) => {
    
    const boxIds = global.config.BOX_ID || [];
    const message = '🌄 Dậy đi các TennoCon! Tới giờ thăm ngàn rồi!';
    for (const boxId of boxIds) {
        try {
            await api.sendMessage(message, boxId);
        } catch (err) {
            console.error(`[ TennoCon Morning ] Lỗi gửi tin nhắn tới box ${boxId}: ${err.message}`);
        }
    }
};

function scheduleMorning(api) {
    const now = new Date();
    const next8AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
    if (now > next8AM) {
        next8AM.setDate(next8AM.getDate() + 1);
    }
    const msUntil8AM = next8AM - now;
    setTimeout(() => {
        sendMorningMessage(api);
        setInterval(() => sendMorningMessage(api), 24 * 60 * 60 * 1000);
    }, msUntil8AM);
}

module.exports.onLoad = function (api) {
    scheduleMorning(api);
};
