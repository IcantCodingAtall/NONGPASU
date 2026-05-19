// ============================================================================
// 📦 MODULE 1: INITIALIZATION & ENVIRONMENT CONFIGURATION
// ============================================================================
// โหลดค่าคอนฟิกูเรชันความปลอดภัยจากไฟล์ .env และแพ็คเกจเสริมที่จำเป็นในการรันบอท
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// โหลดแพ็กเกจอื่นๆ ของพี่ (ถ้ามี)
// const { Client, middleware } = require('@line/bot-sdk');
// const { GoogleSpreadsheet } = require('google-spreadsheet');

// 🌟 ต้องประกาศตัวแปร app ก่อนที่จะเรียกใช้งานมัน!
const app = express(); 

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
const clientConfig = { 
    channelAccessToken: process.env.LINE_ACCESS_TOKEN 
};
const client = new line.messagingApi.MessagingApiClient(clientConfig);

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
                'Authorization': `Bearer ${process.env.LINE_ACCESS_TOKEN}`,
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
        
        let stats = {
            animals: { 'วัว': 0, 'ควาย': 0, 'แพะ': 0, 'แกะ': 0 },
            procedures: { 'Blood': 0, 'Feces': 0, 'FMD': 0, 'LSD': 0, 'Ivermectin': 0, 'Albendazole': 0, 'Vitamin': 0 },
            abnormalLabs: [] 
        };

        // สกัดและรวบรวมข้อมูลตัวเลขจากแท็บหัตถการ
        if (procSheet) {
            const rows = await procSheet.getRows();
            rows.forEach(r => {
                stats.animals['วัว'] += parseInt(r.get('Cow') || 0);
                stats.animals['ควาย'] += parseInt(r.get('Buffalo') || 0);
                stats.animals['แพะ'] += parseInt(r.get('Goat') || 0);
                stats.animals['แกะ'] += parseInt(r.get('Sheep') || 0);
                
                stats.procedures['Blood'] += parseInt(r.get('Blood') || 0); 
                stats.procedures['Feces'] += parseInt(r.get('Feces') || 0);
                stats.procedures['FMD'] += parseInt(r.get('FMD') || 0);
                stats.procedures['LSD'] += parseInt(r.get('LSD') || 0);
                stats.procedures['Ivermectin'] += parseInt(r.get('Ivermectin') || 0);
                stats.procedures['Albendazole'] += parseInt(r.get('Albendazole') || 0);
                stats.procedures['Vitamin'] += parseInt(r.get('Vitamin') || 0);
            });
        }

        // สกัดข้อมูลเฉพาะสัตว์ป่วยที่มีผลแล็บติดสัญลักษณ์สีแดง 🔴 เพื่อนำมาทำตารางสรุปหน้าแรก
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
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: "Dashboard Load Failed" });
    }
});

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
        await procSheet.addRow({
            Timestamp: new Date().toLocaleString('th-TH'), LINE_ID: d.lineId, Staff: d.staffName,
            Date: d.date, Line: d.line, Owner_Name: d.ownerName, Owner_Phone: d.ownerPhone, Owner_Address: d.ownerAddress,
            Cow: d.cows || 0, Buffalo: d.buffs || 0, Goat: d.goats || 0, Sheep: d.sheeps || 0,
            Blood: d.blood || 0, Feces: d.feces || 0, FMD: d.fmd || 0, LSD: d.lsd || 0,
            Ivermectin: d.iver || 0, Albendazole: d.alben || 0, Vitamin: d.vitamin || 0, Others: d.others || '-'
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
        const takeoutSheet = doc.sheetsByIndex[1]; // แท็บประวัติเบิก
        const rows = await takeoutSheet.getRows();
        
        // คัดกรองเอาเฉพาะรายการที่ค้างคืนของคนๆ นั้น
        const activeTakes = rows.filter(r => r.get('LINE_ID') === userId && (r.get('Status') === 'ยังไม่คืน' || r.get('Status') === 'Pending' || !r.get('Status')));
        
        let defaultDate = ""; 
        let defaultLine = ""; 
        const summary = {}; 
        
        activeTakes.forEach((row, index) => { 
            // ดึงวันที่และสายปฏิบัติการ จากรายการแรกที่ค้างอยู่ ส่งกลับไปให้หน้าแอป
            if (index === 0) {
                defaultDate = row.get('Camp_Date') || "";
                defaultLine = row.get('Camp_Line') || "";
            }
            
            const name = row.get('Item_Name') || row.get('รายการ'); 
            const qty = parseInt(row.get('Amount_Taken') || row.get('จำนวน')) || 0; 
            if (name) summary[name] = (summary[name] || 0) + qty; 
        });
        
        // ดึงข้อมูลหน่วย (Unit) และ รูปภาพ (Image_URL) จากคลังหลักมาประกบ
        const invSheet = doc.sheetsByIndex[0]; 
        const invRows = await invSheet.getRows(); 
        const itemMap = {}; 
        
        invRows.forEach(r => { 
            const name = r.get('Item_Name') || r.get('รายการ'); 
            const unit = r.get('Unit') || r.get('ลักษณนาม') || 'ชิ้น'; 
            const image = r.get('Image_URL') || r.get('รูปภาพ') || '';
            if (name) itemMap[name] = { unit, image }; 
        });
        
        const resultItems = Object.keys(summary).map(name => ({ 
            name: name, 
            stock: summary[name], 
            unit: itemMap[name] ? itemMap[name].unit : 'ชิ้น',
            image: itemMap[name] ? itemMap[name].image : '' // ส่งรูปลิงก์ Drive ไปโชว์หน้าคืนของ
        }));
        
        // ส่งกลับไปให้ครบทั้ง รายการ, วันที่, สาย
        res.json({ items: resultItems, campDate: defaultDate, campLine: defaultLine });
        
    } catch (error) { 
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
app.listen(port, () => { 
    console.log(`🚀 บอท MU VET PORTAL รันระบบสมบูรณ์แบบไร้ที่ติ 100% บน Port ${port}`); 
});