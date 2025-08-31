const fs = require('fs');
const path = require('path');
const axios = require('axios');
const buildDBPath = path.join(__dirname, 'Data/builds.json');
const imagesDir = path.join(__dirname, 'Data/images');

// Ensure Data directory exists
const dataDir = path.join(__dirname, 'Data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure images directory exists
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

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

async function downloadImage(url, filename, retries = 5) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream',
                timeout: 45000, // Increased timeout
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const filepath = path.join(imagesDir, filename);
            const writer = fs.createWriteStream(filepath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filepath));
                writer.on('error', reject);
            });
        } catch (error) {
            console.error(`Download attempt ${attempt} failed:`, error.message);

            // Handle rate limiting (429) and server errors (5xx)
            if (error.response && (error.response.status === 429 || error.response.status >= 500)) {
                if (attempt < retries) {
                    const delay = Math.min(Math.pow(2, attempt) * 2000, 30000); // Cap at 30 seconds
                    console.log(`Rate limited. Waiting ${delay}ms before retry ${attempt + 1}...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }

            // For other errors, fail faster
            if (attempt === retries || (error.response && error.response.status < 500 && error.response.status !== 429)) {
                throw new Error(`Download failed: ${error.message}`);
            }
        }
    }
}

module.exports.config = {
    name: "addbuild",
    version: "1.0.0",
    hasPermssion: 1, // Requires admin permission
    credits: "LHAnh",
    description: "Thêm build Warframe mới",
    commandCategory: "warframe",
    cooldowns: 10,
    usages: "[tên warframe], [mô tả build] sử dụng"
};

module.exports.run = async function ({ api, event, args }) {
    try {
        const senderID = event.senderID;
        const input = args.join(' ');

        if (!input.includes(',')) {
            return api.sendMessage('📋 CÚ PHÁP: addbuild [tên warframe], [mô tả build]\n\n💡 CÁCH SỬ DỤNG:\n🔸 Cách 1: Gửi lệnh kèm ảnh luôn\n🔸 Cách 2: Gửi lệnh trước, reply ảnh sau\n🔸 Cách 3: Reply ảnh với lệnh addbuild\n\n📝 VÍ DỤ: addbuild Excalibur, Build DPS cho Steel Path', event.threadID);
        }

        const [warframeName, buildDesc] = input.split(',').map(s => s.trim());

        if (!warframeName || !buildDesc) {
            return api.sendMessage('❌ Vui lòng nhập đầy đủ tên Warframe và mô tả build.\n\n📝 VÍ DỤ: addbuild Mesa | Build Peacemaker DPS', event.threadID);
        }

        // PRIORITY 1: Check if images are attached to current message
        if (event.attachments && event.attachments.length > 0) {
            const imageAttachments = event.attachments.filter(att => att.type === 'photo' || att.type === 'image');
            if (imageAttachments.length > 0) {

                return await processAddBuild(api, event, warframeName, buildDesc, event.attachments);
            }
        }

        // PRIORITY 2: Check if this is a reply to a message with images (FOR MOBILE USERS)
        if (event.messageReply && event.messageReply.attachments && event.messageReply.attachments.length > 0) {

            const imageAttachments = event.messageReply.attachments.filter(att => att.type === 'photo' || att.type === 'image');
            if (imageAttachments.length > 0) {

                return await processAddBuild(api, event, warframeName, buildDesc, event.messageReply.attachments);
            } else {
                // Reply message exists but no valid images
                return api.sendMessage('❌ Tin nhắn được reply không có ảnh hợp lệ.\n\n💡 Hãy reply một tin nhắn có ảnh hoặc gửi lại lệnh kèm ảnh!', event.threadID);
            }
        }

        // PRIORITY 3: No images found anywhere - ask user to reply with images
        return api.sendMessage('📸 Vui lòng reply tin nhắn này kèm theo ảnh build.\n\n💡 Hoặc bạn có thể:\n🔸 Gửi lại lệnh kèm ảnh luôn (PC)\n🔸 Reply ảnh với lệnh addbuild (Mobile)', event.threadID, (err, info) => {
            if (err) {
                console.error('Error sending reply request message:', err);
                return api.sendMessage('❌ Lỗi khi gửi tin nhắn. Vui lòng thử lại.', event.threadID);
            }
            global.addBuildReply = global.addBuildReply || {};
            global.addBuildReply[info.messageID] = {
                warframeName,
                buildDesc,
                senderID,
                timestamp: Date.now()
            };

            // Auto cleanup after 5 minutes
            setTimeout(() => {
                if (global.addBuildReply && global.addBuildReply[info.messageID]) {
                    delete global.addBuildReply[info.messageID];
                }
            }, 300000);
        });
    } catch (error) {
        console.error('Error in addbuild.run:', error);
        api.sendMessage('❌ Có lỗi xảy ra trong lệnh addbuild: ' + error.message, event.threadID);
    }
};

module.exports.handleReply = async function ({ api, event }) {
    try {
        if (!global.addBuildReply || !global.addBuildReply[event.messageReply.messageID]) return;

        const { warframeName, buildDesc, senderID } = global.addBuildReply[event.messageReply.messageID];
        if (event.senderID !== senderID) return;

        // Debug: Log all event data
        console.log('HandleReply - Event attachments:', event.attachments);
        console.log('HandleReply - Attachment count:', event.attachments?.length || 0);

        if (!event.attachments || event.attachments.length === 0) {
            return api.sendMessage('❌ Vui lòng gửi kèm ảnh build.\n\n💡 Mẹo: Bạn cũng có thể gửi lại lệnh "addbuild" kèm ảnh luôn!', event.threadID);
        }

        await processAddBuild(api, event, warframeName, buildDesc, event.attachments);
        delete global.addBuildReply[event.messageReply.messageID];
    } catch (error) {
        console.error('Error in addbuild.handleReply:', error);
        api.sendMessage('❌ Có lỗi xảy ra khi xử lý reply: ' + error.message, event.threadID);

        // Clean up on error
        try {
            if (global.addBuildReply && event.messageReply && global.addBuildReply[event.messageReply.messageID]) {
                delete global.addBuildReply[event.messageReply.messageID];
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
};

async function processAddBuild(api, event, warframeName, buildDesc, attachments) {
    try {
        // Send processing message and auto-delete after 30 seconds
        api.sendMessage('⏳ Đang xử lý và lưu build...', event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 30000);
            }
        });

        // Enhanced debugging


        if (attachments && attachments.length > 0) {
            attachments.forEach((att, i) => {
                console.log(`Attachment ${i + 1}:`, {
                    type: att.type,
                    url: att.url ? 'present' : 'missing',
                    filename: att.filename || 'no filename',
                    size: att.size || 'unknown size',
                    allProperties: Object.keys(att)
                });
            });
        }

        // More flexible image detection - only accept actual image types
        const imageAttachments = attachments?.filter(att => {
            try {
                const isPhoto = att.type === 'photo';
                const isImage = att.type === 'image';
                const isAnimatedImage = att.type === 'animated_image';

                console.log(`Attachment type check:`, {
                    type: att.type,
                    isPhoto,
                    isImage,
                    isAnimatedImage,
                    willAccept: isPhoto || isImage || isAnimatedImage
                });

                return isPhoto || isImage || isAnimatedImage;
            } catch (filterError) {
                console.error('Error filtering attachment:', filterError, att);
                return false;
            }
        }) || [];



        if (imageAttachments.length === 0) {
            let debugInfo = '🔍 DEBUG INFO:\n';
            if (attachments && attachments.length > 0) {
                attachments.forEach((att, i) => {
                    debugInfo += `Attachment ${i + 1}: type="${att.type}", filename="${att.filename || 'none'}"\n`;
                });
            }
            return api.sendMessage(`❌ Không tìm thấy ảnh hợp lệ.\n\n${debugInfo}\n💡 Chỉ chấp nhận ảnh (photo/image/animated_image)`, event.threadID);
        }

        let builds;
        try {
            builds = loadBuilds();
        } catch (loadError) {
            console.error('Error loading builds:', loadError);
            return api.sendMessage('❌ Lỗi khi tải database builds: ' + loadError.message, event.threadID);
        }

        const timestamp = Date.now();
        const imagePaths = [];
        const errors = [];

        // Download and save images with longer delays between requests
        for (let i = 0; i < imageAttachments.length; i++) {
            const att = imageAttachments[i];

            if (!att.url) {
                errors.push(`Ảnh ${i + 1}: Không có URL hợp lệ`);
                continue;
            }

            try {
                // Better filename generation based on attachment type
                let fileExt = '.jpg'; // default
                if (att.type === 'photo') fileExt = '.jpg';
                else if (att.type === 'image') fileExt = '.jpg';
                else if (att.type === 'animated_image') fileExt = '.gif';

                // Try to get extension from URL if available
                if (att.url) {
                    const urlExt = att.url.match(/\.(jpg|jpeg|png|gif|webp)(?:\?|$)/i);
                    if (urlExt) {
                        fileExt = '.' + urlExt[1].toLowerCase();
                    }
                }

                const filename = `${warframeName.replace(/\s+/g, '_')}_${timestamp}_${i + 1}${fileExt}`;

                // Increased delay between downloads to avoid rate limiting
                if (i > 0) {
                    const delay = Math.min(5000 + (i * 1000), 15000); // Progressive delay, cap at 15s
                    console.log(`Waiting ${delay}ms before downloading image ${i + 1}...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                console.log(`Downloading image ${i + 1}/${imageAttachments.length} (${att.type})...`);
                const imagePath = await downloadImage(att.url, filename);
                imagePaths.push(imagePath);
                console.log(`Successfully downloaded image ${i + 1}/${imageAttachments.length} as ${filename}`);
            } catch (downloadError) {
                console.error(`Error downloading image ${i + 1}:`, downloadError);
                errors.push(`Ảnh ${i + 1}: ${downloadError.message}`);
            }
        }

        if (imagePaths.length === 0) {
            let errorMsg = '❌ Không thể tải xuống ảnh nào.';
            if (errors.length > 0) {
                errorMsg += '\n\n🔍 Chi tiết lỗi:\n' + errors.join('\n');
            }
            errorMsg += '\n\n💡 Thử lại với ảnh khác hoặc kiểm tra kết nối mạng.';
            return api.sendMessage(errorMsg, event.threadID);
        }

        // Add build to database
        try {
            if (!builds[warframeName]) {
                builds[warframeName] = [];
            }

            builds[warframeName].push({
                desc: buildDesc,
                imgs: imagePaths,
                addedBy: event.senderID,
                addedAt: timestamp
            });

            if (saveBuilds(builds)) {
                let successMsg = `✅ Đã thêm build "${buildDesc}" cho ${warframeName} thành công!\n📁 Đã lưu ${imagePaths.length}/${imageAttachments.length} ảnh.`;
                if (errors.length > 0) {
                    successMsg += `\n\n⚠️ ${errors.length} ảnh không tải được:\n${errors.join('\n')}`;
                }

                // Send success message and auto-delete after 60 seconds
                api.sendMessage(successMsg, event.threadID, (err, info) => {
                    if (!err && info) {
                        setTimeout(() => {
                            api.unsendMessage(info.messageID).catch(() => { });
                        }, 60000);
                    }
                });
            } else {
                // Send error message and auto-delete after 45 seconds
                api.sendMessage('❌ Lỗi khi lưu build vào database.', event.threadID, (err, info) => {
                    if (!err && info) {
                        setTimeout(() => {
                            api.unsendMessage(info.messageID).catch(() => { });
                        }, 45000);
                    }
                });
            }
        } catch (saveError) {
            console.error('Error saving build to database:', saveError);
            api.sendMessage('❌ Lỗi khi lưu build vào database: ' + saveError.message, event.threadID, (err, info) => {
                if (!err && info) {
                    setTimeout(() => {
                        api.unsendMessage(info.messageID).catch(() => { });
                    }, 45000);
                }
            });
        }

    } catch (error) {
        console.error('Error in processAddBuild:', error);
        api.sendMessage('❌ Có lỗi xảy ra khi xử lý build: ' + error.message + '\n\n🔧 Vui lòng liên hệ admin để báo lỗi.', event.threadID, (err, info) => {
            if (!err && info) {
                setTimeout(() => {
                    api.unsendMessage(info.messageID).catch(() => { });
                }, 45000);
            }
        });
    }
}
