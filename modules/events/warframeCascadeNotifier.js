const axios = require('axios');
const fs = require('fs-extra');
const moment = require('moment-timezone');

module.exports.config = {
    name: "warframeCascadeNotifier",
    eventType: [],
    version: "1.0.0",
    credits: "LHAnh",
    description: "Tự động thông báo Warframe Void Cascade missions"
};

// Cấu hình
const API_URL = "https://api.warframestat.us/pc/fissures";
const NOTIFICATION_FILE = "./modules/data/warframe_cascade.json";
const LOG_FILE = "./modules/data/warframe_cascade_log.json";
const CHECK_INTERVAL = 60000; // 60 giây
const TIMEZONE = "Asia/Ho_Chi_Minh";

// Ghi log vào cache
const writeLog = async (message, type = "info") => {
    try {
        await fs.ensureFile(LOG_FILE);

        let logs = [];
        try {
            const logData = await fs.readFile(LOG_FILE, 'utf-8');
            if (logData) {
                logs = JSON.parse(logData);
            }
        } catch (error) {
            // File chưa tồn tại hoặc lỗi parse
        }

        const logEntry = {
            timestamp: moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss'),
            type: type,
            message: message
        };

        logs.push(logEntry);

        // Giữ lại chỉ 100 log gần nhất
        if (logs.length > 100) {
            logs = logs.slice(-100);
        }

        await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
    } catch (error) {
        console.error("Error writing log:", error);
    }
};

// Parse thời gian còn lại từ string ETA thành milliseconds
const parseEtaToMs = (etaString) => {
    if (!etaString) return 0;

    const parts = etaString.toLowerCase().match(/(\d+)\s*([smhd])/g);
    if (!parts) return 0;

    let totalMs = 0;
    for (const part of parts) {
        const match = part.match(/(\d+)\s*([smhd])/);
        if (match) {
            const value = parseInt(match[1]);
            const unit = match[2];

            switch (unit) {
                case 's': totalMs += value * 1000; break;
                case 'm': totalMs += value * 60 * 1000; break;
                case 'h': totalMs += value * 60 * 60 * 1000; break;
                case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
            }
        }
    }
    return totalMs;
};

// Load config để lấy BOX_ID
const loadConfig = () => {
    try {
        const configData = fs.readFileSync('./config.json', 'utf-8');
        const config = JSON.parse(configData);
        return config.BOX_ID || [];
    } catch (error) {
        console.error("Error loading config for BOX_ID:", error);
        return [];
    }
};

// Khởi tạo file data
const initDataFile = async () => {
    try {
        await fs.ensureFile(NOTIFICATION_FILE);
        const data = await fs.readFile(NOTIFICATION_FILE, 'utf-8');
        if (!data) {
            const defaultData = {
                lastNotifiedMissions: [],
                enabled: true,
                lastCheck: null,
                nextCheckTime: null // Thời gian check tiếp theo (dynamic interval)
            };
            await fs.writeFile(NOTIFICATION_FILE, JSON.stringify(defaultData, null, 2));
        }
    } catch (error) {
        console.error("Error initializing warframe cascade file:", error);
    }
};

// Đọc dữ liệu
const getData = async () => {
    try {
        const data = await fs.readFile(NOTIFICATION_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading warframe cascade data:", error);
        return { lastNotifiedMissions: [], enabled: true, lastCheck: null, nextCheckTime: null };
    }
};

// Lưu dữ liệu
const saveData = async (data) => {
    try {
        await fs.writeFile(NOTIFICATION_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error saving warframe cascade data:", error);
    }
};

// Gọi API Warframe
const fetchFissures = async () => {
    try {
        const response = await axios.get(API_URL, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Warframe-Bot/1.0'
            }
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching Warframe fissures:", error.message);
        return [];
    }
};

// Lọc Void Cascade missions
const filterCascadeMissions = (fissures) => {
    return fissures.filter(mission =>
        mission.missionType === "Void Cascade" &&
        mission.isHard === true &&
        mission.active === true &&
        mission.expired === false
    );
};

// Format thông báo
const formatNotification = (missions) => {
    if (missions.length === 0) return null;

    let message = "🔥 CẢNH BÁO VOID CASCADE WARFRAME 🔥\n\n";

    missions.forEach((mission, index) => {
        message += `   📍 ${mission.node}\n`;
        message += `   🎯 Nhiệm vụ: ${mission.missionType}\n`;
        message += `   ⚔️ Kẻ thù: ${mission.enemy}\n`;
        message += `   ⏰ Thời gian còn lại: ${mission.eta}\n`;
        message += `   🔹 Steel Path: ${mission.isSteelPath ? '❌' : '✔'}\n`;
    });

    message += "⚡ Hành động nhanh, Tenno! Những nhiệm vụ này sẽ không tồn tại lâu!";
    return message;
};

// Kiểm tra và gửi thông báo
const checkAndNotify = async (api) => {
    try {
        const data = await getData();
        if (!data.enabled) return;

        // Kiểm tra xem đã đến thời gian check chưa
        const now = Date.now();
        if (data.nextCheckTime && now < data.nextCheckTime) {
            const remainingTime = Math.ceil((data.nextCheckTime - now) / 1000);
            await writeLog(`Đang chờ ${remainingTime}s trước khi check Void Cascade tiếp theo`, "waiting");
            return;
        }

        // Gọi API
        const fissures = await fetchFissures();
        if (!fissures || fissures.length === 0) {
            await writeLog("Check API ✓ Không có dữ liệu fissures", "check");
            return;
        }

        // Lọc Void Cascade missions
        const cascadeMissions = filterCascadeMissions(fissures);

        if (cascadeMissions.length === 0) {
            await writeLog("Check API ✓ Không có Void Cascade", "check");
        } else {
            await writeLog(`Check API ✓ Tìm thấy ${cascadeMissions.length} Void Cascade`, "found");
        }

        // Kiểm tra mission mới (chưa thông báo) trước khi tính delay
        const newMissions = cascadeMissions.filter(mission =>
            !data.lastNotifiedMissions.includes(mission.id)
        );

        // Nếu có mission mới, gửi thông báo
        if (newMissions.length > 0) {
            // Format và gửi thông báo
            const notificationMessage = formatNotification(newMissions);
            if (notificationMessage) {
                await writeLog(`Tìm thấy ${newMissions.length} nhiệm vụ Void Cascade mới`, "new_mission");

                // Lấy danh sách nhóm từ BOX_ID trong config
                const configBoxes = loadConfig();
                if (configBoxes.length > 0) {
                    await writeLog(`Gửi thông báo 📢 đến ${configBoxes.length} nhóm (BOX_ID từ config)`, "notify");
                    for (const threadID of configBoxes) {
                        try {
                            await api.sendMessage(notificationMessage, threadID);
                            await writeLog(`Thông báo đã gửi đến nhóm: ${threadID}`, "sent");
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        } catch (error) {
                            await writeLog(`Lỗi gửi đến nhóm ${threadID}: ${error.message}`, "error");
                        }
                    }
                } else {
                    await writeLog("Không có BOX_ID nào trong config để gửi thông báo Void Cascade", "warning");
                }

                // Cập nhật danh sách đã thông báo
                data.lastNotifiedMissions = [
                    ...data.lastNotifiedMissions,
                    ...newMissions.map(mission => mission.id)
                ];
                // Giữ lại chỉ 50 mission gần nhất
                if (data.lastNotifiedMissions.length > 50) {
                    data.lastNotifiedMissions = data.lastNotifiedMissions.slice(-50);
                }
            }
        }

        // Nếu có Void Cascade missions đang active, tính delay cho lần check tiếp theo
        if (cascadeMissions.length > 0) {
            // Tính thời gian chờ = thời gian còn lại của mission ngắn nhất + 60s
            const shortestEta = Math.min(...cascadeMissions.map(mission => parseEtaToMs(mission.eta)));
            const nextCheckDelay = shortestEta + 60000; // +60 giây

            data.nextCheckTime = now + nextCheckDelay;

            const nextCheckMinutes = Math.ceil(nextCheckDelay / 60000);
            const nextCheckTime = moment(data.nextCheckTime).tz(TIMEZONE).format('HH:mm');
            await writeLog(`Tính delay: ETA + 60s = ${nextCheckMinutes}m | Ngừng check, chờ đến ${nextCheckTime}`, "delay");
        } else {
            // Reset nextCheckTime khi không còn Void Cascade
            if (data.nextCheckTime) {
                data.nextCheckTime = null;
                await writeLog("Không còn Void Cascade, Resume check bình thường ✓", "resume");
            }
        }

        data.lastCheck = moment().tz(TIMEZONE).format();
        await saveData(data);

    } catch (error) {
        await writeLog(`Lỗi trong Warframe cascade check: ${error.message}`, "error");
    }
};

// Global timer
let cascadeTimer = null;

module.exports.onLoad = async function (api) {
    await initDataFile();

    // Clear existing timer
    if (cascadeTimer) {
        clearInterval(cascadeTimer);
    }

    // Set up timer để check mỗi 60 giây
    cascadeTimer = setInterval(() => {
        checkAndNotify(api);
    }, CHECK_INTERVAL);

    console.log("Hệ thống thông báo Warframe Void Cascade đã tải! Kiểm tra mỗi 60 giây...");

    // Load config và hiển thị BOX_ID
    const configBoxes = loadConfig();
    if (configBoxes.length > 0) {
        await writeLog(`BOX_ID được tìm thấy trong config: ${configBoxes.join(', ')}`, "init");
    } else {
        await writeLog("Không tìm thấy BOX_ID trong config.json", "init");
    }

    // Chạy lần đầu ngay lập tức
    setTimeout(() => {
        checkAndNotify(api);
    }, 5000);
};

module.exports.run = async function ({ api, event, args }) {
    // Command handler cho việc config (nếu cần)
    if (args[0] === "test") {
        const fissures = await fetchFissures();
        const cascades = filterCascadeMissions(fissures);

        if (cascades.length > 0) {
            const message = formatNotification(cascades);
            api.sendMessage(message || "Không tìm thấy nhiệm vụ Void Cascade!", event.threadID, event.messageID);
        } else {
            api.sendMessage("❌ Không tìm thấy nhiệm vụ Void Cascade đang hoạt động!", event.threadID, event.messageID);
        }
    }
};