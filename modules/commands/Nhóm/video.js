// vd.js — pre-download to local, send from disk on demand
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ================== Config ==================
const DATA_DIR = path.join(__dirname, 'Data/Video');
const INDEX_PATH = path.join(DATA_DIR, 'video.json');

const MAX_FILE_MB = parseInt(process.env.VD_MAX_FILE_MB || '25', 10);
const DL_TIMEOUT_MS = parseInt(process.env.VD_DL_TIMEOUT || '30000', 10);
const MAX_CONCURRENT_DOWNLOADS = parseInt(process.env.VD_MAX_CONCURRENCY || '3', 10);
const RETRY_PER_URL = parseInt(process.env.VD_DL_RETRIES || '2', 10);

// ================== Safety ==================
process.on('unhandledRejection', (r, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', r);
});

// ================== Utils ==================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

const guessExtFromCT = (ct) => {
    if (!ct) return '';
    const key = ct.split(';')[0].trim().toLowerCase();
    const map = {
        'video/mp4': '.mp4', 'video/webm': '.webm', 'video/ogg': '.ogv',
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
        'image/webp': '.webp', 'image/apng': '.apng',
    };
    return map[key] || '';
};
const guessExtFromURL = (u) => {
    try {
        const ext = path.extname(new URL(u).pathname);
        return /\.(mp4|webm|ogv|jpg|jpeg|png|gif|webp|apng)$/i.test(ext) ? ext : '';
    } catch { return ''; }
};

// ================== Persistent Index ==================
/**
 * index schema:
 * {
 *   "<group>": { "<urlHash>": { url, path, status: "done"|"error"|"pending", tries, size } }
 * }
 */
let INDEX = { anime: {}, girl: {}, trai: {} };
function loadIndex() {
    ensureDir(DATA_DIR);
    if (fs.existsSync(INDEX_PATH)) {
        try { INDEX = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8')); }
        catch { /* ignore corrupt, keep empty */ }
    }
    INDEX.anime = INDEX.anime || {};
    INDEX.girl = INDEX.girl || {};
    INDEX.trai = INDEX.trai || {};
}
function saveIndex() {
    try { fs.writeFileSync(INDEX_PATH, JSON.stringify(INDEX, null, 2)); } catch { }
}

// ================== Download Core (one-time) ==================
const inFlight = new Map(); // key=urlHash -> Promise

async function headInfo(url) {
    try {
        const r = await axios.head(url, {
            timeout: 5000,
            validateStatus: s => s >= 200 && s < 400,
            headers: { 'User-Agent': 'bot-messenger/1.0', 'Accept': '*/*' }
        });
        const ct = r.headers['content-type'] || '';
        const len = parseInt(r.headers['content-length'] || '0', 10);
        return { ct, len };
    } catch {
        return { ct: '', len: 0 }; // sẽ cố GET trực tiếp
    }
}

async function downloadOnce(url, group) {
    const urlHash = md5(url);

    // return if already done on disk
    const rec = (INDEX[group] && INDEX[group][urlHash]) || {};
    if (rec.status === 'done' && rec.path && fs.existsSync(rec.path)) return rec.path;

    if (inFlight.has(urlHash)) return inFlight.get(urlHash);

    const p = (async () => {
        INDEX[group][urlHash] = { url, path: null, status: 'pending', tries: (rec.tries || 0) + 1, size: 0 };
        saveIndex();

        let { ct, len } = await headInfo(url);
        if (len && len > MAX_FILE_MB * 1024 * 1024) {
            INDEX[group][urlHash].status = 'error';
            saveIndex();
            throw new Error(`Too large: ${len}B > ${MAX_FILE_MB}MB`);
        }

        let ext = guessExtFromCT(ct) || guessExtFromURL(url) || '.bin';
        const finalPath = path.join(DATA_DIR, `${urlHash}${ext}`);
        const tempPath = finalPath + '.part';

        if (fs.existsSync(finalPath)) {
            INDEX[group][urlHash] = { url, path: finalPath, status: 'done', tries: INDEX[group][urlHash].tries, size: fs.statSync(finalPath).size };
            saveIndex();
            return finalPath;
        }

        let attempt = 0, lastErr;
        while (attempt <= RETRY_PER_URL) {
            attempt++;
            try {
                const res = await axios.get(url, {
                    responseType: 'stream',
                    timeout: DL_TIMEOUT_MS,
                    maxRedirects: 3,
                    validateStatus: s => s >= 200 && s < 400,
                    headers: { 'User-Agent': 'bot-messenger/1.0', 'Accept': '*/*' }
                });

                // adjust ext if needed
                const ct2 = res.headers['content-type'] || ct;
                const byCt = guessExtFromCT(ct2);
                if (byCt && ext === '.bin') ext = byCt;

                const final2 = path.join(DATA_DIR, `${urlHash}${ext}`);
                const temp2 = final2 + '.part';

                await new Promise((resolve, reject) => {
                    let bytes = 0;
                    const out = fs.createWriteStream(temp2);
                    res.data.on('data', (chunk) => {
                        bytes += chunk.length;
                        if (bytes > MAX_FILE_MB * 1024 * 1024) {
                            res.data.destroy(new Error(`Exceeded ${MAX_FILE_MB}MB`));
                        }
                    });
                    res.data.on('error', (e) => { out.destroy(); fs.existsSync(temp2) && fs.unlinkSync(temp2); reject(e); });
                    out.on('error', (e) => { fs.existsSync(temp2) && fs.unlinkSync(temp2); reject(e); });
                    out.on('finish', () => {
                        try { fs.renameSync(temp2, final2); resolve(); }
                        catch (e) { try { fs.unlinkSync(temp2); } catch { }; reject(e); }
                    });
                    res.data.pipe(out);
                });

                const size = fs.statSync(final2).size;
                INDEX[group][urlHash] = { url, path: final2, status: 'done', tries: attempt, size };
                saveIndex();
                return final2;
            } catch (e) {
                lastErr = e;
                await sleep(300 + Math.floor(Math.random() * 700));
            }
        }

        INDEX[group][urlHash].status = 'error'; saveIndex();
        throw lastErr || new Error('download failed');
    })().finally(() => inFlight.delete(urlHash));

    inFlight.set(md5(url), p);
    return p;
}

// ================== Queue Runner ==================
function* makeRoundRobinQueues(src) {
    const keys = ['anime', 'girl', 'trai'];
    const queues = {};
    keys.forEach(k => { queues[k] = Array.isArray(src[k]) ? [...src[k]] : []; });
    let i = 0;
    while (keys.some(k => queues[k].length > 0)) {
        const k = keys[i % keys.length];
        if (queues[k].length > 0) yield { group: k, url: queues[k].shift() };
        i++;
    }
}

async function runPrefetch(src) {
    const rr = makeRoundRobinQueues(src);
    const pool = new Set(); // promises

    async function spawnNext() {
        const n = rr.next();
        if (n.done) return;
        const { group, url } = n.value;
        const p = downloadOnce(url, group).catch(e => console.warn(`[prefetch ${group}]`, e.message)).finally(() => {
            pool.delete(p);
            spawnNext(); // continue chain
        });
        pool.add(p);
    }

    // fill initial concurrency
    for (let i = 0; i < MAX_CONCURRENT_DOWNLOADS; i++) spawnNext();
    // wait until all settle
    while (pool.size > 0) await Promise.race(pool);
}

// ================== Public meta ==================
module.exports.config = {
    name: "vd",
    version: "3.0.0",
    hasPermssion: 1,
    credits: "LH Anh + ChatGPT",
    description: "Pre-download video vào ./data, khi gọi lệnh mới gửi",
    commandCategory: "Nhóm",
    usages: "vd <anime|gái|trai>",
    cooldowns: 0
};

// ================== Sources ==================
let sources = { anime: [], girl: [], trai: [] };

module.exports.onLoad = async function () {
    ensureDir(DATA_DIR);
    loadIndex();
    try {
        sources = {
            anime: JSON.parse(fs.readFileSync('./includes/listapi/video/api.json', 'utf-8')),
            girl: JSON.parse(fs.readFileSync('./includes/listapi/video/vdgai.json', 'utf-8')),
            trai: JSON.parse(fs.readFileSync('./includes/listapi/video/trai.json', 'utf-8')),
        };
    } catch (e) {
        console.error('[vd onLoad] load sources failed:', e.message);
        return;
    }

    // Khởi chạy prefetch (không upload; chỉ tải về ./data)
    runPrefetch(sources).catch(e => console.error('[vd prefetch]', e.message));
};

// ================== Helper: pick local DONE file ==================
function getLocalDoneFiles(group) {
    const g = INDEX[group] || {};
    return Object.values(g)
        .filter(x => x.status === 'done' && x.path && fs.existsSync(x.path))
        .map(x => x.path);
}
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ================== Command handler ==================
module.exports.run = async function (o) {
    const { api, event, args } = o;
    const typeKey = (args?.[0] || '').toLowerCase();

    const mapKey = { 'anime': 'anime', 'gái': 'girl', 'gai': 'girl', 'trai': 'trai' };
    const group = mapKey[typeKey];

    const sendText = (t) => new Promise(r =>
        api.sendMessage({ body: t }, event.threadID, (e, res) => r(res || e), event.messageID)
    );

    if (!group) {
        await sendText('Dùng: vd <anime|gái|trai>. Ví dụ: vd gái');
        return;
    }

    // lấy file đã tải xong
    const files = getLocalDoneFiles(group);
    if (files.length === 0) {
        await sendText(`Đang chuẩn bị nội dung ${typeKey || group}… vui lòng thử lại sau.`);
        return;
    }

    const file = pickRandom(files);
    try {
        await new Promise((resolve, reject) => {
            api.sendMessage(
                { body: `Video ${typeKey || group}`, attachment: fs.createReadStream(file) },
                event.threadID,
                (err, res) => (err ? reject(err) : resolve(res)),
                event.messageID
            );
        });
    } catch (e) {
        console.error('[vd run] send fail:', e.message);
        await sendText(`Không gửi được video (${e.message}).`);
    }
};
