const fs = require('fs');
const path = require('path');
const buildDBPath = path.join(__dirname, 'Data/builds.json');

function loadBuilds() {
    if (!fs.existsSync(buildDBPath)) {
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

function saveBuilds(builds) {
    try {
        fs.writeFileSync(buildDBPath, JSON.stringify(builds, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving builds:', error);
        return false;
    }
}

module.exports.config = {
    name: "delbuild",
    version: "1.0.0",
    hasPermssion: 1, // Admin only
    credits: "LHAnh",
    description: "Xóa build Warframe",
    commandCategory: "warframe",
    cooldowns: 5,
    usages: "[tên warframe]"
};

module.exports.run = async function ({ api, event, args }) {
    try {
        const builds = loadBuilds();
        const input = args.join(' ').trim().toLowerCase();

        // Show all available warframes for deletion when no input
        if (!input) {
            const buildNames = Object.keys(builds);
            if (buildNames.length === 0) {
                return api.sendMessage('❌ Chưa có build nào để xóa.\n\n📋 Sử dụng "build list" để xem hướng dẫn.', event.threadID, (err, info) => {
                    if (!err && info) {
                        setTimeout(() => {
                            api.unsendMessage(info.messageID).catch(() => { });
                        }, 45000); // Auto-delete after 45 seconds
                    }
                });
            }

            let listMsg = '🗑️ Danh sách Warframe có build để xóa:\n\n';
            buildNames.forEach((name, i) => {
                listMsg += `${i + 1}. ${name} (${builds[name].length} build)\n`;
            });
            listMsg += '\n💡 Gõ "delbuild <tên warframe>" để xóa build cụ thể\n📝 VÍ DỤ: delbuild Excalibur';

            return api.sendMessage(listMsg, event.threadID, (err, info) => {
                if (!err && info) {
                    setTimeout(() => {
                        api.unsendMessage(info.messageID).catch(() => { });
                    }, 120000); // Auto-delete list after 2 minutes
                }
            });
        }

        // Find warframe (case insensitive)
        const buildKey = Object.keys(builds).find(key => key.toLowerCase() === input);
        if (!buildKey) {
            return api.sendMessage(`❌ Không tìm thấy build cho "${args.join(' ')}".\n\n🔍 Sử dụng "delbuild" để xem danh sách warframe có sẵn.`, event.threadID, (err, info) => {
                if (!err && info) {
                    setTimeout(() => {
                        api.unsendMessage(info.messageID).catch(() => { });
                    }, 45000); // Auto-delete error after 45 seconds
                }
            });
        }

        const warframeBuilds = builds[buildKey];
        if (warframeBuilds.length === 0) {
            return api.sendMessage(`❌ ${buildKey} không có build nào để xóa.`, event.threadID, (err, info) => {
                if (!err && info) {
                    setTimeout(() => {
                        api.unsendMessage(info.messageID).catch(() => { });
                    }, 45000);
                }
            });
        }

        let listMsg = `🗑️ Các build để xóa cho ${buildKey}:\n\n`;
        warframeBuilds.forEach((build, i) => {
            listMsg += `${i + 1}. ${build.desc}\n`;
        });
        listMsg += '\n💬 Reply số thứ tự để xem ảnh và xóa build';

        api.sendMessage(listMsg, event.threadID, (err, info) => {
            if (err) return console.error('Error sending delete list:', err);

            global.client.handleReply = global.client.handleReply || [];
            global.client.handleReply.push({
                name: this.config.name,
                messageID: info.messageID,
                author: event.senderID,
                buildKey: buildKey,
                builds: warframeBuilds
            });
        });

    } catch (error) {
        console.error('Error in delbuild.run:', error);
        api.sendMessage('❌ Có lỗi xảy ra trong lệnh delbuild: ' + error.message, event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 45000);
            }
        });
    }
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
    try {
        if (event.senderID !== handleReply.author) return;

        const { buildKey, builds, action } = handleReply;

        // Stage 1: Show build images and ask for confirmation
        if (!action) {
            const idx = parseInt(event.body) - 1;

            if (isNaN(idx) || idx < 0 || idx >= builds.length) {
                return api.sendMessage(`❌ Số không hợp lệ. Vui lòng chọn số từ 1 đến ${builds.length}.`, event.threadID, (err, info) => {
                    if (!err && info) {
                        setTimeout(() => {
                            api.unsendMessage(info.messageID).catch(() => { });
                        }, 30000); // Auto-delete error after 30 seconds
                    }
                });
            }

            const buildToDelete = builds[idx];

            // Validate image files exist
            const validImages = buildToDelete.imgs ? buildToDelete.imgs.filter(img => fs.existsSync(img)) : [];

            const confirmMsg = `🗑️ Build sẽ xóa - ${buildKey} - ${buildToDelete.desc}\n\n` +
                `📅 Thêm: ${new Date(buildToDelete.addedAt).toLocaleDateString('vi-VN')}\n` +
                `📷 Số ảnh: ${validImages.length}\n\n` +
                `💬 Reply "y" để xóa hoặc "n" để hủy`;

            try {
                const messageData = {
                    body: confirmMsg
                };

                // Add images if they exist
                if (validImages.length > 0) {
                    const attachments = validImages.map(img => fs.createReadStream(img));
                    messageData.attachment = attachments;
                }

                api.sendMessage(messageData, event.threadID, (err, info) => {
                    if (err) return console.error('Error sending confirm message:', err);

                    // Update reply handler for confirmation
                    const index = global.client.handleReply.findIndex(item => item.messageID === handleReply.messageID);
                    if (index !== -1) {
                        global.client.handleReply[index] = {
                            name: this.config.name,
                            messageID: info.messageID,
                            author: event.senderID,
                            buildKey: buildKey,
                            buildIndex: idx,
                            buildToDelete: buildToDelete,
                            action: 'confirm'
                        };
                    }
                });

            } catch (error) {
                console.error('Error creating attachments:', error);
                api.sendMessage(confirmMsg, event.threadID, (err, info) => {
                    if (err) return;
                    const index = global.client.handleReply.findIndex(item => item.messageID === handleReply.messageID);
                    if (index !== -1) {
                        global.client.handleReply[index] = {
                            name: this.config.name,
                            messageID: info.messageID,
                            author: event.senderID,
                            buildKey: buildKey,
                            buildIndex: idx,
                            buildToDelete: buildToDelete,
                            action: 'confirm'
                        };
                    }
                });
            }
            return;
        }

        // Stage 2: Confirm deletion
        if (action === 'confirm') {
            const input = event.body.trim().toLowerCase();

            if (input === 'n' || input === 'no') {
                api.sendMessage('❌ Đã hủy thao tác xóa.', event.threadID, (err, info) => {
                    if (!err && info) {
                        setTimeout(() => {
                            api.unsendMessage(info.messageID).catch(() => { });
                        }, 30000); // Auto-delete cancel message after 30 seconds
                    }
                });
                const index = global.client.handleReply.findIndex(item => item.messageID === handleReply.messageID);
                if (index !== -1) global.client.handleReply.splice(index, 1);
                return;
            }

            if (input !== 'y' && input !== 'yes') {
                return api.sendMessage('💬 Vui lòng reply "y" để xóa hoặc "n" để hủy.', event.threadID, (err, info) => {
                    if (!err && info) {
                        setTimeout(() => {
                            api.unsendMessage(info.messageID).catch(() => { });
                        }, 30000);
                    }
                });
            }

            const { buildIndex, buildToDelete } = handleReply;
            const currentBuilds = loadBuilds();

            // Delete image files
            let deletedImageCount = 0;
            if (buildToDelete.imgs && Array.isArray(buildToDelete.imgs)) {
                buildToDelete.imgs.forEach(imgPath => {
                    try {
                        if (fs.existsSync(imgPath)) {
                            fs.unlinkSync(imgPath);
                            deletedImageCount++;

                        }
                    } catch (err) {
                        console.error('Error deleting image:', err);
                    }
                });
            }

            // Remove build from database
            currentBuilds[buildKey].splice(buildIndex, 1);

            // Remove warframe entry if no builds left
            if (currentBuilds[buildKey].length === 0) {
                delete currentBuilds[buildKey];
            }

            if (saveBuilds(currentBuilds)) {
                api.sendMessage(`✅ Đã xóa build "${buildToDelete.desc}" của ${buildKey} thành công!\n🗑️ Đã xóa ${deletedImageCount} file ảnh.`, event.threadID, (err, info) => {
                    if (!err && info) {
                        setTimeout(() => {
                            api.unsendMessage(info.messageID).catch(() => { });
                        }, 60000); // Auto-delete success message after 1 minute
                    }
                });
            } else {
                api.sendMessage('❌ Lỗi khi lưu database.', event.threadID, (err, info) => {
                    if (!err && info) {
                        setTimeout(() => {
                            api.unsendMessage(info.messageID).catch(() => { });
                        }, 45000);
                    }
                });
            }

            // Cleanup
            const index = global.client.handleReply.findIndex(item => item.messageID === handleReply.messageID);
            if (index !== -1) global.client.handleReply.splice(index, 1);
        }

    } catch (error) {
        console.error('Error in delbuild.handleReply:', error);
        api.sendMessage('❌ Có lỗi xảy ra: ' + error.message, event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 45000);
            }
        });
    }
};
