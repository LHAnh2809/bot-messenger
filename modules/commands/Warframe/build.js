const fs = require('fs');
const path = require('path');
const buildDBPath = path.join(__dirname, 'Data/builds.json');

// Ensure Data directory exists
const dataDir = path.join(__dirname, 'Data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function loadBuilds() {
    if (!fs.existsSync(buildDBPath)) {
        // Create empty builds file if it doesn't exist
        fs.writeFileSync(buildDBPath, '{}', 'utf8');
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(buildDBPath, 'utf8'));
    } catch (error) {
        console.error('Error loading builds:', error);
        return {};
    }
}

module.exports.config = {
    name: "build",
    version: "1.0.1",
    hasPermssion: 0,
    credits: "LHAnh",
    description: "Tra cứu build Warframe",
    commandCategory: "warframe",
    cooldowns: 5,
    usages: "[tên build] hoặc 'list' để xem tất cả"
};

module.exports.run = async function ({ api, event, args }) {
    const builds = loadBuilds();
    const senderID = event.senderID;
    const input = args.join(' ').toLowerCase();

    // Show usage instructions for addbuild
    if (input === 'help' || input === 'hướng dẫn') {
        const helpMsg = `📋 HƯỚNG DẪN SỬ DỤNG LỆNH BUILD:\n\n` +
            `🔍 XEM BUILD:\n` +
            `• build list - Xem danh sách tất cả Warframe có build\n` +
            `• build <tên warframe> - Xem các build của Warframe cụ thể\n\n` +
            `➕ THÊM BUILD (Chỉ Admin):\n` +
            `• addbuild [tên warframe], [mô tả build]\n` +
            `• Sau đó reply tin nhắn với ảnh build\n\n` +
            `📝 VÍ DỤ:\n` +
            `• build Excalibur\n` +
            `• addbuild Excalibur, Build DPS cho Steel Path\n` +
            `  (rồi reply kèm ảnh)\n\n` +
            `💡 Lưu ý: Tên Warframe không phân biệt hoa thường`;

        return api.sendMessage(helpMsg, event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 90000); // Auto-delete help message after 90 seconds
            }
        });
    }

    // Show all available builds
    if (input === 'list' || input === '') {
        const buildNames = Object.keys(builds);
        if (buildNames.length === 0) {
            return api.sendMessage('Chưa có build nào được lưu.\n\n📋 Sử dụng "build help" để xem hướng dẫn sử dụng lệnh.', event.threadID, (err, info) => {
                if (!err && info) {
                    setTimeout(() => {
                        api.unsendMessage(info.messageID).catch(() => { });
                    }, 45000); // Auto-delete after 45 seconds
                }
            });
        }
        let listMsg = '📋 Danh sách các Warframe có build:\n\n';
        buildNames.forEach((name, i) => {
            listMsg += `${i + 1}. ${name} (${builds[name].length} build)\n`;
        });
        listMsg += '\n💡 Gõ "build <tên warframe>" để xem chi tiết';

        return api.sendMessage(listMsg, event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 120000); // Auto-delete list after 2 minutes
            }
        });
    }

    // Find build (case insensitive)
    const buildKey = Object.keys(builds).find(key => key.toLowerCase() === input);
    if (!buildKey) {
        return api.sendMessage(`❌ Không tìm thấy build cho "${args.join(' ')}".\n\n🔍 Sử dụng "build list" để xem danh sách\n📋 Sử dụng "build help" để xem hướng dẫn`, event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 45000); // Auto-delete error message after 45 seconds
            }
        });
    }

    const list = builds[buildKey];
    let replyMsg = `⚔️ Các build cho ${buildKey}:\n\n`;
    list.forEach((b, i) => {
        replyMsg += `${i + 1}. ${b.desc}\n`;
    });
    replyMsg += '\n💬 Reply số thứ tự để nhận ảnh build';

    api.sendMessage(replyMsg, event.threadID, (err, info) => {
        if (err) return console.error('Error sending message:', err);

        // Sử dụng pattern giống checktn.js
        global.client.handleReply = global.client.handleReply || [];
        global.client.handleReply.push({
            name: this.config.name,
            messageID: info.messageID,
            author: event.senderID,
            buildKey: buildKey,
            builds: list
        });
    });
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
    // Kiểm tra quyền truy cập
    if (event.senderID !== handleReply.author) return;

    const { buildKey, builds } = handleReply;
    const idx = parseInt(event.body) - 1;

    if (isNaN(idx) || !builds || !builds[idx]) {
        return api.sendMessage('❌ Số không hợp lệ. Vui lòng chọn số từ danh sách.', event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 30000); // Auto-delete error after 30 seconds
            }
        });
    }

    const build = builds[idx];
    if (!build.imgs || build.imgs.length === 0) {
        return api.sendMessage('❌ Không có ảnh cho build này.', event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 30000);
            }
        });
    }

    // Validate image files exist
    const validImages = build.imgs.filter(img => fs.existsSync(img));
    if (validImages.length === 0) {
        console.log('No valid images found for build:', build.desc);
        return api.sendMessage('❌ Các file ảnh không tồn tại. Vui lòng liên hệ admin.', event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 45000);
            }
        });
    }

    try {
        console.log('Creating attachments for', validImages.length, 'images');
        const attachments = validImages.map(img => {
            console.log('Creating stream for:', img);
            return fs.createReadStream(img);
        });
        
        api.sendMessage({
            body: `🖼️ Build ${buildKey} - ${build.desc}:`,
            attachment: attachments
        }, event.threadID, (err, info) => {
            if (err) {
                console.error('Error sending images:', err);
                api.sendMessage('❌ Lỗi khi gửi ảnh. Vui lòng thử lại sau.', event.threadID, (err2, info2) => {
                    if (!err2 && info2) {
                        setTimeout(() => {
                            api.unsendMessage(info2.messageID).catch(() => { });
                        }, 30000);
                    }
                });
            } else {
                console.log('Successfully sent build images');
            }
            // Build images don't auto-delete - user might want to save them
        });
    } catch (error) {
        console.error('Error creating attachments:', error);
        api.sendMessage('❌ Lỗi khi tải ảnh. Vui lòng thử lại sau.', event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 30000);
            }
        });
    }

    // Cleanup - remove the reply handler
    const index = global.client.handleReply.findIndex(item => item.messageID === handleReply.messageID);
    if (index !== -1) {
        global.client.handleReply.splice(index, 1);
    }
};
