# Bplus SP Suite

แถบเครื่องมือเดียวสำหรับทีม Support Bplus บน **cloudbplusai.bplus.co.th**
รวมสคริปต์ Tampermonkey 9 ตัวเดิม: สรุป SLA · Overdue · คืน BOT · QA Repair · เตือนคืน Bot ของฉัน · ตัวช่วยหน้าคิว 5 ตัว
ตั้งค่าตามแผนก ERP / HRM / SE ได้ และเลือกธีมสว่าง/มืดได้

## ติดตั้ง (ผู้ใช้ทั่วไป)
เปิดเว็บคู่มือของ repo นี้ (GitHub Pages) แล้วทำตาม 5 ขั้น — มีปุ่มติดตั้งในหน้าเว็บ

ติดตั้งเองแบบเร็ว: ติดตั้ง Tampermonkey › เปิด **Allow User Scripts** ในหน้าจัดการส่วนขยาย › เปิดไฟล์ [`docs/Bplus_SP_Suite.user.js`](docs/Bplus_SP_Suite.user.js) แบบ Raw › กด Install

## ตั้งค่า repo ครั้งแรก (ผู้ดูแล)
1. Push ทั้งโฟลเดอร์นี้ขึ้น repo (Public)
2. Settings › Pages › Source: **Deploy from a branch** › `main` / **`/docs`** › Save
3. ได้ลิงก์ `https://<ชื่อผู้ใช้>.github.io/<ชื่อ repo>/` แล้วใส่ลิงก์นี้ใน `PAGES_URL` ที่ `build.py`
4. รัน `build.bat` อีกครั้ง แล้ว push — ต่อจากนี้ Tampermonkey ของทุกคนจะเช็คอัปเดตจากลิงก์นี้เอง

## ออกเวอร์ชันใหม่
1. แก้โค้ดใน `src/`
2. เพิ่มเลข `VERSION` ใน `build.py` (ต้องมากกว่าเดิม ไม่อย่างนั้น Tampermonkey จะไม่อัปเดต)
3. ดับเบิลคลิก `build.bat` (ได้ทั้ง `dist/` และ `docs/` ใหม่)
4. Commit + push

---

## โครงสร้าง
```
src/
  header.txt              Tampermonkey metadata (@run-at document-start)
  core/01_core.js         SP object, ค่าแผนก (DEPTS), settings, fetch hub (ดัก token + rewriter), /auth/me
  core/02_theme.js        ธีม: CSS variables --sp-*, คลาส .sp-*, preset สี, dark/light
  core/03_ui.js           Dock, Drawer (คลี่ลงจากแถบ), หน้ารวม, หน้าตั้งค่า, toast/notice
  core/99_boot.js         สร้าง UI เมื่อ DOM พร้อม
  modules/mod_sla.js      SLA Hub v5.3  (poster PNG ขาวเหมือนเดิม)
  modules/mod_overdue.js  Overdue v3.0
  modules/mod_bot_return.js  Smart Bot Return v2.0
  modules/qa_templates.js    ไฟล์ตัวอย่าง .md + SKILL.md (ต้องตรงกับ parseMDContent)
  modules/mod_qa_repair.js   QA Repair v2.4
  modules/mod_my_handoff.js  คิวที่ฉันรับช่วงค้าง + เตือนคืน Bot ก่อนเลิกงาน
  modules/tweaks.js       ตัวช่วย 1–5 (ชื่อไลน์/ค้นหาคิว, ปุ่มแก้โปรไฟล์, กันแชทเด้ง, เรียงคิว, เติมโปรไฟล์)
build.py / build.bat      รวม src → dist และอัปเดต docs/ (แก้ VERSION / PAGES_URL ใน build.py)
docs/                     เว็บคู่มือ (GitHub Pages) + ไฟล์สคริปต์สำหรับกดติดตั้ง
test/mock_test.py         ทดสอบบนหน้าจำลองด้วย Playwright
```

## กติกาสำหรับแก้ต่อ (ส่งให้ AI ตัวอื่นได้เลย)
- **แก้ใน `src/` เท่านั้น** แล้วรัน `python build.py` — ห้ามแก้ `dist/` ตรง ๆ
- เรียก API ของเครื่องมือผ่าน `SP.rawFetch` + `SP.getToken()` เสมอ (กันไม่ให้ตัวดักของ tweak ไปแก้ productId/limit ของเครื่องมือเอง)
- ใช้คลาส `.sp-*` และตัวแปร `--sp-*` ห้ามใส่สีตายตัว ยกเว้น poster PNG ของ SLA (ต้องเป็นสีขาว)
- เครื่องมือใหม่: `SP.registerTool({ id, tc, feature, paneId, label, desc, width, mount(pane), onOpen(), canLeave() })`
  ต้องเพิ่ม key ใน `features` (01_core.js) และไฟล์ใน `ORDER` (build.py)
- ตัวช่วยใหม่: `SP.registerTweak({ id, label, desc })` + เช็ค `SP.feature(id)` และ `SP.onPath(...)` ตอนทำงานทุกครั้ง
- ค่าที่ต่างกันตามแผนกอยู่ที่ `SP.DEPTS[...].values` อ่านด้วย `SP.deptValue(key)`
- Badge บนแถบ: `SP.setBadge(id, count, alert)` · ตัวเลขหน้ารวม: `SP.setHomeStat(key, value)`
- ปุ่ม/ป้ายที่ฉีดเข้าเว็บใช้ `.sp-inject-btn` / `.sp-inject-chip` (มีตรา SP)

## ค่าเริ่มต้นตามแผนก
| key | ERP | HRM | SE |
|---|---|---|---|
| สินค้าใน SLA (`slaProduct`) | Bplus ERP | Bplus HRM | Bplus POS |
| แท็บ Overdue (`overdueDept`) | ERP | HRM | SE |
| Product คืน BOT (`botProductMatch`) | ERP | HRM | POS |
| ล็อกคิว productId / ชื่อ | 1 / Bplus ERP | 3 / Bplus HRM | 2 / Bplus POS |
| เติมโปรไฟล์ ตำแหน่ง/บทบาท | บัญชี | ฝ่ายบุคคล | เจ้าของร้าน |
| สีธีม | Neon Lime | Hot Rose | Ice Cyan |

ทุกค่าแก้ได้ในหน้า ตั้งค่า › ข้อ 5 (เก็บแยกต่อแผนก กด "คืนค่าแผนก" เพื่อกลับค่าตั้งต้น)

## สิ่งที่เปลี่ยนจากสคริปต์เดิม
- ไม่มีปุ่มลอยกระจัดกระจายแล้ว ทุกเครื่องมือเปิดจาก dock เป็น Drawer ใต้แถบ / Esc หรือ ✕ เพื่อพับ
- Overdue, คืน BOT, SLA ใช้ได้ **ทุกหน้า** (ไม่ต้องอยู่ /action-items หรือ /handoff-queue)
- QA Repair ใช้ผู้ใช้ที่ล็อกอินจริงจาก /auth/me (เดิม hard-code id 36 ไว้ ถ้า /auth/me พลาดจะไปดึงงานของคุณหนึ่ง)
- ตัวดักคิวของตัวช่วย 1/4 แก้เฉพาะ request ของหน้าเว็บ ไม่ไปทับ productId ที่ "คืน BOT" เลือกไว้ (เดิมทับเป็น 1 เสมอ)
- ลิงก์ในข้อความ LINE ของ Overdue ชี้ `/action-items?overdue=true` เสมอ ไม่ว่าเปิดจากหน้าไหน
- ตัวช่วยทุกตัวปิด/เปิดได้ทันทีในหน้าตั้งค่า โดยไม่ต้องรีเฟรช

## ข้อควรรู้ของเว็บ cloudbplusai (สำคัญสำหรับคนแก้ต่อ)
- React render ลง `<body>` ตรง ๆ และล้าง body ตอน mount → UI ของ Suite ต้องอยู่ใน `#sp-suite-host` ที่แขวนกับ `<html>` (`SP.host()`)
- เว็บล้าง style/attribute ของ `<html>` → ห้ามตั้ง CSS variable ที่ `document.documentElement.style` ให้ใช้ `SP.ensureStyle(id, css)`
- คิว handoff ของใครดูจาก `assigned_agent_id` (เทียบกับ `/api/auth/me` → `data.id`)
