// ============================================================================
// 📦 MODULE 1: INITIALIZATION & ENVIRONMENT CONFIGURATION
// ============================================================================
// โหลดค่าคอนฟิกูเรชันความปลอดภัยจากไฟล์ .env และแพ็คเกจเสริมที่จำเป็นในการรันบอท
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// 🌟 เติมบรรทัดนี้กลับเข้าไปครับ! เพื่อให้ระบบรู้จักคำว่า 'line'
const line = require('@line/bot-sdk');
const clientConfig = {
    // ใส่ Token ของพี่เอิร์ทตรงนี้ (หรือถ้าใช้ process.env ก็ใส่ process.env.CHANNEL_ACCESS_TOKEN)
    channelAccessToken: 'ADnmFGVMjz+TB5lnRtcAdoZtt0ZNCWMrtCxwpOKpdYRP9Fo3pWsdVyY/v4xQPigdVdeanXbZYZmYt3ljrssq1JI6PCC5jpuG70TrQUE9/Kj7GI/8IritlalvEfMXEDh1jKGIUzsm0v7Qp+Pmu0qm6AdB04t89/1O/w1cDnyilFU='
};
const client = new line.messagingApi.MessagingApiClient(clientConfig);
const app = express();

// ... โค้ดส่วนอื่นๆ ที่เราทำไว้ ...

// ==========================================
// 🎯 โค้ดจัดการหน้าเว็บ (ต้องอยู่ใต้ const app = express() เสมอ)
// ==========================================
function serveHtml(res, fileName) {
    const publicPath = path.join(__dirname, 'Public', fileName);
    const rootPath = path.join(__dirname, fileName);
    
    if (fs.existsSync(publicPath)) {
        res.sendFile(publicPath);
    } else if (fs.existsSync(rootPath)) {
        res.sendFile(rootPath);
    } else {
        res.status(404).send(`❌ ไม่พบไฟล์ ${fileName} ในระบบครับ`);
    }
}

// 🌟 ตอนนี้ app ถูกสร้างแล้ว เรียกใช้ได้เลย!
app.use(express.static(path.join(__dirname, 'Public')));
app.use(express.static(__dirname)); 

app.get('/', (req, res) => serveHtml(res, 'portal.html'));
app.get('/portal.html', (req, res) => serveHtml(res, 'portal.html'));

app.get('/inventory', (req, res) => serveHtml(res, 'inventory.html'));
app.get('/inventory.html', (req, res) => serveHtml(res, 'inventory.html'));

app.get('/logbook', (req, res) => serveHtml(res, 'logbook.html'));
app.get('/logbook.html', (req, res) => serveHtml(res, 'logbook.html'));

// ... โค้ดส่วนอื่นๆ ของพี่ (พวก Webhook LINE) ต่อจากตรงนี้ลงไป ...
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
//const creds = require('./credentials.json');

// ตั้งค่ากุญแจดิจิทัลในการเปิดประตูรับส่งข้อความกับระบบ LINE OA Developers
const middlewareConfig = { 
    channelSecret: process.env.LINE_CHANNEL_SECRET 
};



// ⚠️ เปิดระบบ Body Parser เฉพาะช่องทาง API LIFF เท่านั้น เพื่อป้องกันไม่ให้ไปชนลายเซ็น Webhook LINE
app.use('/api', express.json());

// ============================================================================
// 🧠 MODULE 2: VETERINARY LAB MEDICAL REFERENCES (สมองกลแปรผลประจำค่าย)
// ============================================================================
// จุดล็อกเกณฑ์ปกติในการวิเคราะห์ผลเลือดสัตว์ 4 ชนิด และคำนวณเกรดความรุนแรงของพยาธิอุจจาระ
const LAB_REFERENCES = {
    // ช่วงเกณฑ์ปกติของค่า PCV (%) อ้างอิง [ขั้นต่ำ , ขั้นสูง] ของ วัว, ควาย, แพะ, แกะ
    pcv: { 
        'วัว': [24, 46], 
        'ควาย': [24, 46], 
        'แพะ': [22, 38], 
        'แกะ': [22, 38] 
    },
    // เกณฑ์สมองกลแปลงจำนวนตัวไข่พยาธิ Fecal Egg Count (EPG) ออกมาเป็นเกรดหน้างานค่าย
    calculateFecScore: (val) => {
        if (!val && val !== 0) {
            return "N/A";
        }
        if (val === 0) {
            return "Negative";
        }
        if (val <= 50) {
            return "1+ (Mild)";
        }
        if (val <= 300) {
            return "2+ (Moderate)";
        }
        if (val <= 800) {
            return "3+ (Heavy)";
        }
        return "4+ (Severe)";
    }
};

// เรดาร์ตรวจจับพิกัดและสถานะการพิมพ์ของเจ้าหน้าที่สัตวแพทย์หน้างานแบบสดๆ (Live Presence Tracking)
const activeUsers = {}; 

// ============================================================================
// 🚨 ฟังก์ชันสร้างการ์ด Flex Message แจ้งเตือนสต็อกอุปกรณ์ใกล้หมด (การ์ดแดง)
// ============================================================================
function createLowStockFlexMessage(items) {
    const itemContents = items.map(i => ({ 
        type: "box", layout: "horizontal", margin: "sm", 
        contents: [ 
            { type: "text", text: i.name, size: "sm", color: "#334155", flex: 2, wrap: true }, 
            { type: "text", text: `เหลือ ${i.remainingStock} ${i.unit}`, size: "sm", color: "#ef4444", align: "end", weight: "bold", flex: 1 } 
        ] 
    }));
    
    return { 
        type: "flex", altText: "⚠️ แจ้งเตือนสต็อกอุปกรณ์ใกล้หมด", 
        contents: { 
            type: "bubble", 
            header: { type: "box", layout: "vertical", backgroundColor: "#ef4444", contents: [ { type: "text", text: "⚠️ อุปกรณ์ใกล้หมดสต็อก!", color: "#ffffff", weight: "bold", size: "md", align: "center" } ] }, 
            body: { type: "box", layout: "vertical", spacing: "sm", contents: [ ...itemContents ] },
            footer: { type: "box", layout: "vertical", contents: [ { type: "text", text: "รบกวนทีมปศุสัตว์ตรวจสอบและเตรียมเติมสต็อกด้วยครับ", color: "#64748b", size: "xxs", align: "center", wrap: true } ] }
        } 
    };
}
// ============================================================================
// 🆕 อัปเดตฟังก์ชันยิงตรงเข้า LINE API ผ่าน Native HTTPS (เสถียร 100% ทุกเวอร์ชัน Node)
async function sendDirectLinePush(toId, messagesArray) {
    const https = require('https');
    return new Promise((resolve) => {
        const data = JSON.stringify({ to: toId, messages: messagesArray });
        const options = {
            hostname: 'api.line.me',
            port: 443,
            path: '/v2/bot/message/push',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ADnmFGVMjz+TB5lnRtcAdoZtt0ZNCWMrtCxwpOKpdYRP9Fo3pWsdVyY/v4xQPigdVdeanXbZYZmYt3ljrssq1JI6PCC5jpuG70TrQUE9/Kj7GI/8IritlalvEfMXEDh1jKGIUzsm0v7Qp+Pmu0qm6AdB04t89/1O/w1cDnyilFU=`,
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let resData = '';
            res.on('data', (chunk) => { resData += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error(`🚨 LINE API Error [${res.statusCode}]: ${resData}`);
                }
                resolve();
            });
        });

        req.on('error', (err) => {
            console.error("🚨 Failed to send LINE push natively:", err.message);
            resolve();
        });

        req.write(data);
        req.end();
    });
}

// ============================================================================
// 🔌 MODULE 3: GOOGLE SPREADSHEET JWT AUTHENTICATION GATEWAY
// ============================================================================
// ท่อส่งสัญญาณดิจิทัลเชื่อมต่อและโหลดข้อมูลตาราง Google Sheets ผ่านระบบกุญแจ Service Account
async function getSheetDoc() {
    // ดึงค่าจากเว็บ Render ถ้าไม่มี (รันในคอม) ให้ไปอ่านไฟล์แทน
    const credentials = process.env.GOOGLE_CREDENTIALS_JSON 
        ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON) 
        : require('./credentials.json');

    const serviceAccountAuth = new JWT({ 
        email: credentials.client_email, 
        key: credentials.private_key, 
        scopes: ['https://www.googleapis.com/auth/spreadsheets'] 
    });
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID, serviceAccountAuth);
    await doc.loadInfo(); return doc;
}

// 🔀 เปิดเส้นทางดัก URL หลัก ให้วิ่งไปเปิดหน้าคัมภีร์รวมศูนย์พอร์ทัล (Single Portal)
app.get('/portal', (req, res) => { 
    res.sendFile(path.join(__dirname, 'public', 'portal.html')); 
});

// ============================================================================
// 📡 MODULE 4: REAL-TIME COMMAND CENTER & DASHBOARD APIS
// ============================================================================

// 1. API ระบบเรดาร์: คอยดักเช็คว่าใครกำลังเปิดแอป พิมพ์งาน หรือบันทึกข้อมูลอยู่บ้าง
app.post('/api/presence', (req, res) => {
    const { lineId, name, status } = req.body;
    if (lineId && name) {
        activeUsers[lineId] = { name, status, lastSeen: Date.now() };
    }
    
    const now = Date.now();
    // ถ้าใครปิดหน้าต่างแอปไปเกิน 15 วินาที ให้ลบรายชื่ออกจากหน้าเรดาร์ทันที
    Object.keys(activeUsers).forEach(id => {
        if (now - activeUsers[id].lastSeen > 15000) {
            delete activeUsers[id];
        }
    });
    res.json(Object.values(activeUsers));
});

// 2. API แดชบอร์ดสรุปยอด: ดึงข้อมูลจากกูเกิ้ลชีททั้งหมดมาแปรผล ยอดสัตว์, ยอดหัตถการ, ยอดแล็บป่วย
app.get('/api/dashboard', async (req, res) => {
    try {
        const doc = await getSheetDoc();
        const procSheet = doc.sheetsByTitle['Log_Procedures'];
        const labSheet = doc.sheetsByTitle['Log_LabResults'];
        
        // 🌟 เพิ่มหมวดหมู่หัตถการให้ครบตามที่หน้าเว็บใหม่ส่งมา
        let stats = {
            animals: { 'วัว': 0, 'ควาย': 0, 'แพะ': 0, 'แกะ': 0 },
            procedures: { 'FMD': 0, 'LSD': 0, 'EDTA_tube': 0, 'Clot_tube': 0, 'Ivermectin': 0, 'Albendazole': 0, 'Chloramine': 0, 'DexamVet': 0, 'VitaminB': 0 },
            abnormalLabs: [],
            activeBorrows: []
        };

        // 1️⃣ สกัดและรวบรวมข้อมูลตัวเลขจากแท็บหัตถการ
        // ใน app.get('/api/dashboard' ...
        if (procSheet) {
            const rows = await procSheet.getRows();
            rows.forEach(r => {
                // 🌟 ย้ายวงเล็บมาครอบ parseInt เพื่อป้องกันการอ่านเจอช่องว่าง (" ") แล้วพังกลายเป็น 0 ทั้งกระดานครับ
                stats.animals['วัว'] += (parseInt(r.get('Cow')) || 0);
                stats.animals['ควาย'] += (parseInt(r.get('Buffalo')) || 0);
                stats.animals['แพะ'] += (parseInt(r.get('Goat')) || 0);
                stats.animals['แกะ'] += (parseInt(r.get('Sheep')) || 0);
                
                stats.procedures['FMD'] += (parseInt(r.get('FMD')) || 0);
                stats.procedures['LSD'] += (parseInt(r.get('LSD')) || 0);
                stats.procedures['EDTA_tube'] += (parseInt(r.get('EDTA_tube')) || 0);
                stats.procedures['Clot_tube'] += (parseInt(r.get('Clot_tube')) || 0);
                stats.procedures['Ivermectin'] += (parseInt(r.get('Ivermectin')) || 0);
                stats.procedures['Albendazole'] += (parseInt(r.get('Albendazole')) || 0);
                stats.procedures['Chloramine'] += (parseInt(r.get('Chloramine')) || 0);
                stats.procedures['DexamVet'] += (parseInt(r.get('DexamVet')) || 0);
                stats.procedures['VitaminB'] += (parseInt(r.get('VitaminB')) || parseInt(r.get('Vitamin')) || 0); 
            });
        }

        // 2️⃣ สกัดข้อมูลเฉพาะสัตว์ป่วยที่มีผลแล็บติดสัญลักษณ์สีแดง 🔴 
        if (labSheet) {
            const rows = await labSheet.getRows();
            const recentRows = rows.slice(-30).reverse(); // ดึงมาตรวจสอบ 30 แถวล่าสุดแบบย้อนกลับ
            recentRows.forEach(r => {
                const interp = r.get('Interpretation') || "";
                if (interp.includes('🔴')) {
                    stats.abnormalLabs.push({ 
                        animal: r.get('Animal_No') || "-", 
                        species: r.get('Species') || "-", 
                        farm: r.get('Owner_Name') || "ไม่ระบุ", 
                        issues: interp.split(' | ').filter(i => i.includes('🔴')).join('<br>'), 
                        date: r.get('Date') || "-" 
                    });
                }
            });
        }

        // 3️⃣ 📦 ระบบดึงรายการเบิกค้างคืน (Active Borrows)
        // 3️⃣ 📦 ระบบดึงรายการเบิกค้างคืน (Active Borrows)
        const sheetTakeout = doc.sheetsByTitle['Log_Takeout'];
        let activeBorrowsMap = {};

        if (sheetTakeout) {
            const rows = await sheetTakeout.getRows();
            rows.forEach(row => {
                const status = (row.get('Status') || '').toString().trim();
                
                if (status !== "" && !status.includes('คืนแล้ว')) {
                    const name = row.get('Staff') || 'ไม่ระบุ';
                    // 🌟 เปลี่ยนชื่อให้ตรงกับคอลัมน์ใน Sheet ใหม่ที่พี่แคปรูปให้ผมครับ
                    const itemName = row.get('Item_Name') || 'อุปกรณ์'; 
                    const qty = parseInt(row.get('Amount_Taken')) || 0;  
                    const date = row.get('Timestamp') || '-';
                    const line = row.get('Camp_Line') || '-';          

                    if (!activeBorrowsMap[name]) {
                        activeBorrowsMap[name] = { name, date, line, items: {} };
                    }
                    
                    if (activeBorrowsMap[name].items[itemName]) {
                        activeBorrowsMap[name].items[itemName].qty += qty;
                    } else {
                        activeBorrowsMap[name].items[itemName] = { name: itemName, qty: qty, unit: 'ชิ้น' };
                    }
                }
            });
        }
        
        // แปลงเป็น Array เพื่อส่งหน้าบ้าน (ประกาศตัวแปรแค่ครั้งเดียว ป้องกัน Error!)
        stats.activeBorrows = Object.values(activeBorrowsMap).map(p => ({
            name: p.name,
            date: p.date,
            line: p.line,
            items: Object.values(p.items),
            totalQty: Object.values(p.items).reduce((sum, item) => sum + item.qty, 0)
        }));

        res.json(stats);

    } catch (error) {
        console.error("Error loading dashboard:", error);
        res.status(500).json({ error: "เกิดข้อผิดพลาด" });
    }
});
            // ==========================================

// ============================================================================
// 📝 MODULE 5: LIFF DATABASE SUBMISSION & LINE NOTIFICATION ENDPOINTS
// ============================================================================

// 1. ท่อรับข้อมูลหัตถการจากฟอร์มพอร์ทัล -> ยิงบันทึกคอลัมน์กูเกิ้ลชีท -> ยิงการ์ดน้ำเงินเข้าไลน์กลุ่ม
app.post('/api/liff/procedure', async (req, res) => {
    try {
        const d = req.body;
        // อัปเดตสถานะการใช้งาน Live Radar หน้า Dashboard
        activeUsers[d.lineId] = { name: d.staffName, status: "✅ ส่งยอดหัตถการสำเร็จ!", lastSeen: Date.now() };
        
        const doc = await getSheetDoc(); 
        const procSheet = doc.sheetsByTitle['Log_Procedures'];
        
        const totalAnimals = parseInt(d.cows||0) + parseInt(d.buffs||0) + parseInt(d.goats||0) + parseInt(d.sheeps||0);
        const speciesBreakdown = `วัว:${d.cows||0}, ควาย:${d.buffs||0}, แพะ:${d.goats||0}, แกะ:${d.sheeps||0}`;

        // บันทึกข้อมูลลง Google Sheets
        // ใน app.post('/api/liff/procedure' ...
        await procSheet.addRow({
            'Timestamp': new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
            'LINE_ID': req.body.lineId,
            'Staff': req.body.staffName,
            'Date': req.body.date,
            'Line': req.body.line,
            'Owner_Name': req.body.ownerName,
            'Owner_Phone': req.body.ownerPhone,
            'Address': req.body.ownerAddress,
            // จำนวนสัตว์
            'Cow': req.body.cows,
            'Buffalo': req.body.buffs,
            'Goat': req.body.goats,
            'Sheep': req.body.sheeps,
            // หัตถการและเวชภัณฑ์ (อัปเดตให้ครบตามหน้าเว็บใหม่)
            'FMD': req.body.fmd,
            'LSD': req.body.lsd,
            'EDTA_tube': req.body.edta,
            'Clot_tube': req.body.clot,
            'Ivermectin': req.body.iver,
            'Albendazole': req.body.alben,
            'Chloramine': req.body.chloro,
            'DexamVet': req.body.dexam,
            'VitaminB': req.body.vitb
        });

        // จัดรูปแบบหน้าตา Flex Message
        const flexReport = {
            type: "flex", altText: `📝 หัตถการฟาร์มคุณ ${d.ownerName}`,
            contents: {
                type: "bubble",
                header: { type: "box", layout: "vertical", backgroundColor: "#00246B", contents: [{ type: "text", text: `📝 ยอดหัตถการ ${d.line}`, color: "#FFFFFF", weight: "bold", align: "center" }] },
                body: {
                    type: "box", layout: "vertical", spacing: "sm",
                    contents: [
                        { type: "text", text: `👤 Owner: ${d.ownerName}`, weight: "bold", color: "#1e3a8a" },
                        { type: "text", text: `📍 Address: ${d.ownerAddress} | 📞 โทร: ${d.ownerPhone}`, size: "xs", color: "#64748b", wrap: true },
                        { type: "separator", margin: "md" },
                        { type: "box", layout: "horizontal", contents: [{ type: "text", text: "Total Animals", weight: "bold", flex: 2 }, { type: "text", text: `${totalAnimals} ตัว`, align: "end", weight: "bold" }] },
                        { type: "text", text: speciesBreakdown.replace(/,/g, ' | '), size: "xs", color: "#94a3b8", wrap: true },
                        { type: "separator", margin: "md" },
                        { type: "box", layout: "horizontal", contents: [{ type: "text", text: "💉 Blood / Feces", size: "sm" }, { type: "text", text: `${d.blood} / ${d.feces} ตัว`, align: "end", size: "sm", weight: "bold" }] },
                        { type: "box", layout: "horizontal", contents: [{ type: "text", text: "🦠 FMD / LSD", size: "sm" }, { type: "text", text: `${d.fmd} / ${d.lsd} ตัว`, align: "end", size: "sm", weight: "bold" }] },
                        { type: "box", layout: "horizontal", contents: [{ type: "text", text: "💊 Iver / Alben", size: "sm" }, { type: "text", text: `${d.iver} / ${d.alben} ตัว`, align: "end", size: "sm", weight: "bold" }] },
                        { type: "box", layout: "horizontal", contents: [{ type: "text", text: "🧪 Vitamin", size: "sm" }, { type: "text", text: `${d.vitamin} ตัว`, align: "end", size: "sm", weight: "bold" }] },
                        { type: "box", layout: "horizontal", contents: [{ type: "text", text: "📌 Others", size: "sm" }, { type: "text", text: `${d.others || '-'}`, align: "end", size: "sm", weight: "bold", wrap: true }] },
                        { type: "text", text: `Recorded by: ${d.staffName}`, size: "xxs", color: "#94a3b8", align: "end", margin: "md" }
                    ]
                }
            }
        };

        // 🌟 ยิงตรงส่งข้อความเข้า LINE OA ส่วนตัวของคนกรอกเพื่อเป็นใบเสร็จสรุปยอด
        if (d.lineId && d.lineId !== "TEST_ENV") {
            await sendDirectLinePush(d.lineId, [flexReport]);
        }
        
        // ส่งข้อความแจ้งเตือนเข้าไลน์กลุ่มปศุสัตว์หลัก
        const groupId = process.env.LINE_GROUP_ID; 
        if (groupId) { 
            await sendDirectLinePush(groupId, [flexReport]);
        }
        
        res.sendStatus(200);
    } catch (err) { 
        console.error(err); 
        res.status(500).send(err.message); 
    }
});

// 2. ท่อรับข้อมูลผลตรวจแล็บ -> คำนวณวิเคราะห์เกณฑ์ทางการแพทย์ -> บันทึกแยกช่องชีท -> ยิงสไลด์เตือนสีแดงเข้ากลุ่ม
app.post('/api/liff/lab', async (req, res) => {
    try {
        const payload = req.body;
        const doc = await getSheetDoc(); 
        const labSheet = doc.sheetsByTitle['Log_LabResults'];
        const carouselBubbles = []; 

        for (const d of payload.animals) {
            let interpretationArr = [];
            
            // 🩺 ลอจิกแปรผลแล็บสด: ตรวจสอบค่า PCV ตามชนิดสัตว์
            if (d.labs.pcv) {
                const pcvVal = parseInt(d.labs.pcv); 
                const ref = LAB_REFERENCES.pcv[d.species];
                if (ref) {
                    if (pcvVal < ref[0]) interpretationArr.push(`🩸 PCV: ${pcvVal}% 🔴 [Low/Anemia]`);
                    else if (pcvVal > ref[1]) interpretationArr.push(`🩸 PCV: ${pcvVal}% 🔴 [High/Dehydration]`);
                    else interpretationArr.push(`🩸 PCV: ${pcvVal}% 🟢 [Normal]`);
                }
            }
            
            // ตรวจสอบพยาธิในเลือด
            if (d.labs.bloodParasites && d.labs.bloodParasites.length > 0) {
                if (d.labs.bloodParasites.includes("Negative")) interpretationArr.push(`🔬 Blood Smear: 🟢 Negative`);
                else interpretationArr.push(`🔬 Blood Smear: 🔴 พบเชื้อ ${d.labs.bloodParasites.join(',')}`);
            }
            
            // ตรวจสอบโรคบรูเซลโลซิส (Brucellosis)
            if (d.labs.roseBengal) {
                if (d.labs.roseBengal === "Positive") interpretationArr.push(`🧪 Rose Bengal: 🔴 Positive`);
                else interpretationArr.push(`🧪 Rose Bengal: 🟢 Negative`);
            }

            const getEpg = (arr, name) => { const item = arr ? arr.find(p => p.name === name) : null; return item ? item.epg : ""; };
            const getOtherFec = (arr) => {
                const std = ['Strongyle', 'Trichuris', 'Coccidia', 'Capillaria'];
                const item = arr ? arr.find(p => !std.includes(p.name) && p.name !== 'Negative' && p.name !== '') : null;
                return item ? { name: item.name, epg: item.epg } : { name: "", epg: "" };
            };

            const flotOther = getOtherFec(d.labs.flotation); 
            const sedOther = getOtherFec(d.labs.sedimentation);

            // ตรวจสอบและเกรดไข่พยาธิวิธี Flotation / Sedimentation
            if (d.labs.flotation && d.labs.flotation.length > 0) {
                let items = d.labs.flotation.filter(p=>p.epg!=="").map(p => `🔴 ${p.name}(${p.epg} EPG->${LAB_REFERENCES.calculateFecScore(p.epg)})`);
                if(items.length>0) interpretationArr.push(`💩 Floatation: ${items.join(', ')}`);
            }
            if (d.labs.sedimentation && d.labs.sedimentation.length > 0) {
                let items = d.labs.sedimentation.filter(p=>p.epg!=="").map(p => `🔴 ${p.name}(${p.epg} EPG->${LAB_REFERENCES.calculateFecScore(p.epg)})`);
                if(items.length>0) interpretationArr.push(`💩 Sedimentation: ${items.join(', ')}`);
            }

            const finalInterpretation = interpretationArr.join(' | ') || "🟢 ไม่พบสิ่งผิดปกติ";

            // บันทึกผลแล็บสัตว์ลงชีทรายตัว
            await labSheet.addRow({
                Timestamp: new Date().toLocaleString('th-TH'), LINE_ID: payload.lineId, Staff: payload.staffName,
                Date: payload.date, Line: payload.line, Owner_Name: payload.ownerName, Animal_No: d.animalNo, Species: d.species,
                PCV: d.labs.pcv || "", Blood_Smear: (d.labs.bloodParasites || []).join(','),
                Flotation_Strongyle: getEpg(d.labs.flotation, 'Strongyle'), Flotation_Trichuris: getEpg(d.labs.flotation, 'Trichuris'), Flotation_Coccidia: getEpg(d.labs.flotation, 'Coccidia'), Flotation_Capillaria: getEpg(d.labs.flotation, 'Capillaria'),
                Flotation_Other_Name: flotOther.name, Flotation_Other_EPG: flotOther.epg,
                Sedimentation_Strongyle: getEpg(d.labs.sedimentation, 'Strongyle'), Sedimentation_Trichuris: getEpg(d.labs.sedimentation, 'Trichuris'), Sedimentation_Coccidia: getEpg(d.labs.sedimentation, 'Coccidia'), Sedimentation_Capillaria: getEpg(d.labs.sedimentation, 'Capillaria'),
                Sedimentation_Other_Name: sedOther.name, Sedimentation_Other_EPG: sedOther.epg,
                Rose_Bengal: d.labs.roseBengal || "", Interpretation: finalInterpretation
            });

            // สร้างการ์ดจิ๋วสำหรับจัดใส่ Carousel สรุปผลแล็บ
            carouselBubbles.push({
                type: "bubble", size: "micro",
                header: { type: "box", layout: "vertical", backgroundColor: finalInterpretation.includes('🔴') ? "#dc2626" : "#16a34a", contents: [{ type: "text", text: `เบอร์ ${d.animalNo}`, color: "#ffffff", weight: "bold", size: "sm" }] },
                body: {
                    type: "box", layout: "vertical", spacing: "xs",
                    contents: [
                        { type: "text", text: `Species: ${d.species} | Farm: ${payload.ownerName}`, size: "xxs", color: "#64748b", weight: "bold" },
                        { type: "separator", margin: "sm" },
                        { type: "text", text: finalInterpretation.replace(/ \| /g, '\n'), wrap: true, size: "xs", color: "#0f172a" }
                    ]
                }
            });
        }

        if (carouselBubbles.length > 0) {
            const limitedBubbles = carouselBubbles.slice(0, 12); 
            const groupMsg = {
                type: "flex", altText: `🔬 รายงานผลแล็บฟาร์มคุณ ${payload.ownerName} (${payload.animals.length} ตัว)`,
                contents: { type: "carousel", contents: limitedBubbles }
            };

            // 🌟 ยิงตรงส่งรายงานแล็บเข้า LINE OA ส่วนตัวของคนกรอกเพื่อบันทึกประวัติ
            if (payload.lineId && payload.lineId !== "TEST_ENV") {
                await sendDirectLinePush(payload.lineId, [groupMsg]);
            }
            
            // ส่งรายงานเข้าไลน์กลุ่มปศุสัตว์หลักเพื่อให้ทีมร่วมรับทราบ
            const groupId = process.env.LINE_GROUP_ID;
            if (groupId) { 
                await sendDirectLinePush(groupId, [groupMsg]);
            }
        }
        res.sendStatus(200);
    } catch (err) { 
        console.error(err); 
        res.status(500).send(err.message); 
    }
});

// ============================================================================
// 📦 MODULE 6: TRADITIONAL INVENTORY MANAGEMENT APIS (ระบบจัดการคลังเดิม)
// ============================================================================

// 1. ช่องทางส่งข้อมูลสต็อกคลังอุปกรณ์ทั้งหมดไปดึงขึ้นหน้าเว็บบราวเซอร์พอร์ทัล
app.get('/api/inventory', async (req, res) => {
    try {
        const doc = await getSheetDoc(); 
        const invSheet = doc.sheetsByIndex[0]; 
        const rows = await invSheet.getRows();
        
        const data = rows.map(row => ({ 
            name: row.get('Item_Name') || row.get('รายการ') || '', 
            stock: parseInt(row.get('Stock') || row.get('จำนวน')) || 0, 
            unit: row.get('Unit') || row.get('ลักษณนาม') || '', 
            image: row.get('Image_URL') || row.get('รูปภาพ') || '' // 🆕 เพิ่มให้ดึงลิงก์รูปภาพจากชีท
        })).filter(item => item.name !== ''); 
        
        res.json(data);
    } catch (error) { 
        res.status(500).json({ error: 'โหลดล้มเหลว' }); 
    }
});

// 2. ช่องทางสืบค้นและดึงรายชื่อสิ่งของยืมค้างคืน (Pending Returns) รายบุคคลไปจัดโชว์หน้าแอป
app.get('/api/my-taken-items', async (req, res) => {
    const userId = req.query.userId; 
    if (!userId) return res.status(400).json({ error: 'ไม่พบไอดีผู้ใช้งาน' });
    
    try {
        const doc = await getSheetDoc(); 
        const takeoutSheet = doc.sheetsByTitle['Log_Takeout']; // ใช้ชื่อชีทให้ตรง
        const rows = await takeoutSheet.getRows();
        
        let summary = {}; // ใช้รวมยอดรายการของ
        let firstRowData = { date: "", line: "" }; // เก็บข้อมูลวันที่/สาย ของรายการแรกที่เจอ
        
        rows.forEach((row, index) => {
            // อ้างอิง Index คอลัมน์ (นับเริ่มจาก 0)
            // คอลัมน์ E (Index 4) = LINE_ID
            // คอลัมน์ F (Index 5) = Status
            // คอลัมน์ C (Index 2) = Item Name
            // คอลัมน์ D (Index 3) = Amount
            const rowUserId = (row._rawData[4] || '').toString().trim();
            const status = (row._rawData[5] || '').toString().trim();
            
            if (rowUserId === userId && (status.includes('ยังไม่คืน') || status.includes('Pending') || status === '')) {
                // เก็บวันที่/สาย จากรายการแรกที่เจอ
                if (!firstRowData.date) {
                    firstRowData.date = row._rawData[6] || ""; // คอลัมน์ G (Index 6)
                    firstRowData.line = row._rawData[7] || ""; // คอลัมน์ H (Index 7)
                }
                
                const name = row._rawData[2] || 'อุปกรณ์';
                const qty = parseInt(row._rawData[3]) || 0;
                
                // รวมยอดของคนเดียวกันเข้าด้วยกัน
                if (name) summary[name] = (summary[name] || 0) + qty;
            }
        });
        
        // ดึงข้อมูลรูป/หน่วย จากชีท Inventory มาประกบ
        const invSheet = doc.sheetsByIndex[0]; 
        const invRows = await invSheet.getRows(); 
        const itemMap = {}; 
        
        invRows.forEach(r => { 
            const name = r.get('Item_Name') || r.get('รายการ') || ""; 
            const unit = r.get('Unit') || r.get('ลักษณนาม') || 'ชิ้น'; 
            const image = r.get('Image_URL') || r.get('รูปภาพ') || '';
            if (name) itemMap[name] = { unit, image }; 
        });
        
        const resultItems = Object.keys(summary).map(name => ({ 
            name: name, 
            stock: summary[name], 
            unit: itemMap[name] ? itemMap[name].unit : 'ชิ้น',
            image: itemMap[name] ? itemMap[name].image : ''
        }));
        
        res.json({ items: resultItems, campDate: firstRowData.date, campLine: firstRowData.line });
        
    } catch (error) { 
        console.error("Error API my-taken-items:", error);
        res.status(500).json({ error: error.message }); 
    }
});

// ============================================================================
// 🤖 MODULE 7: LINE BOT WEBHOOK CHAT HANDLER (ระบบแชทหลักโต้ตอบคำสั่งไลน์)
// ============================================================================
app.post('/webhook', line.middleware(middlewareConfig), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => { console.error(err); res.status(500).end(); });
});

async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }
    const userText = event.message.text.trim(); 
    const lineId = event.source.userId;
    
    // คำสั่งความปลอดภัยสำหรับดึงไอดีกลุ่มไปเซ็ตค่า .env หลังบ้าน
    if (userText === '#ดึงไอดีกลุ่ม') {
        if (event.source.type === 'group') {
            return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ไอดีกลุ่มคือ:\n${event.source.groupId}` }] });
        } else {
            return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ต้องพิมพ์ในกลุ่มไลน์กลุ่มปศุสัตว์เท่านั้นครับ' }] });
        }
    }
    
    let profile; 
    try { 
        profile = await client.getProfile(lineId); 
    } catch (e) { 
        profile = { displayName: "เจ้าหน้าที่" }; 
    }
    const staffName = profile.displayName;

    // โมดูลประมวลผลกรณีได้รับสัญญาณเบิกของหรือคืนของรวม ที่ส่งพ่วงมาจากปุ่มแอปพอร์ทัลแบบออโต้
    if (userText.startsWith('#เบิกของรวม') || userText.startsWith('#คืนของรวม')) {
        let campDate = "-"; let campLine = "-"; let itemsStr = ""; 
        let isTakeOut = userText.startsWith('#เบิกของรวม');
        
        if (userText.includes('\n')) {
            const lines = userText.split('\n'); 
            campDate = lines[1]?.replace('Date=', '').trim() || "-"; 
            campLine = lines[2]?.replace('Line=', '').trim() || "-"; 
            itemsStr = lines[3]?.replace('Items=', '').trim() || "";
        } else { 
            itemsStr = userText.replace('#เบิกของรวม ', '').replace('#คืนของรวม ', '').trim(); 
        }
        
        let itemsToProcess = []; 
        itemsStr.split(',').forEach(itemStr => { 
            const parts = itemStr.split('|'); 
            if (parts.length === 3) itemsToProcess.push({ name: parts[0].trim(), amount: parseInt(parts[1].trim()), unit: parts[2].trim() }); 
        });
        
        if (itemsToProcess.length > 0) {
            try {
                let result;
                if (isTakeOut) {
                    result = await updateBatchInventory(lineId, staffName, campDate, campLine, itemsToProcess);
                } else {
                    result = await processReturn(lineId, staffName, campDate, campLine, itemsToProcess);
                }

                let messages = [];

                // ถ้าระบบบันทึกสำเร็จ (แม้จะแค่บางส่วน) ให้ยิง Flex Message ใบสรุปเฉพาะอันที่รอด
                if (result.processed.length > 0) {
                    const flexMsg = createFlexMessage(isTakeOut ? "📝 แจ้งเบิกอุปกรณ์" : "🔙 แจ้งคืนอุปกรณ์", staffName, campDate, campLine, result.processed, isTakeOut);
                    messages.push(flexMsg);
                }

                // ถ้าระบบโดน Google บล็อกโควต้า และมีรายการตกค้าง ให้ยิงข้อความน้องปศุแจ้งเตือน
                if (!result.success && result.failed.length > 0) {
                    const failedNames = result.failed.map(i => `- ${i.name} (${i.amount} ${i.unit})`).join('\n');
                    const actionWord = isTakeOut ? "เบิก" : "คืน";
                    const alertMsg = {
                        type: 'text',
                        text: `⚠️ น้องปศุต้องใช้เวลาในการ reload พลัง 🔋\n\nโควต้าระบบชั่วคราวเต็ม บันทึกสำเร็จไปบางส่วนครับ\n\n❌ รบกวนกด${actionWord}อุปกรณ์ที่เหลือใหม่อีกครั้งนะครับ เหลือแค่:\n${failedNames}`
                    };
                    messages.push(alertMsg);
                }
    
            // ... (โค้ดก่อนหน้า)
            // 1. ตอบกลับใบเสร็จ (ใช้ Reply Token ไปแล้ว 1 ครั้ง ถือว่าหมดอายุทันที)
            await client.replyMessage({ replyToken: event.replyToken, messages: messages });
            
            // 2. ยิงใบเสร็จเข้ากลุ่ม
            const groupId = process.env.LINE_GROUP_ID; 
            if (groupId && event.source.groupId !== groupId) { 
                await sendDirectLinePush(groupId, messages); 
            }

            // 3. ตรวจสอบสต็อกล่าสุด 
            console.log("📦 [ตรวจสอบสต็อกล่าสุด]:", result.processed.map(i => `${i.name} คงเหลือล่าสุด: ${i.remainingStock} ${i.unit}`));

            const lowStockItems = result.processed.filter(i => i.remainingStock !== undefined && i.remainingStock !== null && Number(i.remainingStock) <= 2);
            
            if (lowStockItems.length > 0 && groupId) {
                console.log(`🚨 พบอุปกรณ์ต่ำกว่าเกณฑ์ (<= 2) จำนวน ${lowStockItems.length} รายการ กำลังยิงการ์ดสีแดง...`);
                // 🟢 ตรงนี้จะไม่ Error แล้วเพราะเราเติมฟังก์ชันลงไปแล้ว
                const lowStockFlex = createLowStockFlexMessage(lowStockItems);
                await sendDirectLinePush(groupId, [lowStockFlex]); 
            }
            return;
        } catch (error) { 
            console.error("🚨 Error ในระบบคลัง:", error);
            // 🟢 เปลี่ยนมายิง Push Message ส่วนตัวแทน ป้องกันปัญหา Reply Token หมดอายุ
            await sendDirectLinePush(lineId, [{ type: 'text', text: `❌ ระบบผิดพลาด: ${error.message}` }]);
            return;
             }
        }
    }
}

// ============================================================================
// 🛠️ MODULE 8: FLEX MESSAGE FLEXIBLE CREATORS & CORE INVENTORY ENGINE
// ============================================================================

// ฟังก์ชันสร้างการ์ดส่งรายงานการเบิกจ่าย/คืนของอุปกรณ์ค่าย
function createFlexMessage(title, staffName, campDate, campLine, items, isTakeOut) {
    const headerColor = isTakeOut ? "#00246B" : "#F8B500"; 
    const textColor = isTakeOut ? "#FFFFFF" : "#00246B";
    const itemContents = items.map(i => ({ 
        type: "box", layout: "horizontal", margin: "md", 
        contents: [ 
            { type: "text", text: i.name, size: "sm", color: "#334155", flex: 2, wrap: true }, 
            { type: "text", text: `${isTakeOut ? '' : 'คืน '}${i.amount} ${i.unit}`, size: "sm", color: "#0f172a", align: "end", weight: "bold", flex: 1 } 
        ] 
    }));
    // ============================================================================
// 🚨 ฟังก์ชันสร้างการ์ด Flex Message แจ้งเตือนสต็อกอุปกรณ์ใกล้หมด (การ์ดแดง)
// ============================================================================
function createLowStockFlexMessage(items) {
    const itemContents = items.map(i => ({ 
        type: "box", layout: "horizontal", margin: "sm", 
        contents: [ 
            { type: "text", text: i.name, size: "sm", color: "#334155", flex: 2, wrap: true }, 
            { type: "text", text: `เหลือ ${i.remainingStock} ${i.unit}`, size: "sm", color: "#ef4444", align: "end", weight: "bold", flex: 1 } 
        ] 
    }));
    
    return { 
        type: "flex", altText: "⚠️ แจ้งเตือนสต็อกอุปกรณ์ใกล้หมด", 
        contents: { 
            type: "bubble", 
            header: { type: "box", layout: "vertical", backgroundColor: "#ef4444", contents: [ { type: "text", text: "⚠️ อุปกรณ์ใกล้หมดสต็อก!", color: "#ffffff", weight: "bold", size: "md", align: "center" } ] }, 
            body: { type: "box", layout: "vertical", spacing: "sm", contents: [ ...itemContents ] },
            footer: { type: "box", layout: "vertical", contents: [ { type: "text", text: "รบกวนทีมปศุสัตว์ตรวจสอบและเตรียมเติมสต็อกด้วยครับ", color: "#64748b", size: "xxs", align: "center", wrap: true } ] }
        } }};
    
    return { 
        type: "flex", altText: title, 
        contents: { 
            type: "bubble", 
            header: { type: "box", layout: "vertical", backgroundColor: headerColor, contents: [ { type: "text", text: title, color: textColor, weight: "bold", size: "md", align: "center" } ] }, 
            body: { 
                type: "box", layout: "vertical", spacing: "sm", 
                contents: [ 
                    { type: "box", layout: "horizontal", contents: [{ type: "text", text: "เจ้าหน้าที่", color: "#94a3b8", size: "sm", flex: 1 }, { type: "text", text: staffName, color: "#1e293b", size: "sm", flex: 2, align: "end", weight: "bold" }]}, 
                    { type: "box", layout: "horizontal", contents: [{ type: "text", text: "วันที่ออกค่าย", color: "#94a3b8", size: "sm", flex: 1 }, { type: "text", text: campDate, color: "#1e293b", size: "sm", flex: 2, align: "end" }]}, 
                    { type: "box", layout: "horizontal", contents: [{ type: "text", text: "สายปฏิบัติการ", color: "#94a3b8", size: "sm", flex: 1 }, { type: "text", text: campLine, color: "#1e293b", size: "sm", flex: 2, align: "end", weight: "bold" }]}, 
                    { type: "separator", margin: "md" }, 
                    ...itemContents 
                ] 
            } 
        } 
    };
}

// ฟังก์ชันสร้างเมนูต้อนรับกรณีเปิดผ่านแชทห้องไลน์ธรรมดา
function createWelcomeMenu(staffName) { 
    return { 
        type: "flex", altText: "เมนู MU VET PORTAL", 
        contents: { 
            type: "bubble", 
            header: { type: "box", layout: "vertical", backgroundColor: "#00246B", contents: [ { type: "text", text: "🐴 MU VET PORTAL", color: "#F8B500", weight: "bold", size: "md", align: "center" } ] }, 
            body: { type: "box", layout: "vertical", spacing: "md", contents: [ { type: "text", text: `สวัสดีครับคุณ ${staffName} 👋`, size: "md", weight: "bold", color: "#334155" }, { type: "text", text: "เลือกทำรายการผ่านระบบศูนย์บัญชาการได้เลยครับ", wrap: true, size: "sm", color: "#64748b" } ] }, 
            footer: { type: "box", layout: "vertical", spacing: "sm", contents: [ { type: "button", style: "primary", color: "#00246B", action: { type: "uri", label: "📱 เปิด Portal MU VET", uri: "https://liff.line.me/2010125815-yjYLY9e2ZcUG" } } ] } 
        } 
    }; 
}

// ฟังก์ชันสร้างหน้าการ์ดทางลัดสำหรับเปิด NotebookLM ปศุสัตว์คลาวด์อัจฉริยะ
function createNotebookLMMenu() { 
    return { 
        type: "flex", altText: "📖 คัมภีร์ปศุสัตว์ AI", 
        contents: { 
            type: "bubble", 
            header: { type: "box", layout: "vertical", backgroundColor: "#1e293b", contents: [ { type: "text", text: "📖 คัมภีร์ปศุสัตว์ AI", color: "#F8B500", weight: "bold", size: "md", align: "center" } ] }, 
            body: { type: "box", layout: "vertical", contents: [ { type: "text", text: "ค้นหาเทคนิคหัตถการและเนื้อหาคู่มือค่ายได้ไว แม่นยำ ผ่าน AI คลาวด์ครับ 🐴✨", wrap: true, size: "sm" } ] }, 
            footer: { type: "box", layout: "vertical", contents: [ { type: "button", style: "primary", color: "#F8B500", action: { type: "uri", label: "✨ เปิดคัมภีร์", uri: "https://notebooklm.google.com/notebook/be2b2d37-7e9c-4b3c-9b9f-2f0fc16fbc22?authuser=3&pageId=none" } } ] } 
        } 
    }; 
}

// ============================================================================
// 🛠️ อัปเดตใหม่: ฟังก์ชันตัดสต็อกแบบประหยัด API (Batch Saving)
// ============================================================================
// 🛡️ ระบบเบิกของแบบกันเหนียว (Try-Catch รายชิ้น)
async function updateBatchInventory(lineId, staffName, campDate, campLine, items) {
    const doc = await getSheetDoc(); const invSheet = doc.sheetsByIndex[0]; const logSheet = doc.sheetsByIndex[1]; const rows = await invSheet.getRows();
    
    const logRows = items.map(item => ({ Timestamp: new Date().toLocaleString('th-TH'), LINE_ID: lineId, Staff: staffName, Camp_Date: campDate, Camp_Line: campLine, Item_Name: item.name, Amount_Taken: item.amount, Unit: item.unit, Status: 'ยังไม่คืน' }));
    await logSheet.addRows(logRows);
    
    let processedItems = [];
    let failedItems = [];

    try {
        for (const item of items) { 
            const targetRow = rows.find(r => (r.get('Item_Name') || r.get('รายการ')) === item.name); 
            if (targetRow) { 
                const col = targetRow.get('Stock') !== undefined ? 'Stock' : 'จำนวน'; 
                let curr = parseInt(targetRow.get(col)) || 0; 
                targetRow.assign({ [col]: curr - item.amount }); 
                await targetRow.save(); 
                await new Promise(resolve => setTimeout(resolve, 300)); // หน่วง 0.3 วิ
            } 
            processedItems.push(item);
        }
        return { success: true, processed: processedItems, failed: [] };
    } catch (error) {
        failedItems = items.filter(item => !processedItems.includes(item));
        return { success: false, processed: processedItems, failed: failedItems, error: error.message };
    }
}

// 🛡️ ระบบคืนของ
async function processReturn(lineId, staffName, campDate, campLine, returnedItems) {
    const doc = await getSheetDoc(); const invSheet = doc.sheetsByIndex[0]; const takeoutSheet = doc.sheetsByIndex[1]; const returnSheet = doc.sheetsByIndex[2]; 
    const invRows = await invSheet.getRows(); const takeoutRows = await takeoutSheet.getRows();
    const returnLogRows = []; let processedItems = []; let failedItems = [];

    try {
        for (const item of returnedItems) {
            const userTakes = takeoutRows.filter(r => r.get('LINE_ID') === lineId && (r.get('Item_Name') === item.name || r.get('รายการ') === item.name) && (r.get('Status') === 'ยังไม่คืน' || r.get('Status') === 'Pending' || !r.get('Status')));
            let totalTaken = 0; 
            for (const row of userTakes) { 
                totalTaken += parseInt(row.get('Amount_Taken') || row.get('จำนวน')) || 0; 
                row.assign({ Status: 'คืนแล้ว' }); 
                await row.save(); 
                await new Promise(resolve => setTimeout(resolve, 300)); 
            }
            const amountUsed = totalTaken - item.amount;
            returnLogRows.push({ Timestamp: new Date().toLocaleString('th-TH'), LINE_ID: lineId, Staff: staffName, Camp_Date: campDate, Camp_Line: campLine, Item_Name: item.name, Amount_Returned: item.amount, Amount_Used: amountUsed >= 0 ? amountUsed : 0, Unit: item.unit });
            
            let newStock = 0; // 🆕 ตัวแปรเก็บสต็อกคงเหลือ
            const targetInvRow = invRows.find(r => (r.get('Item_Name') || r.get('รายการ')) === item.name); 
            if (targetInvRow) { 
                const col = targetInvRow.get('Stock') !== undefined ? 'Stock' : 'จำนวน'; 
                let curr = parseInt(targetInvRow.get(col)) || 0; 
                newStock = curr + item.amount;
                targetInvRow.assign({ [col]: newStock }); 
                await targetInvRow.save(); 
                await new Promise(resolve => setTimeout(resolve, 300)); 
            }
            processedItems.push({ ...item, remainingStock: newStock }); // 🆕 แนบสต็อกคงเหลือกลับไปให้บอท
        }
        if (returnLogRows.length > 0) { await returnSheet.addRows(returnLogRows); }
        return { success: true, processed: processedItems, failed: [] };
    } catch (error) {
        failedItems = returnedItems.filter(item => !processedItems.includes(item));
        try { if (returnLogRows.length > 0) { await returnSheet.addRows(returnLogRows); } } catch (e) { } 
        return { success: false, processed: processedItems, failed: failedItems, error: error.message };
    }
}

// 🛡️ ระบบเบิกของ
async function updateBatchInventory(lineId, staffName, campDate, campLine, items) {
    const doc = await getSheetDoc(); const invSheet = doc.sheetsByIndex[0]; const logSheet = doc.sheetsByIndex[1]; const rows = await invSheet.getRows();
    const logRows = items.map(item => ({ Timestamp: new Date().toLocaleString('th-TH'), LINE_ID: lineId, Staff: staffName, Camp_Date: campDate, Camp_Line: campLine, Item_Name: item.name, Amount_Taken: item.amount, Unit: item.unit, Status: 'ยังไม่คืน' }));
    await logSheet.addRows(logRows);
    
    let processedItems = []; let failedItems = [];
    try {
        for (const item of items) { 
            let newStock = 0; // 🆕 ตัวแปรเก็บสต็อกคงเหลือ
            const targetRow = rows.find(r => (r.get('Item_Name') || r.get('รายการ')) === item.name); 
            if (targetRow) { 
                const col = targetRow.get('Stock') !== undefined ? 'Stock' : 'จำนวน'; 
                let curr = parseInt(targetRow.get(col)) || 0; 
                newStock = curr - item.amount;
                targetRow.assign({ [col]: newStock }); 
                await targetRow.save(); 
                await new Promise(resolve => setTimeout(resolve, 300)); 
            } 
            processedItems.push({ ...item, remainingStock: newStock }); // 🆕 แนบสต็อกคงเหลือกลับไปให้บอท
        }
        return { success: true, processed: processedItems, failed: [] };
    } catch (error) {
        failedItems = items.filter(item => !processedItems.includes(item));
        return { success: false, processed: processedItems, failed: failedItems, error: error.message };
    }
}

// ============================================================================
// 📢 MODULE 9: SERVER PORT APPLICATION LISTENER
// ============================================================================
const port = 3000; 
const cron = require('node-cron');

// ==========================================
// ⏰ ระบบแจ้งเตือนพี่เอิร์ทตอน 21:00 น. ทุกวัน
// ==========================================
// ตั้งเวลา 0 21 * * * หมายถึง 21:00 น. ของทุกวัน
cron.schedule('0 21 * * *', async () => {
    try {
        // 🚨 เอา LINE ID ของพี่เอิร์ทมาใส่ตรงนี้นะครับ
        const myAdminLineId = "Uf335c75a939a20ce7e6c3e836f391a69"; 
        
        // เปลี่ยนจากของเดิม ให้เป็นแบบนี้ครับ
await client.pushMessage({
    to: myAdminLineId,
    messages: [
        {
            type: 'text',
            text: '⏰ พี่เอิร์ทครับ! 21:00 น. แล้วน้า\nอย่าลืมเข้าไปเปลี่ยนสถานะใน Google Sheet เป็น "เปิด" เพื่อให้เด็กๆ เริ่มลงทะเบียนสายของวันพรุ่งนี้นะครับ! 🚀'
        }
    ]
});
        
        console.log('[Cron Job] ส่งแจ้งเตือน 21:00 สำเร็จ');
    } catch (error) {
        console.error('[Cron Job] ส่งแจ้งเตือนพลาด:', error);
    }
}, {
    scheduled: true,
    timezone: "Asia/Bangkok" // ตั้งโซนเวลาให้เป็นเวลาไทยเป๊ะๆ
});
// ==========================================
// 🤖 LINE Webhook: ระบบลงทะเบียนสายปฏิบัติการ
// ==========================================
// ==========================================
// 🤖 LINE Webhook: ระบบลงทะเบียนสายปฏิบัติการ
// ==========================================
app.post('/webhook', express.json(), async (req, res) => {
    console.log("🔥 [WEBHOOK HIT!] มีการยิงข้อมูลมาที่ /webhook");
    try {
        const events = req.body.events;
        if (!events || events.length === 0) return res.status(200).send('OK');

        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Master_Data'];
        if (!sheet) throw new Error("ไม่พบแท็บ Master_Data");
        const rows = await sheet.getRows();

        for (const event of events) {
            if (event.type !== 'message' || event.message.type !== 'text') continue;

            const text = event.message.text.trim();
            const userId = event.source.userId;
            const replyToken = event.replyToken;

            // --- ส่วนลงทะเบียน ---
            const match = text.match(/^#?ลงทะเบียน\s+(\d+)\s+(.+)$/);
            if (match) {
                const studentId = match[1];
                const dateStr = match[2].trim();
                let foundUser = rows.find(r => r.get('Student_ID') === studentId && r.get('Camp_Date').includes(dateStr));

                if (!foundUser) {
                    await client.replyMessage({ replyToken, messages: [{ type: 'text', text: `❌ ไม่พบข้อมูลในวันที่ "${dateStr}" หรือรหัสไม่ถูกต้อง` }] });
                    continue;
                }

                if (foundUser.get('Reg_Status') !== 'เปิด') {
                    await client.replyMessage({ replyToken, messages: [{ type: 'text', text: `⏳ ระบบยังไม่เปิดให้ลงทะเบียนสายของวันที่ ${dateStr} ครับ` }] });
                    continue;
                }

                foundUser.assign({ 'LINE_UID': userId });
                await foundUser.save();
                
                // (ถ้ามี Flex Message ต้อนรับเดิม ให้วางตรงนี้ได้เลยครับ)
                continue; 
            }

            // --- ส่วนประกาศ ---
            if (text.startsWith('#ประกาศ ')) {
    const announcement = text.replace('#ประกาศ ', '').trim();
    const sender = rows.find(r => r.get('LINE_UID') === userId);

    // 🚨 เพิ่มบรรทัดนี้เพื่อดูใน Logs ของ Render ว่าระบบมองเห็นพี่เป็นตำแหน่งอะไร
    console.log(`🕵️‍♂️ ตรวจพบคำสั่งประกาศจากชื่อ: ${sender ? sender.get('Nickname') : 'ไม่พบชื่อ'} | สิทธิ์: ${sender ? sender.get('Role') : 'ไม่มีสิทธิ์'}`);

    if (!sender || (sender.get('Role') !== 'ผู้นำสาย' && sender.get('Role') !== 'หัวหน้า')) {
        await client.replyMessage({ replyToken, messages: [{ type: 'text', text: "❌ เฉพาะผู้นำสายเท่านั้นที่สามารถประกาศได้" }] });
        continue;
    }

                const myLine = sender.get('Assigned_Line');
                const myDate = sender.get('Camp_Date');
                const members = rows.filter(r => r.get('Assigned_Line') === myLine && r.get('Camp_Date') === myDate && r.get('LINE_UID'));

                for (let member of members) {
                    try { 
                        await client.pushMessage({ 
                            to: member.get('LINE_UID'), 
                            messages: [{ 
                                type: "flex", altText: `📢 ประกาศ: ${myLine}`,
                                contents: { type: "bubble", header: { type: "box", layout: "vertical", backgroundColor: "#00246B", contents: [{ type: "text", text: "📢 ประกาศจากผู้นำสาย", color: "#F8B500", weight: "bold", size: "sm" }] }, body: { type: "box", layout: "vertical", contents: [{ type: "text", text: announcement, wrap: true, color: "#334155" }] } }
                            }] 
                        }); 
                    } catch (e) { console.error(e); }
                }
                await client.replyMessage({ replyToken, messages: [{ type: 'text', text: "✅ ประกาศส่งถึงสมาชิกแล้ว!" }] });
                continue;
            }
        }
        res.status(200).send('OK');
    } catch (e) {
        console.error("🚨 Webhook Error:", e);
        res.status(500).send('Error');
    }
});
// 🔑 API รับเรื่องลงทะเบียนสายตรงจากหน้า LIFF (พร้อมส่ง Flex สรุปสมาชิก)
// ==========================================
app.post('/api/register-user', express.json(), async (req, res) => {
    try {
        const { lineId, studentId, dateStr } = req.body;
        
        if (!lineId || !studentId || !dateStr) {
            return res.status(400).json({ success: false, message: "ข้อมูลส่งมาไม่ครบถ้วน" });
        }

        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Master_Data'];
        if (!sheet) return res.status(500).json({ success: false, message: "ระบบหลังบ้านขัดข้อง (ไม่พบแท็บข้อมูล)" });

        const rows = await sheet.getRows();
        let foundUser = null;

        // 1. วิ่งหาเด็กจาก รหัสนักศึกษา และ วันที่
        for (let row of rows) {
            if (row.get('Student_ID') === studentId && row.get('Camp_Date').includes(dateStr)) {
                foundUser = row;
                break;
            }
        }

        // เงื่อนไขที่ 1: ตรวจไม่เจอประวัติ
        if (!foundUser) {
            return res.json({ success: false, message: `❌ ไม่พบประวัติการออกสายในวันที่ ${dateStr} หรือรหัสนักศึกษาไม่ถูกต้อง` });
        }

        // เงื่อนไขที่ 2: พี่เอิร์ทยังไม่เปิดระบบ
        if (foundUser.get('Reg_Status') !== 'เปิด') {
            return res.json({ success: false, message: `⏳ ขออภัยครับ ระบบลงทะเบียนสำหรับสายของวันที่ ${dateStr} ยังไม่เปิดใช้งานในขณะนี้` });
        }

        // 2. ผ่านทุกด่าน -> ผูก LINE UID
        foundUser.assign({ 'LINE_UID': lineId });
        await foundUser.save();

        // ---------------------------------------------------------
        // 🌟 เพิ่มเติม: ดึงรายชื่อเพื่อนร่วมสายทั้งหมดเพื่อทำ Flex Message แบบใหม่
        // ---------------------------------------------------------
        const myLineName = foundUser.get('Assigned_Line');
        const myCampDate = foundUser.get('Camp_Date');
        
        let memberBoxes = [];

        // วนลูปหาคนที่อยู่สายเดียวกันและวันเดียวกัน
        for (let row of rows) {
            if (row.get('Assigned_Line') === myLineName && row.get('Camp_Date') === myCampDate) {
                const isRegistered = !!row.get('LINE_UID'); // ถ้ามี LINE_UID แปลว่าลงแล้ว
                const role = row.get('Role');
                const isLeader = (role === 'ผู้นำสาย' || role === 'หัวหน้า');
                
                // รูปแบบชื่อ: หมอเอิร์ท ปี4 (ผู้นำสาย)
                const memberText = `หมอ${row.get('Nickname')} ${row.get('Year')} ${isLeader ? '(ผู้นำสาย)' : ''}`;
                
                memberBoxes.push({
                    type: "text",
                    text: isRegistered ? `✅ ${memberText}` : `❌ ${memberText}`,
                    size: "sm",
                    color: isRegistered ? "#16a34a" : "#ef4444", // สีเขียวถ้าลงแล้ว สีแดงถ้ายังไม่ลง
                    weight: isRegistered ? "regular" : "bold", // ถ้ายังไม่ลงให้ตัวหนาจะได้เด่นๆ
                    margin: "sm",
                    wrap: true
                });
            }
        }

        // สร้าง Flex Message สรุปยอด
        const flexMsg = {
            type: "flex",
            altText: `สรุปข้อมูล ${myLineName} วันที่ ${myCampDate}`,
            contents: {
                type: "bubble",
                header: {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#00246B",
                    contents: [
                        { type: "text", text: "🤝 MU VET TEAM", color: "#F8B500", weight: "bold", size: "sm" },
                        { type: "text", text: `${myLineName}`, color: "#FFFFFF", weight: "bold", size: "xl", margin: "sm" },
                        { type: "text", text: `ประจำวันที่: ${myCampDate}`, color: "#94a3b8", size: "xs", margin: "xs" }
                    ]
                },
                body: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        { type: "text", text: "รายชื่อสมาชิกในสาย:", weight: "bold", size: "md", color: "#00246B", margin: "sm" },
                        ...memberBoxes, // เอาชื่อที่ลิสต์ไว้มาหยอดใส่ตรงนี้
                        { type: "separator", margin: "lg" }
                    ]
                },
                footer: {
                    type: "box",
                    layout: "vertical",
                    contents: [
                        {
                            type: "button",
                            style: "primary",
                            color: "#F8B500",
                            action: {
                                type: "uri",
                                label: "🎯 เปิดหน้าภารกิจ",
                                uri: "https://liff.line.me/2010125977-E8l1g7Zp" 
                            }
                        }
                    ]
                }
            }
        };

        // สั่งให้บอท Push ข้อความไปหาเด็กคนนั้นในแชท LINE ทันที
        try {
            await client.pushMessage({
                to: lineId,
                messages: [flexMsg]
            });
            console.log(`✅ ส่งข้อมูลสรุปสาย ${myLineName} ให้ ${foundUser.get('Nickname')} สำเร็จ`);
        } catch (pushErr) {
            console.error("🚨 ส่ง Flex Message ไม่สำเร็จ:", pushErr);
        }

        // 3. ส่งข้อมูลกลับไปให้หน้าเว็บ LIFF เพื่อเปิดล็อก Dashboard
        res.json({
            success: true,
            profile: {
                nickname: foundUser.get('Nickname'),
                year: foundUser.get('Year'),
                campDate: foundUser.get('Camp_Date'),
                assignedLine: foundUser.get('Assigned_Line'),
                role: foundUser.get('Role')
            }
        });

    } catch (error) {
        console.error("LIFF Registration Error:", error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดของเซิร์ฟเวอร์" });
    }
});
// ==========================================
// 🔐 API เช็คสิทธิ์ผู้ใช้งาน (ดึงข้อมูลตอนเปิด LIFF)
// ==========================================
app.get('/api/user-profile', async (req, res) => {
    try {
        const lineId = req.query.lineId;
        if (!lineId) {
            return res.status(400).json({ success: false, message: "No Line ID provided" });
        }

        // เชื่อมต่อ Google Sheet
        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Master_Data'];
        
        if (!sheet) {
            console.error("❌ หาแท็บ Master_Data ไม่เจอใน Google Sheet โปรดเช็คชื่อแท็บอีกครั้ง");
            return res.status(500).json({ success: false, message: "System Error: No Master_Data sheet" });
        }

        const rows = await sheet.getRows();
        let userProfile = null;

        // ค้นหาจาก LINE_UID ที่อาจจะเคยผูกไว้แล้ว
        for (let row of rows) {
            if (row.get('LINE_UID') === lineId) {
                userProfile = {
                    nickname: row.get('Nickname'),
                    year: row.get('Year'),
                    campDate: row.get('Camp_Date'),
                    assignedLine: row.get('Assigned_Line'),
                    role: row.get('Role')
                };
                break; // เจอแล้วหยุดหา
            }
        }

        if (userProfile) {
            // กรณีที่ 1: เคยลงทะเบียนแล้ว (มี LINE_UID ตรงกัน)
            res.json({ success: true, profile: userProfile });
        } else {
            // กรณีที่ 2: ยังไม่เคยลงทะเบียน หรือหาไม่เจอ
            res.json({ success: false, message: "ยังไม่ได้ลงทะเบียน" });
        }
    } catch (error) {
        console.error("🚨 Profile Fetch Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});
// ==========================================
// 📋 API 1: ดึงข้อมูลภารกิจและเช็คลิสต์ที่ทำไปแล้ว
// ==========================================
app.get('/api/mission-details', async (req, res) => {
    try {
        const { date, line } = req.query;
        const doc = await getSheetDoc();
        
        // 1. ดึงข้อมูลสถานที่และงาน (Missions_Data)
        const missionSheet = doc.sheetsByTitle['Missions_Data'];
        if (!missionSheet) return res.status(500).json({ success: false, message: "ไม่พบแท็บ Missions_Data" });
        
        const mRows = await missionSheet.getRows();
        const mission = mRows.find(r => r.get('Camp_Date') === date && r.get('Assigned_Line') === line);

        // 2. ดึงสถานะเช็คลิสต์ (Checklist_Status) เอาเฉพาะที่ติ๊กแล้ว
        const checkSheet = doc.sheetsByTitle['Checklist_Status'];
        if (!checkSheet) return res.status(500).json({ success: false, message: "ไม่พบแท็บ Checklist_Status" });

        const cRows = await checkSheet.getRows();
        
        // กวาดหาว่างานไหนบ้างที่ถูกติ๊กว่า 'Checked' ในสายนี้และวันนี้
        const checkedTasks = cRows.filter(r => r.get('Camp_Date') === date && r.get('Assigned_Line') === line && r.get('Status') === 'Checked')
                                  .map(r => r.get('Task_Name'));

        res.json({
            success: true,
            mission: mission ? {
                location: mission.get('Location'),
                count: mission.get('Animal_Count'),
                detail: mission.get('Task_Details')
            } : null,
            checkedTasks: checkedTasks // ส่งกลับไปแค่รายชื่อหัวข้อที่ติ๊กแล้ว
        });
    } catch (e) { 
        console.error("Mission Fetch Error:", e);
        res.status(500).json({ success: false }); 
    }
});

// ==========================================
// ✅ API 2: อัปเดตสถานะเช็คลิสต์ (ระบบฉลาด: ไม่มีสร้างใหม่ มีแล้วอัปเดต)
// ==========================================
app.post('/api/update-checklist', express.json(), async (req, res) => {
    try {
        const { date, line, phase, task, status } = req.body;
        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Checklist_Status'];
        const rows = await sheet.getRows();
        
        // หาว่าเคยมีการบันทึกหัวข้อนี้ลงชีทหรือยัง?
        const row = rows.find(r => r.get('Camp_Date') === date && r.get('Assigned_Line') === line && r.get('Task_Name') === task);
        
        if (row) {
            // ถ้ามีแล้ว -> อัปเดตสถานะ (Checked / Unchecked)
            row.assign({ 'Status': status });
            await row.save();
        } else {
            // ถ้ายังไม่เคยมี -> สร้างแถวใหม่ลง Sheet ทันที
            await sheet.addRow({
                'Camp_Date': date,
                'Assigned_Line': line,
                'Phase': phase,
                'Task_Name': task,
                'Status': status
            });
        }
        res.json({ success: true });
    } catch (e) { 
        console.error("Checklist Update Error:", e);
        res.status(500).json({ success: false }); 
    }
});
app.get('/api/all-missions', async (req, res) => {
    try {
        const doc = await getSheetDoc();
        const mRows = await doc.sheetsByTitle['Missions_Data'].getRows();
        const cRows = await doc.sheetsByTitle['Checklist_Status'].getRows();

        const missions = mRows.map(m => {
            const line = m.get('Assigned_Line');
            const date = m.get('Camp_Date');
            
            // คำนวณ % ความคืบหน้า (งานที่ติ๊กแล้ว / งานทั้งหมด)
            const completed = cRows.filter(c => c.get('Camp_Date') === date && c.get('Assigned_Line') === line && c.get('Status') === 'Checked').length;
            const progress = Math.round((completed / 10) * 100); // เทียบจากงานมาตรฐาน 10 ข้อ

            return {
                line: line,
                location: m.get('Location'),
                detail: m.get('Task_Details'),
                progress: progress
            };
        });

        res.json({ success: true, missions });
    } catch (e) { res.status(500).json({ success: false }); }
});
app.listen(port, () => { 
    console.log(`🚀 บอท MU VET PORTAL รันระบบสมบูรณ์แบบไร้ที่ติ 100% บน Port ${port}`); 
});