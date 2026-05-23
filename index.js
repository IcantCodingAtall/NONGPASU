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
// 📢 ใส่ Group ID ของกลุ่มไลน์ปศุสัตว์ที่พี่ก๊อปปี้มาจากสเตปที่ 1 ตรงนี้ครับ
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
// ==========================================
// 📊 API 4: ดึงข้อมูล Dashboard (ซ่อมบัคหน่วย Undefined + ตัดยอดค้างเมื่อคืนแล้ว)
// ==========================================
// ==========================================
// 📊 API 4: ดึงข้อมูล Dashboard (ล้างบัคเว้นวรรค + คำนวณค้างเบิกเป๊ะ 100%)
// ==========================================
app.get('/api/dashboard', async (req, res) => {
    try {
        const doc = await getSheetDoc();
        
        const pLogSheet = doc.sheetsByTitle['Log_Procedures'] || doc.sheetsByTitle['Procedure_Log'];
        const pRows = pLogSheet ? await pLogSheet.getRows() : [];
        let animals = { 'วัว': 0, 'ควาย': 0, 'แพะ': 0, 'แกะ': 0 };
        let procedures = { 'FMD': 0, 'LSD': 0, 'EDTA_tube': 0, 'Clot_tube': 0, 'Ivermectin': 0, 'Albendazole': 0, 'Chloramine': 0, 'DexamVet': 0, 'VitaminB': 0 };

        pRows.forEach(r => {
            animals['วัว'] += (parseInt(r.get('Cow')) || 0);
            animals['ควาย'] += (parseInt(r.get('Buffalo')) || 0);
            animals['แพะ'] += (parseInt(r.get('Goat')) || 0);
            animals['แกะ'] += (parseInt(r.get('Sheep')) || 0);

            for (let key in procedures) {
                let sheetKey = key;
                if(key === 'EDTA_tube') sheetKey = 'EDTA_Tube';
                if(key === 'Clot_tube') sheetKey = 'Clot_Tube';
                if(key === 'Ivermectin') sheetKey = 'Iver';
                if(key === 'Albendazole') sheetKey = 'Alben';
                if(key === 'VitaminB') sheetKey = 'VitaminB';
                procedures[key] += (parseInt(r.get(sheetKey)) || 0);
            }
        });

        const invSheet = doc.sheetsByTitle['Inventory'];
        const invRows = invSheet ? await invSheet.getRows() : [];
        let unitMap = {};
        invRows.forEach(r => {
            const itemName = (r.get('รายการ') || '').trim(); // 🚨 เพิ่ม .trim()
            const unit = (r.get('Unit') || '').trim() || 'ชิ้น';
            if(itemName) unitMap[itemName] = unit;
        });

        // 🌟 คำนวณค้างเบิกด้วยคณิตศาสตร์ (เอาเบิกทั้งหมด ลบด้วย คืนทั้งหมด ป้องกันบัค Status)
        const takeoutSheet = doc.sheetsByTitle['Log_Takeout'];
        const returnSheet = doc.sheetsByTitle['Log_Return'];
        
        const tRows = takeoutSheet ? await takeoutSheet.getRows() : [];
        const rRows = returnSheet ? await returnSheet.getRows() : [];

        let lineItemsTrack = {};

        tRows.forEach(r => {
            const line = r.get('Camp_Line');
            const date = r.get('Camp_Date');
            const name = (r.get('Item_Name') || '').trim(); // 🚨 เพิ่ม .trim()
            const qty = parseInt(r.get('Amount_Taken')) || 0;
            const staff = r.get('Staff') || "ผู้ปฏิบัติงาน";
            const unit = unitMap[name] || 'ชิ้น'; 

            if (qty > 0 && line && date) {
                const key = `${line}_${date}_${name}`;
                if (!lineItemsTrack[key]) lineItemsTrack[key] = { line, date, name, qty: 0, staff, unit }; 
                lineItemsTrack[key].qty += qty;
            }
        });

        rRows.forEach(r => {
            const line = r.get('Camp_Line');
            const date = r.get('Camp_Date');
            const name = (r.get('Item_Name') || '').trim(); // 🚨 เพิ่ม .trim()
            const qty = parseInt(r.get('Amount_Returned')) || 0;

            if (qty > 0 && line && date) {
                const key = `${line}_${date}_${name}`;
                if (lineItemsTrack[key]) lineItemsTrack[key].qty -= qty; 
            }
        });

        let activeBorrowsGrouped = {};
        Object.values(lineItemsTrack).forEach(item => {
            // 🚨 ถ้าหักลบแล้วเหลือ 0 จะหายไปจาก Dashboard อัตโนมัติ!
            if (item.qty > 0) { 
                const mapKey = `${item.line}_${item.date}`;
                if (!activeBorrowsGrouped[mapKey]) activeBorrowsGrouped[mapKey] = { line: item.line, date: item.date, name: item.staff, totalQty: 0, items: [] };
                activeBorrowsGrouped[mapKey].totalQty += item.qty;
                activeBorrowsGrouped[mapKey].items.push({ name: item.name, qty: item.qty, unit: item.unit }); 
            }
        });

        res.json({
            animals, procedures, activeBorrows: Object.values(activeBorrowsGrouped), abnormalLabs: [] 
        });
    } catch (e) { 
        console.error("Dashboard Fetch Error:", e);
        res.status(500).json({ success: false }); 
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
// ==========================================
// 📦 API ดึงข้อมูลคลังสินค้ามาโชว์ในเว็บ
// ==========================================
// ==========================================
// 📦 API ดึงข้อมูลคลังสินค้า (แก้ไขให้ตรงกับคอลัมน์ชีทเป๊ะๆ)
// ==========================================
app.get('/api/inventory', async (req, res) => {
    try {
        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Inventory'];
        
        if (!sheet) {
            console.error("❌ หาชีทชื่อ 'Inventory' ไม่เจอ (ลองเช็คว่ามีเว้นวรรคซ่อนอยู่ไหม)");
            return res.json([]);
        }
        
        const rows = await sheet.getRows();
        console.log(`📦 ดึงข้อมูลคลัง Inventory สำเร็จ! พบทั้งหมด ${rows.length} แถว`);
        
        // ดึงให้ตรงกับชื่อหัวคอลัมน์ในชีทพี่เป๊ะๆ: 'รายการ', 'จำนวน', 'Unit', 'Image_URL'
        const inventoryList = rows.map(r => ({
            name: r.get('รายการ') ? r.get('รายการ').trim() : 'ไม่ทราบชื่อ',
            stock: parseInt(r.get('จำนวน')) || 0,
            unit: r.get('Unit') ? r.get('Unit').trim() : 'ชิ้น',
            image: r.get('Image_URL') || ''
        }));
        
        // กรองเอาเฉพาะบรรทัดที่กรอกชื่อรายการแล้วเท่านั้น ป้องกันบรรทัดว่างติดมา
        const validItems = inventoryList.filter(i => i.name !== 'ไม่ทราบชื่อ' && i.name !== '');
        
        res.json(validItems);
    } catch(e) {
        console.error("🚨 Fetch Inventory Error:", e);
        res.status(500).json([]);
    }
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
            footer: { type: "box", layout: "vertical", spacing: "sm", contents: [ { type: "button", style: "primary", color: "#00246B", action: { type: "uri", label: "📱 เปิด Portal MU VET", uri: "https://liff.line.me/2010125977-E8l1g7Zp" } } ] } 
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
// 📦 API 1: ดึงยอดค้างเบิกรวมของ "ทั้งสายปฏิบัติการ"
// ==========================================
// ==========================================
// 📦 API 1: ดึงยอดค้างเบิกรวมของ "ทั้งสายปฏิบัติการ"
// ==========================================
// ==========================================
// 📦 API 1: ดึงยอดค้างเบิกรวมของทั้งสาย + ดึงรูปภาพจาก Inventory มารวม
// ==========================================
// ==========================================
// 📦 API 1: ดึงยอดค้างเบิกรวมของทั้งสาย (เพิ่ม .trim() ป้องกันบัค)
// ==========================================
app.get('/api/team-taken-items', async (req, res) => {
    try {
        const { date, line } = req.query;
        const doc = await getSheetDoc();
        
        const takeoutSheet = doc.sheetsByTitle['Log_Takeout']; 
        const returnSheet = doc.sheetsByTitle['Log_Return'];
        const invSheet = doc.sheetsByTitle['Inventory']; 
        
        if(!takeoutSheet) return res.json({ items: [], campDate: date, campLine: line });
        
        const tRows = await takeoutSheet.getRows();
        const rRows = returnSheet ? await returnSheet.getRows() : [];
        const invRows = invSheet ? await invSheet.getRows() : [];

        let itemMap = {};
        invRows.forEach(r => {
            const name = (r.get('รายการ') || "").trim(); // 🚨 .trim()
            const unit = (r.get('Unit') || "").trim() || "ชิ้น";
            const img = r.get('Image_URL') || "";
            if(name) itemMap[name] = { unit, img };
        });

        let teamItems = {};

        tRows.forEach(r => {
            if (r.get('Camp_Date') === date && r.get('Camp_Line') === line) {
                const itemName = (r.get('Item_Name') || "").trim(); // 🚨 .trim()
                const qty = parseInt(r.get('Amount_Taken')) || 0;

                if (!teamItems[itemName]) {
                    teamItems[itemName] = { 
                        name: itemName, stock: 0, unit: itemMap[itemName] ? itemMap[itemName].unit : 'ชิ้น', image: itemMap[itemName] ? itemMap[itemName].img : ''
                    };
                }
                teamItems[itemName].stock += qty;
            }
        });

        rRows.forEach(r => {
            if (r.get('Camp_Date') === date && r.get('Camp_Line') === line) {
                const itemName = (r.get('Item_Name') || "").trim(); // 🚨 .trim()
                const qty = parseInt(r.get('Amount_Returned')) || 0;
                if (teamItems[itemName]) teamItems[itemName].stock -= qty;
            }
        });

        const pendingItems = Object.values(teamItems).filter(i => i.stock > 0);
        res.json({ items: pendingItems, campDate: date, campLine: line });
    } catch(e) { console.error(e); res.status(500).json({ items: [] }); }
});

app.post('/api/inventory-action', express.json(), async (req, res) => {
    try {
        const cleanStr = (v, def) => (v === undefined || v === null || String(v).trim() === 'undefined' || String(v).trim() === '') ? def : String(v).trim();
        const cleanNum = (v) => parseInt(v) || 0;

        const { lineId, staffName: rawStaff, date: rawDate, line: rawLine, action: rawAction, items = [] } = req.body;
        const staffName = cleanStr(rawStaff, 'ผู้ปฏิบัติงาน');
        const date = cleanStr(rawDate, 'ไม่ระบุวันที่');
        const line = cleanStr(rawLine, 'ไม่ระบุสาย');
        const action = cleanStr(rawAction, 'ทำรายการ');

        const doc = await getSheetDoc();
        const invSheet = doc.sheetsByTitle['Inventory'];
        if (!invSheet) throw new Error("ไม่พบแท็บ Inventory");

        const invRows = await invSheet.getRows();
        let flexItemsList = [];

        // 🚨 1. เช็คของในคลังก่อนว่าพอไหม (ใส่ .trim() ดักเว้นวรรค)
        if (action === 'เบิกของ') {
            for (let item of items) {
                const itemNameTrimmed = cleanStr(item.name, '');
                const targetRow = invRows.find(r => (r.get('รายการ') || '').trim() === itemNameTrimmed);
                if (targetRow) {
                    const currentStock = parseInt(targetRow.get('จำนวน')) || 0;
                    if (currentStock < cleanNum(item.qty)) {
                        return res.status(400).json({ success: false, message: `⚠️ อุปกรณ์ไม่พอเบิก! [${item.name}] ในคลังเหลือเพียง ${currentStock} ${item.unit}` });
                    }
                }
            }
        }

        // 2. บันทึกประวัติลง Log แบบรวบยอด
        const rowsToInsert = [];
        if (action === 'เบิกของ') {
            items.forEach(item => rowsToInsert.push({ 'Timestamp': new Date().toLocaleString('th-TH'), 'Staff': staffName, 'Item_Name': cleanStr(item.name, ''), 'Amount_Taken': cleanNum(item.qty), 'LINE_ID': lineId, 'Status': 'ยังไม่คืน', 'Camp_Date': date, 'Camp_Line': line }));
            await doc.sheetsByTitle['Log_Takeout'].addRows(rowsToInsert);
        } else if (action === 'คืนของ') {
            items.forEach(item => rowsToInsert.push({ 'Timestamp': new Date().toLocaleString('th-TH'), 'LINE_ID': lineId, 'Item_Name': cleanStr(item.name, ''), 'Amount_Returned': cleanNum(item.qty), 'Amount_Used': 0, 'Unit': cleanStr(item.unit, 'ชิ้น'), 'Camp_Date': date, 'Camp_Line': line }));
            await doc.sheetsByTitle['Log_Return'].addRows(rowsToInsert);
        }

        // 🌟 3. อัปเดตตัดสต๊อกหน้า Inventory (หาแถวเจอ 100%)
        for (let item of items) {
            const itemNameTrimmed = cleanStr(item.name, '');
            const targetRow = invRows.find(r => (r.get('รายการ') || '').trim() === itemNameTrimmed);
            let finalStock = 0;
            
            if (targetRow) {
                let currentStock = parseInt(targetRow.get('จำนวน')) || 0;
                if (action === 'เบิกของ') currentStock -= cleanNum(item.qty);
                else if (action === 'คืนของ') currentStock += cleanNum(item.qty);
                finalStock = currentStock < 0 ? 0 : currentStock;
                targetRow.set('จำนวน', finalStock);
                await targetRow.save(); 
            } else {
                console.warn(`⚠️ หาอุปกรณ์ชื่อ [${itemNameTrimmed}] ไม่เจอในชีท Inventory`);
            }
            flexItemsList.push({ name: itemNameTrimmed, qty: cleanNum(item.qty), unit: cleanStr(item.unit, 'ชิ้น'), remaining: finalStock });
        }

        // 🌟 4. ซ่อมสถานะให้เป็น "คืนแล้ว" ใน Log_Takeout
        if (action === 'คืนของ') {
            const tkSheet = doc.sheetsByTitle['Log_Takeout'];
            if(tkSheet) {
                const tkRows = await tkSheet.getRows();
                let rowsToUpdate = [];
                for (let item of items) {
                    const itemNameTrimmed = cleanStr(item.name, '');
                    tkRows.forEach(r => {
                        if (r.get('Camp_Date') === date && 
                            r.get('Camp_Line') === line && 
                            (r.get('Item_Name') || '').trim() === itemNameTrimmed && 
                            r.get('Status') !== 'คืนแล้ว') {
                            
                            r.set('Status', 'คืนแล้ว');
                            if (!rowsToUpdate.includes(r)) rowsToUpdate.push(r);
                        }
                    });
                }
                for (let r of rowsToUpdate) { await r.save(); }
            }
        }

        // 5. บิลด์ Flex Message
        const colorMain = action === 'เบิกของ' ? '#00246B' : '#dc2626'; 
        const icon = action === 'เบิกของ' ? '📤' : '📥';
        let itemListHtml = flexItemsList.map(i => ({
            type: "box", layout: "vertical", margin: "sm", paddingAll: "8px", backgroundColor: "#f8fafc", cornerRadius: "8px",
            contents: [
                { type: "box", layout: "horizontal", contents: [{ type: "text", text: i.name, size: "sm", color: "#334155", flex: 3, wrap: true }, { type: "text", text: `${i.qty} ${i.unit}`, size: "sm", color: colorMain, weight: "bold", align: "end", flex: 1 }] },
                { type: "text", text: `📦 คงเหลือในคลัง: ${i.remaining} ${i.unit}`, size: "xxs", color: "#64748b", margin: "xs" }
            ]
        }));

        const flexMsg = { type: "flex", altText: `แจ้งเตือนทำรายการ${action}`, contents: { type: "bubble", header: { type: "box", layout: "vertical", backgroundColor: colorMain, contents: [{ type: "text", text: `${icon} รายการ${action}`, color: "#ffffff", weight: "bold", size: "lg" }, { type: "text", text: `ประจำ ${line} (${date})`, color: "#e2e8f0", size: "xs", margin: "sm" }] }, body: { type: "box", layout: "vertical", contents: [{ type: "text", text: `👤 หมอ${staffName}`, size: "xs", color: "#94a3b8", margin: "sm" }, { type: "separator", margin: "md" }, ...itemListHtml] } } };

        try { await client.pushMessage({ to: lineId, messages: [flexMsg] }); } catch(e){}
        const groupId = process.env.LINE_GROUP_ID;
        if (groupId) { try { await client.pushMessage({ to: groupId, messages: [flexMsg] }); } catch(e){} }

        res.json({ success: true });

    } catch (e) {
        console.error("Inventory Action Error:", e);
        const msg = (e.message || "").toLowerCase();
        if (msg.includes("quota") || msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
            return res.status(429).json({ success: false, message: "ระบบหมดพลัง ⏳ ขอให้รอ 1 นาทีแล้วกดทำรายการอีกครั้ง ขออภัยครับ" });
        }
        res.status(500).json({ success: false, message: e.message }); 
    }
});

// ==========================================
// 📝 API 3: บันทึกหัตถการ & แก้ไขคำว่า undefined ให้เป็น 0 แบบถาวร (Failsafe)
// ==========================================
app.post('/api/liff/procedure', express.json(), async (req, res) => {
    try {
        console.log("📥 [API หัตถการ] ข้อมูลดิบที่ส่งมาจากฟอร์มหน้าเว็บ:", JSON.stringify(req.body));

        // 🧹 ฟังก์ชันกรองตัวเลขและข้อความ ป้องกันคำว่า 'undefined' หลุดรอดไปในระบบ
        const cleanNum = (v) => {
            if (v === undefined || v === null || String(v).trim() === 'undefined' || String(v).trim() === '') return 0;
            return parseInt(v) || 0;
        };
        const cleanStr = (v, def) => (v === undefined || v === null || String(v).trim() === '' || String(v).trim() === 'undefined') ? def : String(v).trim();

        // 👥 ดึงข้อมูลทั่วไป
        const lineId = req.body.lineId;
        const staffName = cleanStr(req.body.staffName, 'ผู้ปฏิบัติงาน');
        const date = cleanStr(req.body.date, '-');
        const line = cleanStr(req.body.line, '-');
        const ownerName = cleanStr(req.body.ownerName, 'ไม่ระบุ');
        const ownerPhone = cleanStr(req.body.ownerPhone, '-');
        const ownerAddress = cleanStr(req.body.ownerAddress, '-');
        
        // 🐄 ดึงจำนวนสัตว์ (ดักรองรับทุกชื่อตัวแปรเผื่อหน้าเว็บส่งมาสลับกัน)
        const cows = cleanNum(req.body.cows || req.body.cow);
        const buffs = cleanNum(req.body.buffs || req.body.buff || req.body.buffalo);
        const goats = cleanNum(req.body.goats || req.body.goat);
        const sheeps = cleanNum(req.body.sheeps || req.body.sheep);

        // 🦠 ดึงข้อมูลยาและวัคซีน
        const fmd = cleanNum(req.body.fmd);
        const lsd = cleanNum(req.body.lsd);
        const iver = cleanNum(req.body.iver || req.body.ivermectin);
        const alben = cleanNum(req.body.alben || req.body.albendazole);
        const chloro = cleanNum(req.body.chloro || req.body.chloramine);
        const dexam = cleanNum(req.body.dexam || req.body.dexamvet);

        // 💉 🕵️‍♂️ สับรางจับคู่ตัวแปรเก่า-ใหม่ ป้องกันบัค Undefined 100%
        // หน้าเว็บอาจส่งมาเป็น edta/clot หรือส่งรวมมาเป็นชื่อ blood หน้าหลังบ้านรองรับหมดครับ
        const edta = cleanNum(req.body.edta || req.body.EDTA_Tube || req.body.blood); 
        const clot = cleanNum(req.body.clot || req.body.Clot_Tube || 0); 
        const feces = cleanNum(req.body.feces || req.body.Feces || 0);
        const vitb = cleanNum(req.body.vitb || req.body.vitamin || req.body.vitaminb || req.body.VitaminB);

        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Log_Procedures'];
        
        if (sheet) {
            // 🌟 บันทึกลงคอลัมน์ชีทของพี่เป๊ะๆ ข้อมูลลงล็อกสมบูรณ์แบบ
            await sheet.addRow({ 
                'Timestamp': new Date().toLocaleString('th-TH'), 
                'Staff_Name': staffName, 
                'Camp_Date': date, 
                'Assigned_Line': line, 
                'Owner_Name': ownerName, 
                'Owner_Phone': ownerPhone,
                'Owner_Address': ownerAddress,
                'Cow': cows, 
                'Buffalo': buffs, 
                'Goat': goats, 
                'Sheep': sheeps, 
                'EDTA_Tube': edta, 
                'Clot_Tube': clot, 
                'Feces': feces,
                'FMD': fmd, 
                'LSD': lsd, 
                'Ivermectin': iver, 
                'Albendazole': alben,
                'VitaminB': vitb,
                'Chloramine': chloro, 
                'DexamVet': dexam, 
                'Other': (chloro > 0 || dexam > 0) ? `Chloro(${chloro}) Dexam(${dexam})` : '-'
            });
        }

        const totalAnim = cows + buffs + goats + sheeps;
        const othersArr = [];
        if (chloro > 0) othersArr.push(`Chloro (${chloro})`);
        if (dexam > 0) othersArr.push(`Dexam (${dexam})`);
        const othersStr = othersArr.length > 0 ? othersArr.join(', ') : '-';

        // 🎨 ปรับปรุง Flex Message โครงสร้างใหม่ ไม่เรียกใช้ชื่อตัวแปรดิบที่พัง ดึงจากเครื่องกรองคำโดยตรง
        const flexMsg = {
            type: "flex", altText: `ยอดหัตถการ ${line}`,
            contents: {
                type: "bubble",
                header: { type: "box", layout: "vertical", backgroundColor: "#00246B", contents: [{ type: "text", text: `📝 ยอดหัตถการ ${line}`, color: "#ffffff", weight: "bold", size: "lg", align: "center" }] },
                body: {
                    type: "box", layout: "vertical",
                    contents: [
                        { type: "text", text: `👤 Owner: ${ownerName}`, weight: "bold", size: "md", color: "#00246B" },
                        { type: "text", text: `📍 ที่อยู่: ${ownerAddress} | 📞 โทร: ${ownerPhone}`, size: "xs", color: "#64748b", margin: "sm" },
                        { type: "separator", margin: "md" },
                        { type: "box", layout: "horizontal", margin: "md", contents: [{ type: "text", text: "Total Animals", size: "sm", color: "#334155", weight: "bold" }, { type: "text", text: `${totalAnim} ตัว`, size: "sm", color: "#00246B", align: "end", weight: "bold" }] },
                        { type: "text", text: `วัว:${cows} | ควาย:${buffs} | แพะ:${goats} | แกะ:${sheeps}`, size: "xs", color: "#94a3b8", margin: "sm" },
                        { type: "separator", margin: "md" },
                        
                        // รายการแล็บและเวชภัณฑ์ ปลอดภัยไร้คำว่า undefined
                        { type: "box", layout: "horizontal", margin: "md", contents: [{ type: "text", text: "💉 Blood (EDTA / Clot)", size: "sm", color: "#334155" }, { type: "text", text: `${edta} / ${clot} หลอด`, size: "sm", color: "#00246B", align: "end", weight: "bold" }] },
                        { type: "box", layout: "horizontal", margin: "md", contents: [{ type: "text", text: "💩 Feces Sample", size: "sm", color: "#334155" }, { type: "text", text: `${feces} ตัว`, size: "sm", color: "#00246B", align: "end", weight: "bold" }] },
                        { type: "box", layout: "horizontal", margin: "md", contents: [{ type: "text", text: "🦠 FMD / LSD", size: "sm", color: "#334155" }, { type: "text", text: `${fmd} / ${lsd} ตัว`, size: "sm", color: "#00246B", align: "end", weight: "bold" }] },
                        { type: "box", layout: "horizontal", margin: "md", contents: [{ type: "text", text: "💊 Iver / Alben", size: "sm", color: "#334155" }, { type: "text", text: `${iver} / ${alben} ตัว`, size: "sm", color: "#00246B", align: "end", weight: "bold" }] },
                        { type: "box", layout: "horizontal", margin: "md", contents: [{ type: "text", text: "🧪 Vitamin B", size: "sm", color: "#334155" }, { type: "text", text: `${vitb} ตัว`, size: "sm", color: "#00246B", align: "end", weight: "bold" }] },
                        
                        { type: "box", layout: "horizontal", margin: "md", contents: [{ type: "text", text: "📌 Others", size: "sm", color: "#334155" }, { type: "text", text: othersStr, size: "sm", color: "#00246B", align: "end", weight: "bold" }] },
                        { type: "text", text: `Recorded by: หมอ${staffName}`, size: "xxs", color: "#cbd5e1", align: "end", margin: "lg" }
                    ]
                }
            }
        };

        // ส่งเข้าแชทส่วนตัวคนคีย์ข้อมูล
        try { await client.pushMessage({ to: lineId, messages: [flexMsg] }); } catch(e) {}
        
        // ส่งเข้าไลน์กลุ่มปศุสัตว์หลักตามค่าที่ผูกใน env
        const groupId = process.env.LINE_GROUP_ID;
        if (groupId) { 
            try { await client.pushMessage({ to: groupId, messages: [flexMsg] }); } catch(err) {} 
        }

        res.json({ success: true });
    } catch (e) {
        console.error("Procedure Save Error:", e);
        res.status(500).json({ success: false });
    }
});
// ==========================================
// 🤖 LINE WEBHOOK: รองรับระบบประกาศ, เลิกสาย และ คัดกรองของเบิก/คืนแบบพิมพ์ (Fallback)
// ==========================================
app.post('/webhook', express.json(), async (req, res) => {
    try {
        const events = req.body.events;
        if (!events || events.length === 0) return res.status(200).send('OK');

        console.log("🔥 [WEBHOOK] มีข้อมูลวิ่งเข้ามาในแชทบอท!");

        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Master_Data'];
        if (!sheet) throw new Error("ไม่พบแท็บ Master_Data ใน Google Sheet");
        
        const rows = await sheet.getRows();

        for (const event of events) {
            if (event.type !== 'message' || event.message.type !== 'text') continue;

            const text = event.message.text.trim();
            const userId = event.source.userId;
            const replyToken = event.replyToken;

            console.log(`💬 ตรวจจับข้อความพิมพ์: "${text}" | จาก LINE ID: ${userId}`);

            // 📢 1. ระบบจัดการคำสั่งประกาศกลุ่มภารกิจ (#ประกาศ)
            if (text.match(/^#\s*ประกาศ/)) {
                console.log("👉 เข้าสู่กระบวนการ #ประกาศ...");
                const announcement = text.replace(/^#\s*ประกาศ\s*/, '').trim();
                if (!announcement) {
                    await client.replyMessage({ replyToken, messages: [{ type: 'text', text: "❌ กรุณาพิมพ์ข้อความที่ต้องการประกาศด้วยครับ เช่น\n#ประกาศ พรุ่งนี้เจอกัน 6 โมง" }] });
                    continue;
                }
                const sender = rows.find(r => r.get('LINE_UID') === userId);
                if (!sender) {
                    await client.replyMessage({ replyToken, messages: [{ type: 'text', text: "❌ ไม่พบประวัติของคุณในระบบ กรุณากดปุ่มลงทะเบียนใน Rich Menu ก่อนครับ" }] });
                    continue;
                }
                const role = sender.get('Role') ? sender.get('Role').trim() : '';
                if (role !== 'ผู้นำสาย' && role !== 'หัวหน้า') {
                    await client.replyMessage({ replyToken, messages: [{ type: 'text', text: `❌ ขออภัยครับ สิทธิ์ของคุณคือ '${role}' ไม่ใช่ 'ผู้นำสาย' จึงประกาศไม่ได้ครับ` }] });
                    continue;
                }
                const myLine = sender.get('Assigned_Line');
                const myDate = sender.get('Camp_Date');
                const targets = rows.filter(r => r.get('Assigned_Line') === myLine && r.get('Camp_Date') === myDate && r.get('LINE_UID'));

                const flexAnnounce = {
                    type: "flex", altText: `📢 ประกาศจากผู้นำสาย: ${myLine}`,
                    contents: {
                        type: "bubble",
                        header: { type: "box", layout: "vertical", backgroundColor: "#00246B", contents: [{ type: "text", text: `📢 ประกาศสำคัญประจำ ${myLine}`, color: "#F8B500", weight: "bold", size: "sm" }] },
                        body: { type: "box", layout: "vertical", contents: [{ type: "text", text: announcement, wrap: true, color: "#334155", size: "md" }, { type: "separator", margin: "lg" }, { type: "text", text: `จาก: หมอ${sender.get('Nickname')} (ผู้นำสาย)`, size: "xs", color: "#94a3b8", margin: "md" }] }
                    }
                };

                let successCount = 0;
                for (let t of targets) {
                    try { await client.pushMessage({ to: t.get('LINE_UID'), messages: [flexAnnounce] }); successCount++; } catch (err) { console.error(err); }
                }
                await client.replyMessage({ replyToken, messages: [{ type: 'text', text: `✅ บอทได้ส่งประกาศถึงสมาชิกใน ${myLine} จำนวน ${successCount} คน เรียบร้อยแล้วครับ!` }] });
                continue;
            }

            // 🏁 2. ระบบเคลียร์งานปิดฟาร์มประจำวัน (#เลิกสาย)
            // หาคำสั่งปิดสาย เลิกสาย ในระบบวนลูป Webhook ของพี่ แล้ววางตัวนี้ทับเลยครับ
if (text.match(/^#\s*เลิกสาย/)) {
    console.log("👉 เข้าสู่กระบวนการ #เลิกสาย...");
    const praiseText = text.replace(/^#\s*เลิกสาย\s*/, '').trim();
    const sender = rows.find(r => r.get('LINE_UID') === userId);
    if (!sender) continue;

    const role = sender.get('Role') ? sender.get('Role').trim() : '';
    if (role !== 'ผู้นำสาย' && role !== 'หัวหน้า') {
        await client.replyMessage({ replyToken, messages: [{ type: 'text', text: "❌ เฉพาะผู้นำสายเท่านั้นที่ทำรายการเลิกสายได้ครับ" }] });
        continue;
    }

    const myLine = sender.get('Assigned_Line');
    const myDate = sender.get('Camp_Date');

    // 🎨 แปลงร่างข้อความประกาศเลิกสายให้กลายเป็น Flex Message พรีเมียมสะใจ (ตามข้อ 8)
    const flexFinish = {
        type: "flex", altText: `🎉 ${myLine} ปฏิบัติภารกิจเสร็จสิ้นเรียบร้อยแล้ว!`,
        contents: {
            type: "bubble",
            header: { type: "box", layout: "vertical", backgroundColor: "#10B981", contents: [{ type: "text", text: "🎉 MISSION COMPLETED", color: "#ffffff", weight: "bold", size: "xs" }, { type: "text", text: `${myLine} เลิกสายเรียบร้อย`, color: "#ffffff", weight: "bold", size: "lg", margin: "xs" }] },
            body: {
                type: "box", layout: "vertical",
                contents: [
                    { type: "text", text: `📅 ประจำวันที่: ${myDate}`, size: "xs", color: "#64748b" },
                    { type: "text", text: `💬 ข้อความจากผู้นำสาย (หมอ${sender.get('Nickname')}):`, weight: "bold", size: "sm", color: "#00246B", margin: "md" },
                    { type: "text", text: praiseText || "ขอบคุณคุณหมอทุกคนในสายที่ร่วมแรงร่วมใจเหนื่อยปฏิบัติภารกิจค่ายในวันนี้ด้วยกันครับ พักผ่อนให้เต็มที่ครับ!", wrap: true, size: "sm", color: "#334155", style: "italic", margin: "xs" }
                ]
            }
        }
    };

    // ปรับสถานะใน Google ชีท
    const mSheet = doc.sheetsByTitle['Missions_Data'];
    if (mSheet) {
        const mRows = await mSheet.getRows();
        const missionRow = mRows.find(r => r.get('Camp_Date') === myDate && r.get('Assigned_Line') === myLine);
        if (missionRow) { missionRow.assign({ 'Line_Status': 'เลิกสายเรียบร้อย' }); await missionRow.save(); }
    }

    // ยิงเข้าแชทส่วนตัวสมาชิกทุกคนในสาย
    const targets = rows.filter(r => r.get('Assigned_Line') === myLine && r.get('Camp_Date') === myDate && r.get('LINE_UID'));
    for (let t of targets) {
        try { await client.pushMessage({ to: t.get('LINE_UID'), messages: [flexFinish] }); } catch(err) {}
    }

    // 🌟 ยิงประกาศจบงานเด้งเข้าแชทกลุ่มไลน์กลางด้วยทันที
    const groupId = process.env.LINE_GROUP_ID;
    if (groupId) { try { await client.pushMessage({ to: groupId, messages: [flexFinish] }); } catch(e) {} }

    await client.replyMessage({ replyToken, messages: [{ type: 'text', text: `✅ บอบส่งการแจ้งเตือนเลิกสายพรีเมียมให้สมาชิก ${myLine} เรียบร้อยแล้วครับ!` }] });
    continue;
}

            // 📤📥 3. 🎯 ระบบดักรับข้อความพิมพ์ #เบิกของรวม และ #คืนของรวม (อัปเดตเพิ่มระบบตัดสต๊อก Real-time)
            if (text.startsWith('#เบิกของรวม') || text.startsWith('#คืนของรวม')) {
                console.log("📦 ตรวจพบรายการเบิก/คืน แบบข้อความตัวอักษร! กำลังประมวลผล...");
                const isTake = text.startsWith('#เบิกของรวม');
                const actionName = isTake ? 'เบิกของ' : 'คืนของ';

                const lines = text.split('\n');
                let targetDate = ""; let targetLine = ""; let itemsRaw = "";

                lines.forEach(l => {
                    if (l.startsWith('Date=')) targetDate = l.replace('Date=', '').trim();
                    if (l.startsWith('Line=')) targetLine = l.replace('Line=', '').trim();
                    if (l.startsWith('Items=')) itemsRaw = l.replace('Items=', '').trim();
                });

                if (!targetDate || !targetLine || !itemsRaw) {
                    console.log("❌ ข้อมูลโครงสร้างข้อความไม่ครบถ้วน");
                    continue;
                }

                const sender = rows.find(r => r.get('LINE_UID') === userId);
                const senderName = sender ? `${sender.get('Nickname')} ${sender.get('Year')}` : "ผู้ปฏิบัติงาน";

                // แตกข้อมูลสิ่งของออกเป็นอาร์เรย์
                const itemParts = itemsRaw.split(',');
                let itemsList = [];
                itemParts.forEach(part => {
                    const detail = part.split('|');
                    if (detail.length >= 2) {
                        itemsList.push({ name: detail[0], qty: parseInt(detail[1]) || 0, unit: detail[2] || 'ชิ้น' });
                    }
                });

                if (itemsList.length === 0) continue;

                // 1. แยกบันทึกลงตามชีท Log โครงสร้างของพี่ 
                if (isTake) {
                    const sheet = doc.sheetsByTitle['Log_Takeout'];
                    if (!sheet) { console.error("ไม่พบชีท Log_Takeout"); continue; }
                    for (let item of itemsList) {
                        await sheet.addRow({
                            'Timestamp': new Date().toLocaleString('th-TH'), 'Staff': senderName, 'Item_Name': item.name, 'Amount_Taken': item.qty, 'LINE_ID': userId, 'Status': 'ยังไม่คืน', 'Camp_Date': targetDate, 'Camp_Line': targetLine
                        });
                    }
                } else {
                    const sheet = doc.sheetsByTitle['Log_Return'];
                    if (!sheet) { console.error("ไม่พบชีท Log_Return"); continue; }
                    for (let item of itemsList) {
                        await sheet.addRow({
                            'Timestamp': new Date().toLocaleString('th-TH'), 'LINE_ID': userId, 'Item_Name': item.name, 'Amount_Returned': item.qty, 'Amount_Used': 0, 'Unit': item.unit, 'Camp_Date': targetDate, 'Camp_Line': targetLine
                        });
                    }
                }

                // 🌟 2. เพิ่มเติม: อัปเดตตัดจำนวนสต๊อกในหน้า Inventory ทันที (สำหรับโหมดข้อความพิมพ์ซ้ำ)
                const invSheet = doc.sheetsByTitle['Inventory'];
                if (invSheet) {
                    const invRows = await invSheet.getRows();
                    for (let item of itemsList) {
                        const targetRow = invRows.find(r => r.get('รายการ') === item.name);
                        if (targetRow) {
                            let currentStock = parseInt(targetRow.get('จำนวน')) || 0;
                            let actionQty = parseInt(item.qty) || 0;

                            if (isTake) {
                                currentStock -= actionQty; // เบิก = หักออก
                                if (currentStock < 0) currentStock = 0;
                            } else {
                                currentStock += actionQty; // คืน = บวกเข้าคลัง
                            }

                            targetRow.set('จำนวน', currentStock);
                            await targetRow.save();
                        }
                    }
                }

                // 3. วาดโครงสร้าง Flex Message สรุปผล
                const colorMain = isTake ? '#00246B' : '#dc2626';
                const icon = isTake ? '📤' : '📥';
                let itemListHtml = itemsList.map(i => ({
                    type: "box", layout: "horizontal", margin: "md",
                    contents: [
                        { type: "text", text: i.name, size: "sm", color: "#334155", flex: 3, wrap: true },
                        { type: "text", text: `${i.qty} ${i.unit}`, size: "sm", color: colorMain, weight: "bold", align: "end", flex: 1 }
                    ]
                }));

                const flexMsg = {
                    type: "flex", altText: `แจ้งเตือนทำรายการ${actionName}`,
                    contents: {
                        type: "bubble",
                        header: { type: "box", layout: "vertical", backgroundColor: colorMain, contents: [{ type: "text", text: `${icon} รายการ${actionName}`, color: "#ffffff", weight: "bold", size: "lg" }, { type: "text", text: `ประจำ ${targetLine} (${targetDate})`, color: "#e2e8f0", size: "xs", margin: "sm" }] },
                        body: { type: "box", layout: "vertical", contents: [{ type: "text", text: `👤 ผู้ทำรายการ: หมอ${senderName}`, size: "xs", color: "#94a3b8", margin: "sm" }, { type: "separator", margin: "md" }, ...itemListHtml] }
                    }
                };

                await client.replyMessage({ replyToken, messages: [flexMsg] });
                console.log(`✅ บันทึกรายการ${actionName} และอัปเดตตัดคลัง Inventory เรียบร้อย!`);
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
// ==========================================
// 📝 อัปเดต API ระบบลงทะเบียน (แก้บัค Flex Message ไม่เด้ง)
// ==========================================
app.post('/api/register-user', express.json(), async (req, res) => {
    try {
        const { lineId, studentId, dateStr } = req.body;
        if (!lineId || !studentId || !dateStr) return res.status(400).json({ success: false, message: "ข้อมูลส่งมาไม่ครบถ้วน" });

        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Master_Data'];
        if (!sheet) return res.status(500).json({ success: false, message: "ไม่พบแท็บ Master_Data" });

        const rows = await sheet.getRows();
        let foundUser = rows.find(r => r.get('Student_ID') === studentId && r.get('Camp_Date').includes(dateStr));

        if (!foundUser) return res.json({ success: false, message: `❌ ไม่พบประวัติการออกสายในวันที่ ${dateStr}` });
        if (foundUser.get('Reg_Status') !== 'เปิด') return res.json({ success: false, message: `⏳ ระบบลงทะเบียนของวันที่ ${dateStr} ยังไม่เปิดใช้งาน` });

        foundUser.assign({ 'LINE_UID': lineId });
        await foundUser.save();

        const myLineName = foundUser.get('Assigned_Line');
        const myCampDate = foundUser.get('Camp_Date');
        
        // 👥 จัดกลุ่มรายชื่อสมาชิกในสาย
        let leaderContents = [];
        let memberContents = [];
        rows.forEach(row => {
            if (row.get('Assigned_Line') === myLineName && row.get('Camp_Date') === myCampDate) {
                const isRegistered = !!row.get('LINE_UID');
                const isLeader = (row.get('Role') === 'ผู้นำสาย' || row.get('Role') === 'หัวหน้า');
                const nameStr = `หมอ${row.get('Nickname')} ปี ${row.get('Year')}`;
                
                // ปรับไอคอนให้ดูซอฟต์ลง สำหรับคนที่ยังไม่ลงทะเบียน
                const statusIcon = isRegistered ? "✅" : "⏳"; 
                const textColor = isRegistered ? "#16a34a" : "#94a3b8";

                const itemObj = { type: "text", text: `${statusIcon} ${isLeader ? '👑' : '👤'} ${nameStr}`, size: "sm", color: textColor, weight: isRegistered ? "regular" : "bold", wrap: true, margin: "sm" };
                if (isLeader) leaderContents.push(itemObj); else memberContents.push(itemObj);
            }
        });

        // 🎨 Flex Message 1: สรุปสมาชิกสาย
        const flexTeam = {
            type: "flex", altText: `รายชื่อทีม ${myLineName}`,
            contents: {
                type: "bubble",
                header: { type: "box", layout: "vertical", backgroundColor: "#00246B", contents: [{ type: "text", text: "🤝 MU VET CAMP TEAM", color: "#F8B500", weight: "bold", size: "xs" }, { type: "text", text: `${myLineName}`, color: "#FFFFFF", weight: "bold", size: "xl", margin: "sm" }] },
                body: { type: "box", layout: "vertical", contents: [{ type: "text", text: "ผู้นำสายปฏิบัติการ", weight: "bold", size: "xs", color: "#94a3b8" }, ...leaderContents, { type: "separator", margin: "md" }, { type: "text", text: "สมาชิกผู้ปฏิบัติงาน", weight: "bold", size: "xs", color: "#94a3b8", margin: "md" }, ...memberContents] }
            }
        };

        // 🎯 ดึงภารกิจประจำวันมาสร้าง Flex Message 2
        const mSheet = doc.sheetsByTitle['Missions_Data'];
        const mRows = mSheet ? await mSheet.getRows() : [];
        const mData = mRows.find(r => r.get('Camp_Date') === myCampDate && r.get('Assigned_Line') === myLineName);
        
        let missionBoxes = [];
        if (mData) {
            for (let i = 1; i <= 4; i++) {
                const loc = mData.get(`Location_${i}`);
                if (loc && loc.trim() !== "") {
                    // 🚨 จุดที่แก้บัค: เปลี่ยนเป็นคำสั่งที่ LINE รู้จัก (paddingAll และ cornerRadius)
                    missionBoxes.push({
                        type: "box", layout: "vertical", margin: "md", paddingAll: "8px", backgroundColor: "#f8fafc", cornerRadius: "8px",
                        contents: [
                            { type: "text", text: `📍 จุดที่ ${i}: ${loc}`, weight: "bold", size: "sm", color: "#00246B" },
                            { type: "text", text: `🐾 สัตว์: ${mData.get(`Animal_Count_${i}`) || '-'} ตัว | 📝 งาน: ${mData.get(`Task_Details_${i}`) || '-'}`, size: "xs", color: "#475569", margin: "xs", wrap: true }
                        ]
                    });
                }
            }
        }
        if (missionBoxes.length === 0) {
            missionBoxes.push({ type: "text", text: "⏳ รอรับมอบหมายภารกิจหลักจากส่วนกลาง", size: "sm", color: "#94a3b8", style: "italic" });
        }

        // 🎨 Flex Message 2: รายละเอียดภารกิจประจำวัน 
        const flexMission = {
            type: "flex", altText: `📋 แผนภารกิจประจำวัน ${myLineName}`,
            contents: {
                type: "bubble",
                header: { type: "box", layout: "vertical", backgroundColor: "#F8B500", contents: [{ type: "text", text: "📋 DAILY MISSION", color: "#00246B", weight: "bold", size: "xs" }, { type: "text", text: `แผนงาน ${myCampDate}`, color: "#00246B", weight: "bold", size: "md", margin: "xs" }] },
                body: { type: "box", layout: "vertical", contents: [{ type: "text", text: "สถานที่ปฏิบัติภารกิจ:", weight: "bold", size: "sm", color: "#00246B" }, ...missionBoxes] },
                footer: { type: "box", layout: "vertical", contents: [{ type: "button", style: "primary", color: "#00246B", action: { type: "uri", label: "🎯 เข้าสู่หน้าหลักระบบค่าย", uri: "https://liff.line.me/2010125977-E8l1g7Zp" } }] }
            }
        };

        // ยิงต่อเนื่อง 2 ข้อความเข้าแชท LINE OA
        try {
            await client.pushMessage({ to: lineId, messages: [flexTeam, flexMission] });
            console.log("✅ ยิง Flex ลงทะเบียนสำเร็จ");
        } catch (err) { 
            console.error("🚨 Push Registration Flex Fail:", err); 
        }

        res.json({
            success: true,
            profile: { nickname: foundUser.get('Nickname'), year: foundUser.get('Year'), campDate: myCampDate, assignedLine: myLineName, role: foundUser.get('Role') }
        });
    } catch (error) { res.status(500).json({ success: false, message: "Server Error" }); }
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
// ==========================================
// 🎯 ระบบ API สำหรับหน้าทีมและเช็คลิสต์ภารกิจ
// ==========================================

// 1. ดึงข้อมูลภารกิจของทุกสายในวันนั้น
// 1. ดึงข้อมูลภารกิจของทุกสายในวันนั้น (อัปเดตดึงรูปภาพและรายชื่อทีม)
app.get('/api/all-missions', async (req, res) => {
    try {
        const CAMP_LINES = ["สาย 1", "สาย 2", "สาย 3", "สาย 4"];
        const targetDate = req.query.date;
        const doc = await getSheetDoc();
        
        const mSheet = doc.sheetsByTitle['Missions_Data'];
        const cSheet = doc.sheetsByTitle['Checklist_Status'];
        const masterSheet = doc.sheetsByTitle['Master_Data'];
        
        const mRows = mSheet ? await mSheet.getRows() : [];
        const cRows = cSheet ? await cSheet.getRows() : [];
        const masterRows = masterSheet ? await masterSheet.getRows() : [];

        const result = CAMP_LINES.map(line => {
            const mData = mRows.find(r => r.get('Camp_Date') === targetDate && r.get('Assigned_Line') === line);
            const doneCount = cRows.filter(r => r.get('Camp_Date') === targetDate && r.get('Assigned_Line') === line && r.get('Status') === 'Checked').length;
            const progress = Math.round((doneCount / 10) * 100);

            // ค้นหาสมาชิก
            const teamUsers = masterRows.filter(r => r.get('Camp_Date') === targetDate && r.get('Assigned_Line') === line);
            let leader = null; let members = [];
            teamUsers.forEach(u => {
                const role = u.get('Role') ? u.get('Role').trim() : '';
                const userData = { name: u.get('Nickname'), year: u.get('Year') };
                if (role === 'ผู้นำสาย' || role === 'หัวหน้า') leader = userData; else members.push(userData);
            });

            // 🌟 ลูปดึงโครงสร้าง 4 สถานที่ปฏิบัติงาน
            let locationsList = [];
            if (mData) {
                for (let i = 1; i <= 4; i++) {
                    const locName = mData.get(`Location_${i}`);
                    if (locName && locName.trim() !== "") {
                        locationsList.push({
                            place: locName,
                            count: mData.get(`Animal_Count_${i}`) || "-",
                            detail: mData.get(`Task_Details_${i}`) || "-",
                            phone: mData.get(`Owner_Phone_${i}`) || "-",
                            mapUrl: mData.get(`Maps_${i}`) || ""
                        });
                    }
                }
            }

            return {
                line: line,
                locations: locationsList, // ส่งแบบอาเรย์ขนาดยืดหยุ่นไปให้หน้าเว็บวาดต่อ
                image: mData ? mData.get('Image_URL') : "",
                progress: progress || 0,
                leader: leader,
                members: members,
                lineStatus: mData ? (mData.get('Line_Status') || "") : ""
            };
        });

        res.json({ success: true, missions: result });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 2. ดึงข้อมูลว่าสายนี้ติ๊กเช็คลิสต์ข้อไหนไปแล้วบ้าง
app.get('/api/checked-tasks', async (req, res) => {
    try {
        const { date, line } = req.query;
        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Checklist_Status'];
        if (!sheet) return res.json({ success: true, checkedTasks: [] });

        const rows = await sheet.getRows();
        const checkedTasks = rows.filter(r => r.get('Camp_Date') === date && r.get('Assigned_Line') === line && r.get('Status') === 'Checked').map(r => r.get('Task_Name'));
        res.json({ success: true, checkedTasks });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 3. อัปเดตสถานะเช็คลิสต์ (ตอนเด็กกดติ๊กในเว็บ)
app.post('/api/update-checklist', express.json(), async (req, res) => {
    try {
        const { date, line, phase, task, status } = req.body;
        const doc = await getSheetDoc();
        const sheet = doc.sheetsByTitle['Checklist_Status'];
        if (!sheet) return res.status(500).json({ success: false });

        const rows = await sheet.getRows();
        const row = rows.find(r => r.get('Camp_Date') === date && r.get('Assigned_Line') === line && r.get('Task_Name') === task);

        if (row) {
            row.assign({ 'Status': status });
            await row.save();
        } else {
            await sheet.addRow({ 'Camp_Date': date, 'Assigned_Line': line, 'Phase': phase, 'Task_Name': task, 'Status': status });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});
app.listen(port, () => { 
    console.log(`🚀 บอท MU VET PORTAL รันระบบสมบูรณ์แบบไร้ที่ติ 100% บน Port ${port}`); 
});