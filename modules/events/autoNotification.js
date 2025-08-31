const fs = require('fs-extra');
const moment = require('moment-timezone');

module.exports.config = {
    name: "autoNotification",
    eventType: [],
    version: "1.0.0",
    credits: "Niio-team",
    description: "Tự động gửi tin nhắn thông báo theo lịch"
};

// Cấu hình thông báo
const NOTIFICATIONS_FILE = "./modules/data/notifications.json";
const TIMEZONE = "Asia/Ho_Chi_Minh";

// Khởi tạo file nếu chưa có
const initNotificationFile = async () => {
    try {
        await fs.ensureFile(NOTIFICATIONS_FILE);
        const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf-8');
        if (!data) {
            const defaultData = {
                schedules: [
                    {
                        id: 1,
                        time: "08:00",
                        message: "🌅 Chào buổi sáng! Chúc mọi người một ngày tốt lành!",
                        threads: [], // Để trống = gửi tất cả nhóm
                        enabled: true,
                        days: [1, 2, 3, 4, 5, 6, 0] // 0=Chủ nhật, 1=Thứ 2, ...
                    },
                    {
                        id: 2,
                        time: "12:00",
                        message: "🍽️ Đến giờ ăn trưa rồi! Đừng quên nghỉ ngơi nhé!",
                        threads: [],
                        enabled: true,
                        days: [1, 2, 3, 4, 5, 6, 0]
                    },
                    {
                        id: 3,
                        time: "18:00",
                        message: "🌆 Chúc mọi người buổi tối vui vẻ!",
                        threads: [],
                        enabled: true,
                        days: [1, 2, 3, 4, 5, 6, 0]
                    }
                ],
                lastCheck: null
            };
            await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(defaultData, null, 2));
        }
    } catch (error) {
        console.error("Error initializing notification file:", error);
    }
};

// Đọc danh sách thông báo
const getNotifications = async () => {
    try {
        const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading notifications:", error);
        return { schedules: [], lastCheck: null };
    }
};

// Lưu danh sách thông báo
const saveNotifications = async (data) => {
    try {
        await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error saving notifications:", error);
    }
};

// Kiểm tra và gửi thông báo
const checkAndSendNotifications = async (api) => {
    try {
        const notificationData = await getNotifications();
        const now = moment().tz(TIMEZONE);
        const currentTime = now.format("HH:mm");
        const currentDay = now.day();
        const currentDate = now.format("YYYY-MM-DD");

        // Kiểm tra xem đã check trong ngày hôm nay chưa
        if (notificationData.lastCheck === currentDate) {
            return;
        }

        for (const schedule of notificationData.schedules) {
            if (!schedule.enabled) continue;
            if (!schedule.days.includes(currentDay)) continue;
            if (schedule.time !== currentTime) continue;

            console.log(`Sending notification: ${schedule.message}`);

            // Lấy danh sách nhóm
            let targetThreads = schedule.threads;
            if (targetThreads.length === 0) {
                // Gửi tất cả nhóm nếu không chỉ định
                try {
                    const threadList = await api.getThreadList(20, null, ["INBOX"]);
                    targetThreads = threadList.filter(thread => thread.isGroup).map(thread => thread.threadID);
                } catch (error) {
                    console.error("Error getting thread list:", error);
                    continue;
                }
            }

            // Gửi tin nhắn đến các nhóm
            for (const threadID of targetThreads) {
                try {
                    await api.sendMessage(schedule.message, threadID);
                    console.log(`Notification sent to thread: ${threadID}`);

                    // Delay để tránh spam
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error(`Error sending to thread ${threadID}:`, error);
                }
            }
        }

        // Cập nhật lastCheck
        notificationData.lastCheck = currentDate;
        await saveNotifications(notificationData);

    } catch (error) {
        console.error("Error in checkAndSendNotifications:", error);
    }
};

// Global timer
let notificationTimer = null;

module.exports.onLoad = async function (api) {
    await initNotificationFile();

    // Kiểm tra mỗi phút
    if (notificationTimer) {
        clearInterval(notificationTimer);
    }

    notificationTimer = setInterval(() => {
        checkAndSendNotifications(api);
    }, 60000); // Kiểm tra mỗi 60 giây

    console.log("Auto notification system loaded!");
};

module.exports.run = async function ({ api, event, args }) {
    // Event handler (nếu cần xử lý các sự kiện khác)
};
