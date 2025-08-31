const { exec } = require('child_process');
const os = require('os');
const moment = require('moment-timezone');
const fs = require('fs').promises;
const nodeDiskInfo = require('node-disk-info');

module.exports = {
    config: {
        name: "upt",
        version: "2.1.4",
        hasPermission: 2,
        credits: "Vtuan rmk Niio-team",
        description: "Hiển thị thông tin hệ thống của bot và tối ưu RAM!",
        commandCategory: "Admin",
        usages: "",
        cooldowns: 5,
        image: []
    },
    run: async ({ api, event, Users }) => {
        const startTime = Date.now();

        // Hàm lấy thông tin RAM từ lệnh free
        function getRAMUsage() {
            return new Promise((resolve, reject) => {
                exec('free -m', (error, stdout) => {
                    if (error) {
                        return reject(error);
                    }
                    const lines = stdout.trim().split('\n');
                    const memLine = lines[1].split(/\s+/);
                    const totalMem = parseInt(memLine[1], 10); // Tổng bộ nhớ
                    const usedMem = parseInt(memLine[2], 10);  // Bộ nhớ đã sử dụng
                    const freeMem = parseInt(memLine[3], 10);  // Bộ nhớ còn trống
                    resolve({ totalMem, usedMem, freeMem });
                });
            });
        }

        // Hàm tối ưu RAM
        function optimizeRAM() {
            return new Promise((resolve, reject) => {
                exec('sync && echo 3 > /proc/sys/vm/drop_caches', (error, stdout, stderr) => {
                    if (error) {
                        console.error('❎ Không thể giải phóng RAM:', error.message);
                        return reject(error);
                    }
                    resolve(stdout || stderr);
                });
            });
        }

        // Lấy số lượng dependencies từ package.json
        async function getDependencyCount() {
            try {
                const packageJsonString = await fs.readFile('package.json', 'utf8');
                const packageJson = JSON.parse(packageJsonString);
                return Object.keys(packageJson.dependencies).length;
            } catch (error) {
                console.error('❎ Không thể đọc file package.json:', error);
                return -1;
            }
        }

        // Lấy thông tin RAM trước khi tối ưu
        const ramBefore = await getRAMUsage();

        // Tối ưu RAM
        await optimizeRAM();

        // Lấy thông tin RAM sau khi tối ưu
        const ramAfter = await getRAMUsage();

        // Lấy thời gian uptime
        const uptime = process.uptime();
        const uptimeHours = Math.floor(uptime / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);
        const uptimeSeconds = Math.floor(uptime % 60);
        const uptimeString = `${String(uptimeHours).padStart(2, '0')}:${String(uptimeMinutes).padStart(2, '0')}:${String(uptimeSeconds).padStart(2, '0')}`;

        // Lấy thông tin bộ nhớ
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const dependencyCount = await getDependencyCount();
        const name = await Users.getNameUser(event.senderID);

        try {
            // Lấy thông tin ổ đĩa
            const disks = await nodeDiskInfo.getDiskInfo();
            const firstDisk = disks[0] || {};
            const convertToGB = (bytes) => (bytes === undefined ? 'N/A' : (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'GB');

            const pingReal = Date.now() - startTime;
            const botStatus = pingReal < 200 ? 'mượt' : pingReal < 800 ? 'trung bình' : 'lag';

            // Thông báo kết quả
            const replyMsg = `
⏰ Bây giờ là: ${moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss')} | ${moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY')}
⏱️ Thời gian đã hoạt động: ${uptimeString}
📝 Dấu lệnh mặc định: ${global.config.PREFIX}
🗂️ Số lượng package: ${dependencyCount >= 0 ? dependencyCount : "Không xác định"}
🔣 Tình trạng bot: ${botStatus}
📋 Hệ điều hành: ${os.type()} ${os.release()} (${os.arch()})
💾 CPU: ${os.cpus().length} core(s) - ${os.cpus()[0].model} @ ${Math.round(os.cpus()[0].speed)}MHz
📊 Ram: ${ramAfter.usedMem}MB/${ramAfter.totalMem}MB (đã tối ưu)
🛢️ Ram trống: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB
🗄️ Storage: ${convertToGB(firstDisk.used)}/${convertToGB(firstDisk.blocks)} (đã dùng)
📑 Storage trống: ${convertToGB(firstDisk.available)}
🛜 Ping: ${pingReal}ms
👤 Yêu cầu bởi: ${name}
`.trim();//${ramBefore.usedMem}MB/${ramBefore.totalMem}MB (trước tối ưu)

            api.sendMessage({ body: replyMsg, attachment: global.girl.splice(0, 1) }, event.threadID, event.messageID);

        } catch (error) {
            console.error('❎ Error getting disk information:', error.message);
        }
    }
};
/*
const os = require('os');
const moment = require('moment-timezone');
const fs = require('fs').promises;
const nodeDiskInfo = require('node-disk-info');
const path = require('path');

const formatSize = (size) => {
    if (size < 1024) return `${size} B`;
    else if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    else return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

const getTotalSize = async (dirPath) => {
    let totalSize = 0;

    const calculateSize = async (filePath) => {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
            totalSize += stats.size;
        } else if (stats.isDirectory()) {
            const fileNames = await fs.readdir(filePath);
            await Promise.all(fileNames.map(fileName => calculateSize(path.join(filePath, fileName))));
        }
    };

    await calculateSize(dirPath);

    return totalSize;
};

module.exports = {
    config: {
        name: "upt",
        version: "2.1.4",
        hasPermission: 0,
        Rent: 2,
        credits: "Vtuan rmk Niio-team",
        description: "Hiển thị thông tin hệ thống của bot!",
        commandCategory: "Admin",
        usages: "",
        cooldowns: 5,
        usePrefix: false,
    },
    run: async ({ api, event, Users, args }) => {
        const startPing = Date.now();

        const getDependencyCount = async () => {
            try {
                const packageJsonString = await fs.readFile('package.json', 'utf8');
                const packageJson = JSON.parse(packageJsonString);
                return Object.keys(packageJson.dependencies).length;
            } catch (error) {
                console.error('❎ Không thể đọc file package.json:', error);
                return -1;
            }
        };

        const p = args[0] || './';
        const f = await fs.readdir(p);

        let totalSize = 0;

        await Promise.all(f.map(async (n) => {
            const filePath = path.join(p, n);
            const stats = await fs.stat(filePath);

            if (stats.isDirectory()) {
                const dirSize = await getTotalSize(filePath);
                totalSize += dirSize;
            } else {
                totalSize += stats.size;
            }
        }));

        const getStatusByPing = (ping) => ping < 200 ? 'mượt mà' : ping < 800 ? 'trung bình' : 'chậm';

        const memoryUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const uptime = process.uptime();
        const [uptimeHours, uptimeMinutes, uptimeSeconds] = [
            Math.floor(uptime / 3600),
            Math.floor((uptime % 3600) / 60),
            Math.floor(uptime % 60)
        ];
        const name = await Users.getNameUser(event.senderID);
        const dependencyCount = await getDependencyCount();
        const botStatus = getStatusByPing(Date.now() - startPing);

        try {
            const disks = await nodeDiskInfo.getDiskInfo();
            const firstDisk = disks[0] || {};

            const convertToGB = (bytes) => bytes ? (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'GB' : 'Không xác định';

            const pingReal = Date.now() - startPing;

            const replyMsg = `
🕒 ${moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss')} | 📅 ${moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY')}
⌛ Thời gian hoạt động: ${uptimeHours.toString().padStart(2, '0')}:${uptimeMinutes.toString().padStart(2, '0')}:${uptimeSeconds.toString().padStart(2, '0')}
🔣 Trạng thái bot: ${botStatus}
🛢️ Tổng RAM: ${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB
🔍 RAM còn lại: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB
💾 RAM đã sử dụng: ${(usedMemory / 1024 / 1024 / 1024).toFixed(2)}GB
📈 Sử dụng RAM RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB
📊 Tổng Heap: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB
🔋 Heap Đã sử dụng: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB
🔍 Bộ nhớ bên ngoài: ${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB
📊 Dung lượng lưu trữ còn lại: ${convertToGB(firstDisk.available)}
🗂️ Tổng số gói: ${dependencyCount >= 0 ? dependencyCount : "Không xác định"}
🛜 Ping: ${pingReal}ms
💾 Tổng kích thước tập tin: ${formatSize(totalSize)}
👤 Yêu cầu bởi: ${name}
`.trim();

            api.sendMessage(replyMsg, event.threadID, event.messageID);
        } catch (error) {
            console.error('❎ Lỗi khi lấy thông tin đĩa:', error.message);
        }
    }
};

*/
// const os = require('os');
// const moment = require('moment-timezone');
// const fs = require('fs').promises;
// const nodeDiskInfo = require('node-disk-info');
// const path = require('path');

// const formatSize = (size) => {
//     if (size < 1024) return `${size} B`;
//     else if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
//     else return `${(size / (1024 * 1024)).toFixed(2)} MB`;
// };

// const getTotalSize = async (dirPath) => {
//     let totalSize = 0;

//     const calculateSize = async (filePath) => {
//         const stats = await fs.stat(filePath);
//         if (stats.isFile()) {
//             totalSize += stats.size;
//         } else if (stats.isDirectory()) {
//             const fileNames = await fs.readdir(filePath);
//             await Promise.all(fileNames.map(fileName => calculateSize(path.join(filePath, fileName))));
//         }
//     };

//     await calculateSize(dirPath);

//     return totalSize;
// };

// module.exports = {
//     config: {
//         name: "upt",
//         version: "2.1.4",
//         hasPermission: 0,
//         Rent: 2,
//         credits: "Vtuan rmk Niio-team",
//         description: "Display system information of the bot!",
//         commandCategory: "Admin",
//         usages: "",
//         cooldowns: 5,
//         usePrefix: false,
//     },
//     run: async ({ api, event, Users, args }) => {
//         const startPing = Date.now();

//         const getDependencyCount = async () => {
//             try {
//                 const packageJsonString = await fs.readFile('package.json', 'utf8');
//                 const packageJson = JSON.parse(packageJsonString);
//                 return Object.keys(packageJson.dependencies).length;
//             } catch (error) {
//                 console.error('❎ Cannot read package.json file:', error);
//                 return -1;
//             }
//         };

//         const p = args[0] || './';
//         const f = await fs.readdir(p);

//         let totalSize = 0;

//         await Promise.all(f.map(async (n) => {
//             const filePath = path.join(p, n);
//             const stats = await fs.stat(filePath);

//             if (stats.isDirectory()) {
//                 const dirSize = await getTotalSize(filePath);
//                 totalSize += dirSize;
//             } else {
//                 totalSize += stats.size;
//             }
//         }));

//         const getStatusByPing = (ping) => ping < 200 ? 'smooth' : ping < 800 ? 'average' : 'lag';

//         const memoryUsage = process.memoryUsage();
//         const totalMemory = os.totalmem();
//         const freeMemory = os.freemem();
//         const usedMemory = totalMemory - freeMemory;
//         const uptime = process.uptime();
//         const [uptimeHours, uptimeMinutes, uptimeSeconds] = [
//             Math.floor(uptime / 3600),
//             Math.floor((uptime % 3600) / 60),
//             Math.floor(uptime % 60)
//         ];
//         const name = await Users.getNameUser(event.senderID);
//         const dependencyCount = await getDependencyCount();
//         const botStatus = getStatusByPing(Date.now() - startPing);

//         try {
//             const disks = await nodeDiskInfo.getDiskInfo();
//             const firstDisk = disks[0] || {};

//             const convertToGB = (bytes) => bytes ? (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'GB' : 'N/A';

//             const pingReal = Date.now() - startPing;

//             const replyMsg = `
// 🕒 ${moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss')} | 📅 ${moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY')}
// ⌛ Uptime: ${uptimeHours.toString().padStart(2, '0')}:${uptimeMinutes.toString().padStart(2, '0')}:${uptimeSeconds.toString().padStart(2, '0')}
// 🔣 Bot status: ${botStatus}
// 🛢️ Total RAM: ${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB
// 🔍 Free RAM: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB
// 💾 Used RAM: ${(usedMemory / 1024 / 1024 / 1024).toFixed(2)}GB
// 📈 RSS Memory Usage: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB
// 📊 Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB
// 🔋 Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB
// 🔍 External Memory: ${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB
// 📊 Free storage: ${convertToGB(firstDisk.available)}
// 🗂️ Total packages: ${dependencyCount >= 0 ? dependencyCount : "Unknown"}
// 🛜 Ping: ${pingReal}ms
// 💾 Total File Size: ${formatSize(totalSize)}
// 👤 Requested by: ${name}
// `.trim();

//             api.sendMessage(replyMsg, event.threadID, event.messageID);
//         } catch (error) {
//             console.error('❎ Error getting disk information:', error.message);
//         }
//     }
// };




// const os = require('os');
// const moment = require('moment-timezone');
// const fs = require('fs').promises;
// const nodeDiskInfo = require('node-disk-info');

// module.exports = {
//     config: {
//         name: "upt",
//         version: "2.1.4", // Updated version for changes
//         hasPermission: 2,
//         credits: "Vtuan rmk Niio-team",
//         description: "Hiển thị thông tin hệ thống của bot!",
//         commandCategory: "Thống kê",
//         usages: "",
//         cooldowns: 5
//     },
//     run: async ({ api, event, Users }) => {
//         const ping = Date.now();
//         async function getDependencyCount() {
//             try {
//                 const packageJsonString = await fs.readFile('package.json', 'utf8');
//                 const packageJson = JSON.parse(packageJsonString);
//                 const depCount = Object.keys(packageJson.dependencies).length;
//                 return depCount;
//             } catch (error) {
//                 console.error('❎ Không thể đọc file package.json:', error);
//                 return -1;
//             }
//         }
//         function getStatusByPing(pingReal) {
//             if (pingReal < 200) {
//                 return 'mượt';
//             } else if (pingReal < 800) {
//                 return 'trung bình';
//             } else {
//                 return 'mượt';
//             }
//         }
//         function getPrimaryIP() {
//             const interfaces = os.networkInterfaces();
//             for (let iface of Object.values(interfaces)) {
//                 for (let alias of iface) {
//                     if (alias.family === 'IPv4' && !alias.internal) {
//                         return alias.address;
//                     }
//                 }
//             }
//             return '127.0.0.1';
//         }
//         const totalMemory = os.totalmem();
//         const freeMemory = os.freemem();
//         const usedMemory = totalMemory - freeMemory;
//         const uptime = process.uptime();
//         const uptimeHours = Math.floor(uptime / (60 * 60));
//         const uptimeMinutes = Math.floor((uptime % (60 * 60)) / 60);
//         const uptimeSeconds = Math.floor(uptime % 60);
//         let name = await Users.getNameUser(event.senderID);
//         const dependencyCount = await getDependencyCount();
//         const botStatus = getStatusByPing(ping);
//         const primaryIp = getPrimaryIP();
//         try {
//             const disks = await nodeDiskInfo.getDiskInfo();
//             const firstDisk = disks[0] || {}; // Use the first disk, or an empty object if no disks are found
//             const usedSpace = firstDisk.blocks - firstDisk.available;
//             function convertToGB(bytes) {
//                 if (bytes === undefined) return 'N/A'; // Handle undefined value
//                 const GB = bytes / (1024 * 1024 * 1024);
//                 return GB.toFixed(2) + 'GB';
//             }
//             const pingReal = Date.now() - ping
//             const replyMsg = `⏰ Bây giờ là: ${moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss')} | ${moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY')}
// ⏱️ Thời gian đã hoạt động: ${uptimeHours.toString().padStart(2, '0')}:${uptimeMinutes.toString().padStart(2, '0')}:${uptimeSeconds.toString().padStart(2, '0')}
// 📝 Dấu lệnh mặc định: ${global.config.PREFIX}
// 🗂️ Số lượng package: ${dependencyCount >= 0 ? dependencyCount : "Không xác định"}
// 🔣 Tình trạng bot: ${botStatus}
// 📋 Hệ điều hành: ${os.type()} ${os.release()} (${os.arch()})
// 💾 CPU: ${os.cpus().length} core(s) - ${os.cpus()[0].model} @ ${Math.round(os.cpus()[0].speed)}MHz
// 📊 RAM: ${(usedMemory / 1024 / 1024 / 1024).toFixed(2)}GB/${(totalMemory / 1024 / 1024 / 1024).toFixed(2)}GB (đã dùng)
// 🛢️ Ram trống: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)}GB
// 🗄️ Storage: ${convertToGB(firstDisk.used)}/${convertToGB(firstDisk.blocks)} (đã dùng)
// 📑 Storage trống: ${convertToGB(firstDisk.available)}
// 🛜 Ping: ${pingReal}ms
// 👤 Yêu cầu bởi: ${name}
//   `.trim();
//             api.sendMessage(replyMsg, event.threadID, event.messageID);
//         } catch (error) {
//             console.error('❎ Error getting disk information:', error.message);
//         }
//     }
// };