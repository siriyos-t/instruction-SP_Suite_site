  // =====================================================================
  //  MODULE: QA Repair Tool (v2.4 → SP Suite)
  //  ซ่อมฟอร์มบทความจาก .md + แจ้งเตือน Action Items ส่วนตัว + สรุปงานปิดวันนี้ (Excel)
  //  ผู้ใช้ดึงจาก /api/auth/me ของคนที่ล็อกอินจริง (ไม่มีค่า hard-code แล้ว)
  // =====================================================================
  (function () {
    'use strict';
    const currentUser = SP.user;   // object เดียวกับ core (อัปเดตเองเมื่อ /auth/me ตอบกลับ)
    function getAuthToken() { return SP.getToken(); }
    async function fetchCurrentUserProfile() {
        await SP.fetchUser();
        updateUserLabelInUI();
    }
    function updateUserLabelInUI() {
        const labelEl = document.getElementById('repair-user-label');
        if (labelEl) labelEl.innerText = `งานค้าง (${currentUser.fullName || 'ผู้ใช้งาน'})`;
    }

    // ============================================
    // 🔔 2. NOTIFICATION & AUDIO ENGINE
    // ============================================
    function playChimeSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } catch(e) {}
    }

    function requestDesktopPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    function sendDesktopNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification(title, {
                body: body,
                icon: 'https://cloudbplusai.bplus.co.th/favicon.ico'
            });
            n.onclick = function() {
                window.focus();
                navigateToMyActionItems();
                n.close();
            };
        }
    }

    // Toast Alert บนหน้าจอ
    function showToastAlert(title, text) {
        SP.notice({ id: 'sp-qa-notice', tool: 'qa', title: title, html: text, actions: [{ label: 'เปิดและเลือกงานของฉันทันที', fn: navigateToMyActionItems }] });
    }

    // ============================================
    // 🎯 3. AUTO SELECT DROPDOWN (เลือกชื่อคนในดรอปดาวน์ให้อัตโนมัติ)
    // ============================================
    async function selectAssigneeFilter(targetName) {
        const nameToFind = targetName || currentUser.fullName || currentUser.username || '';
        if (!nameToFind) return false;

        // หาปุ่ม Trigger combobox ทั้งหมดในหน้า Action Items
        const triggers = Array.from(document.querySelectorAll('button[role="combobox"]')).filter(b => 
            !SP.isOurs(b) && b.offsetWidth > 0
        );

        if (triggers.length === 0) return false;

        // ถ้าปุ่มเลือกเป็นชื่อนี้อยู่แล้ว แปลว่าเลือกไว้เรียบร้อยแล้ว
        if (triggers.some(b => b.textContent.includes(nameToFind))) {
            return true;
        }

        // หา Trigger ช่อง "ผู้รับผิดชอบ"
        let assigneeTrigger = triggers.find(b => {
            const txt = b.textContent.trim();
            return txt.includes('ผู้รับผิดชอบ') || txt.includes('ทุกคน');
        });

        // ถ้าไม่เจอคำดังกล่าว ให้เลือก combobox ตัวที่ 5 (index 4) ตามโครงสร้างหน้า
        if (!assigneeTrigger && triggers.length >= 5) {
            assigneeTrigger = triggers[4];
        }

        if (!assigneeTrigger) return false;

        // 1. กดเปิดดรอปดาวน์
        assigneeTrigger.click();
        await delay(200);

        // 2. ค้นหา Option ที่ตรงกับชื่อ หรือ Username ของผู้ล็อกอิน
        const options = Array.from(document.querySelectorAll('div[role="option"], [role="option"]'));
        const matchedOption = options.find(opt => {
            const txt = opt.textContent.trim();
            return txt.includes(nameToFind) || 
                   (currentUser.username && txt.toLowerCase().includes(currentUser.username.toLowerCase())) ||
                   (nameToFind.split(' ')[0] && txt.includes(nameToFind.split(' ')[0]));
        });

        if (matchedOption) {
            matchedOption.click();
            await delay(150);
            return true;
        } else {
            // ปิดดรอปดาวน์ถ้าหาไม่พบ
            document.body.click();
        }
        return false;
    }

    // ฟังก์ชันพาไปหน้า Action Items พร้อมตั้ง Flag ให้เลือกดรอปดาวน์อัตโนมัติ
    async function navigateToMyActionItems() {
        if (window.location.pathname.includes('/action-items')) {
            const ok = await selectAssigneeFilter(currentUser.fullName);
            if (ok) {
                setStatus(`🎯 เลือกฟิลเตอร์ "${currentUser.fullName}" ให้แล้ว!`, '#059669');
            } else {
                setStatus('⚠️ กรุณารอสักครู่แล้วลองกดใหม่อีกครั้ง', '#ea580c');
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            sessionStorage.setItem('bplus_auto_select_assignee', '1');
            window.location.href = '/action-items';
        }
    }

    // ตัวตรวจสอบตอนเปิดหน้า /action-items เพื่อเลือกดรอปดาวน์ให้อัตโนมัติ
    async function checkAndApplyAutoSelect() {
        if (!window.location.pathname.includes('/action-items')) return;
        if (sessionStorage.getItem('bplus_auto_select_assignee') !== '1') return;

        // วนรอ React Mount Combobox สูงสุด 15 วินาที
        for (let attempt = 0; attempt < 30; attempt++) {
            const triggers = Array.from(document.querySelectorAll('button[role="combobox"]')).filter(b => 
                !SP.isOurs(b) && b.offsetWidth > 0
            );

            if (triggers.length >= 5) {
                await delay(200);
                const success = await selectAssigneeFilter(currentUser.fullName);
                if (success) {
                    sessionStorage.removeItem('bplus_auto_select_assignee');
                    addLog(`🎯 เลือกฟิลเตอร์ "${currentUser.fullName}" อัตโนมัติเรียบร้อย`);
                    return;
                }
            }
            await delay(500);
        }
        sessionStorage.removeItem('bplus_auto_select_assignee');
    }

    // ============================================
    // 📡 4. ACTION ITEMS CHECKER (เช็คงานค้างเฉพาะคนนั้น)
    // ============================================
    let lastKnownPendingCount = -1;

    async function checkMyActionItems(isManual = false) {
        const token = getAuthToken();
        if (!token) {
            if (isManual) alert('⚠️ ยังไม่พบ Token ระบบ กรุณาลองคลิกเมนูในระบบ Bplus สัก 1 ครั้ง แล้วกดตรวจสอบใหม่ครับ');
            return;
        }

        try {
            await fetchCurrentUserProfile();
            if (!currentUser.id) return;

            const res = await SP.rawFetch(`/api/action-items?assigned_to=${currentUser.id}&limit=20`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;

            const data = await res.json();
            const items = data?.data || [];
            
            // กรองเอางานที่ยังไม่เสร็จ (ไม่รวม Closed และ Resolved)
            const pendingItems = items.filter(it => it.status !== 'Closed' && it.status !== 'Resolved');
            const pendingCount = pendingItems.length;

            // อัปเดต Badge บนปุ่ม
            SP.setBadge('qa', pendingCount, pendingCount > 0);
            SP.setHomeStat('myPending', pendingCount);

            // อัปเดตข้อมูลในแผง Panel
            const infoEl = document.getElementById('repair-action-status-info');
            if (infoEl) {
                if (pendingCount > 0) {
                    infoEl.innerHTML = `มีงานค้างอยู่ <b class="sp-mono" style="color:var(--tc);font-size:14px;">${pendingCount} งาน</b> <span class="sp-faint">(ล่าสุด: ${SP.esc(pendingItems[0].action_code)})</span>`;
                } else {
                    infoEl.innerHTML = `<span style="color:var(--sp-ok)">ไม่มีงานค้างมอบหมาย (เคลียร์ครบแล้ว)</span>`;
                }
            }

            // ถ้ามีงานค้าง และเป็นงานใหม่ที่เพิ่งตรวจพบ
            if (pendingCount > 0 && pendingCount !== lastKnownPendingCount) {
                playChimeSound();
                const latestTitle = pendingItems[0]?.title || 'มีงาน Action Items ใหม่เข้ามา';
                sendDesktopNotification(
                    `🔔 Bplus AI: มีงานของ ${currentUser.fullName} ค้าง ${pendingCount} งาน`,
                    `[${pendingItems[0].action_code}] ${latestTitle.substring(0, 50)}...`
                );
                showToastAlert(
                    `มีงานมอบหมายใหม่ (${currentUser.fullName})!`,
                    `<b>${pendingItems[0].action_code}</b>: ${latestTitle.substring(0, 60)}...`
                );
            } else if (isManual && pendingCount === 0) {
                alert(`✅ ยอดเยี่ยมครับ! ปัจจุบันไม่มีงานค้างสำหรับ "${currentUser.fullName}"`);
            }

            lastKnownPendingCount = pendingCount;

            // ตรวจสอบและอัปเดตยอดปิดสรุปประจำวัน
            await updateTodayClosedUI();

        } catch(err) {
            console.error('[Action Checker Error]', err);
        }
    }

    // ============================================
    // 📊 4.1 DAILY CLOSED SUMMARY & EXCEL EXPORT (สรุปงานปิดประจำวัน)
    // ============================================
    function isSameLocalDate(isoStr) {
        if (!isoStr) return false;
        const d = new Date(isoStr);
        const now = new Date();
        return d.getFullYear() === now.getFullYear() &&
               d.getMonth() === now.getMonth() &&
               d.getDate() === now.getDate();
    }

    async function getTodayClosedItems() {
        const token = getAuthToken();
        if (!token) return [];

        try {
            await fetchCurrentUserProfile();
            if (!currentUser.id) return [];
            const res = await SP.rawFetch(`/api/action-items?status=Closed&assigned_to=${currentUser.id}&sort_by=updated_at:desc&limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return [];

            const json = await res.json();
            const items = json?.data || [];

            // กรองเฉพาะงานที่ปิดในวันนี้ตาม Local Time
            const closedToday = items.filter(it => isSameLocalDate(it.closed_at || it.updated_at));

            // เรียงลำดับจากเช้าไปเย็น (ลำดับที่ 1 คือปิดก่อน)
            closedToday.sort((a, b) => {
                const ta = new Date(a.closed_at || a.updated_at).getTime();
                const tb = new Date(b.closed_at || b.updated_at).getTime();
                return ta - tb;
            });

            return closedToday;
        } catch(e) {
            console.error('[Today Closed Error]', e);
            return [];
        }
    }

    async function updateTodayClosedUI() {
        const closedCountEl = document.getElementById('repair-closed-today-count');
        const closedInfoEl = document.getElementById('repair-closed-today-info');
        if (!closedCountEl && !closedInfoEl) return;

        const closedToday = await getTodayClosedItems();
        SP.setHomeStat('closedToday', closedToday.length);
        if (closedCountEl) {
            closedCountEl.innerText = `${closedToday.length} รายการ`;
        }
        if (closedInfoEl) {
            if (closedToday.length > 0) {
                closedInfoEl.innerHTML = `วันนี้ปิดไปแล้ว <b class="sp-mono" style="color:var(--sp-ok)">${closedToday.length} รายการ</b> (กดคัดลอกลง Excel ได้ทันที)`;
            } else {
                closedInfoEl.innerText = 'ยังไม่มีรายการที่กดปิดในวันนี้';
            }
        }
    }

    async function copyDailySummaryExcel() {
        const token = getAuthToken();
        if (!token) {
            alert('⚠️ ยังไม่พบ Token ระบบ กรุณาลองคลิกเมนูในระบบ Bplus สัก 1 ครั้ง แล้วลองกดใหม่ครับ');
            return;
        }

        const btn = document.getElementById('btn-copy-daily-excel');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '<span>กำลังดึงข้อมูล...</span>';

        try {
            const closedToday = await getTodayClosedItems();
            if (closedToday.length === 0) {
                alert(`ℹ️ ไม่พบรายการที่ปิดในวันนี้ (${new Date().toLocaleDateString('th-TH')}) สำหรับ "${currentUser.fullName}" ครับ`);
                if (btn) btn.innerHTML = originalText;
                return;
            }

            // สร้าง TSV สำหรับ Paste ใน Excel ได้ทันที
            const headers = ['ลำดับ', 'รหัส', 'เหตุผล', 'บันทึกการดำเนินการ', 'linkบทความ(ถ้ามี)'];
            const rows = closedToday.map((it, idx) => {
                const seq = idx + 1;
                const code = it.action_code || '';
                const reason = (it.reason || it.title || '').replace(/[\r\n\t]+/g, ' ').trim();
                const notes = (it.resolution_notes || '').replace(/[\r\n\t]+/g, ' ').trim();
                let articleLink = '';
                if (it.result_article_id) {
                    articleLink = `https://cloudbplusai.bplus.co.th/articles/${it.result_article_id}`;
                }
                return [seq, code, reason, notes, articleLink].join('\t');
            });

            const tsvContent = [headers.join('\t'), ...rows].join('\n');

            // Copy to clipboard
            await copyTextToClipboard(tsvContent);

            if (btn) {
                btn.innerHTML = `<span>คัดลอกสำเร็จ (${closedToday.length} รายการ)</span>`;
                btn.style.background = 'var(--sp-ok)';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.background = '';
                }, 3000);
            }

            showToastAlert(
                `คัดลอกตาราง Excel สำเร็จ!`,
                `ดึงงานที่ปิดวันนี้ของ <b>${currentUser.fullName}</b> ทั้งหมด <b>${closedToday.length} รายการ</b> เรียบร้อย นำไป Paste (Ctrl+V) ใน Excel หรืออีเมลได้เลยครับ`
            );

        } catch(err) {
            console.error('[Copy Excel Error]', err);
            alert('❌ เกิดข้อผิดพลาดในการคัดลอกข้อมูล กรุณาลองใหม่อีกครั้ง');
            if (btn) btn.innerHTML = originalText;
        }
    }

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch(e) {}
        }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }

    // ============================================
    // ⚙️ 6. REPAIR FORM ENGINE (V2.2 เดิมครบ 100%)
    // ============================================
    let repairArticles = [];

    function bindRepairLogic() {
        document.getElementById('repair-file-input').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                repairArticles = parseMDContent(evt.target.result);
                const sel = document.getElementById('repair-article-select');
                sel.innerHTML = '';
                repairArticles.forEach((art, idx) => {
                    const opt = document.createElement('option');
                    opt.value = idx;
                    opt.textContent = `ข้อ ${idx + 1}: ${art.title.substring(0, 40)}...`;
                    sel.appendChild(opt);
                });
                document.getElementById('repair-file-info').innerText = `✅ [${file.name}] โหลด ${repairArticles.length} บทความ`;
                document.getElementById('btn-fill-fresh').disabled = false;
                document.getElementById('repair-run-btn').disabled = false;
                updatePreview(0);
            };
            reader.readAsText(file, 'UTF-8');
        });

        document.getElementById('repair-article-select').addEventListener('change', function() {
            updatePreview(parseInt(this.value));
        });

        // 🧹 ปุ่ม 1: ล้างข้อมูลอย่างเดียว
        document.getElementById('btn-clear-all').onclick = async function() {
            this.disabled = true;
            await clearAllFormFieldsAsync();
            this.disabled = false;
        };

        // 📝 ปุ่ม 2: หยอดข้อมูลใหม่ลงช่องว่างอย่างเดียว
        document.getElementById('btn-fill-fresh').onclick = async function() {
            if (repairArticles.length === 0) { alert('❌ กรุณาเลือกไฟล์ .md ก่อนครับ!'); return; }
            const idx = parseInt(document.getElementById('repair-article-select').value);
            const art = repairArticles[idx];
            if (!art) { alert('❌ ไม่พบข้อมูลบทความ'); return; }

            this.disabled = true;
            await fillFormFieldsAsync(art);
            this.disabled = false;
        };

        // 🚀 ปุ่ม 3: ซ่อมอัตโนมัติ (ล้างก่อน -> รอ 1 วิ -> หยอดใหม่)
        document.getElementById('repair-run-btn').onclick = async function() {
            if (repairArticles.length === 0) { alert('❌ กรุณาเลือกไฟล์ .md ก่อนครับ!'); return; }
            const idx = parseInt(document.getElementById('repair-article-select').value);
            const art = repairArticles[idx];
            if (!art) { alert('❌ ไม่พบข้อมูลบทความ'); return; }

            const originalPrint = window.print;
            window.print = function() { console.warn('🛡️ Repair Tool บล็อกคำสั่ง print ชั่วคราว'); };

            this.disabled = true;
            document.getElementById('repair-log').innerHTML = '';
            document.getElementById('repair-log').style.display = 'block';

            try {
                await clearAllFormFieldsAsync();
                addLog('⏳ รอ 1 วินาที ให้ DOM ล้างเรียบร้อย...');
                await delay(1000);

                await fillFormFieldsAsync(art);

            } catch(err) {
                console.error('Repair Error:', err);
                setStatus('❌ เกิดข้อผิดพลาด ดู Console', '#dc2626');
                addLog(`❌ Error: ${err.message}`);
            } finally {
                window.print = originalPrint;
            }

            this.disabled = false;
        };
    }

    function updatePreview(idx) {
        const art = repairArticles[idx];
        if (!art) return;
        document.getElementById('repair-preview').style.display = 'flex';
        document.getElementById('repair-preview-title').innerText = `📌 ${art.title}`;
        document.getElementById('repair-preview-keywords').innerText = `🔑 ${art.keywords || '(ไม่มี)'}`;
        document.getElementById('repair-preview-questions').innerText = `❓ ${art.questions.length} คำถาม: ${art.questions.slice(0, 2).join(' / ')}${art.questions.length > 2 ? '...' : ''}`;
        // ตรวจตามเกณฑ์ Quality Score 15/15 (คำถาม 25, Keywords 25, คำอธิบาย 20–120, เนื้อหา ≥ 2,000)
        const kwCount = (art.keywords || '').split(/[,，\n]/).map(k => k.trim()).filter(Boolean).length;
        const checks = [
            ['คำถาม', art.questions.length, art.questions.length === 25, '25'],
            ['Keywords', kwCount, kwCount === 25, '25'],
            ['คำอธิบาย', (art.desc || '').length, (art.desc || '').length >= 20 && (art.desc || '').length <= 120, '20–120'],
            ['เนื้อหา', (art.content || '').length, (art.content || '').length >= 2000, '≥2,000']
        ];
        const scoreEl = document.getElementById('repair-preview-score');
        if (scoreEl) scoreEl.innerHTML = checks.map(([l, v, ok, need]) =>
            `<span class="sp-tag" style="color:${ok ? 'var(--sp-ok)' : 'var(--sp-err)'};border-color:currentColor" title="เกณฑ์ ${need}">${ok ? '✓' : '✗'} ${l} ${v}</span>`).join(' ');
    }

    function parseMDContent(mdText) {
        const articles = [];
        const rawBlocks = mdText.split(/##\s+บทความที่\s+\d+/i).slice(1);
        rawBlocks.forEach((block, idx) => {
            const getMatch = (regex) => { const m = block.match(regex); return m ? m[1].trim() : ''; };
            const title = getMatch(/\*\*ชื่อบทความ:\*\*\s*(.+)/i);
            const desc = getMatch(/\*\*คำอธิบายย่อ:\*\*\s*(.+)/i);
            const keywords = getMatch(/\*\*Keywords:\*\*\s*(.+)/i);
            const qMatch = block.match(/\*\*คำถามตัวอย่าง:\*\*\s*([\s\S]*?)(?=\*\*Keywords:|\*\*เนื้อหา:|$)/i);
            let questions = [];
            if (qMatch) {
                questions = qMatch[1].split('\n')
                    .map(q => q.replace(/^\s*(?:[*\-•]|\d+[.)])\s*/, '').replace(/^\(\s*Primary\s*\)\s*/i, '').trim())
                    .filter(q => q.length > 3);
            }
            const contentMatch = block.match(/\*\*เนื้อหา:\*\*\s*```[\r\n]*([\s\S]*?)```/i);
            const content = contentMatch ? contentMatch[1].trim() : '';
            if (title) articles.push({ idx: idx + 1, title, desc, keywords, questions, content });
        });
        return articles;
    }

    function addLog(msg) {
        const log = document.getElementById('repair-log');
        if (!log) return;
        log.style.display = 'block';
        const line = document.createElement('div');
        line.innerText = `${new Date().toLocaleTimeString()} ${msg}`;
        log.prepend(line);
    }

    function setStatus(msg, color = '#7c3aed') {
        const statusBar = document.getElementById('repair-status-bar');
        if (!statusBar) return;
        statusBar.style.setProperty('--tc', color);
        statusBar.style.display = 'flex';
        document.getElementById('repair-status-text').innerText = msg;
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    function injectToElement(el, value) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        try {
            const tag = el.tagName === 'TEXTAREA' ? 'HTMLTextAreaElement' : 'HTMLInputElement';
            const setter = Object.getOwnPropertyDescriptor(window[tag].prototype, 'value').set;
            if (setter) setter.call(el, value); else el.value = value;
        } catch(e) { el.value = value; }
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        el.blur();
    }

    async function deleteAllKeywordTagsV3() {
        const kwCard = document.getElementById('article-field-keywords');
        const searchRoot = kwCard || document;
        let deletedCount = 0;

        for (let attempt = 0; attempt < 300; attempt++) {
            const deleteBtns = Array.from(searchRoot.querySelectorAll('button[aria-label^="ลบ"], button[aria-label*="ลบ"]')).filter(b =>
                !SP.isOurs(b) && b.offsetWidth > 0
            );
            if (deleteBtns.length === 0) break;
            try {
                deleteBtns[0].click();
                deletedCount++;
            } catch(e) {
                console.error('KW Delete Error:', e);
            }
            await delay(90);
        }
        return deletedCount;
    }

    async function clearAllFormFieldsAsync() {
        setStatus('🧹 กำลังล้างข้อมูลในฟอร์มทิ้งทั้งหมด...');
        addLog('🧹 เริ่มการล้างข้อมูลในฟอร์ม...');

        const doTitle     = document.getElementById('repair-chk-title').checked;
        const doDesc      = document.getElementById('repair-chk-desc').checked;
        const doContent   = document.getElementById('repair-chk-content').checked;
        const doKeywords  = document.getElementById('repair-chk-keywords').checked;
        const doQuestions = document.getElementById('repair-chk-questions').checked;

        if (doTitle) {
            const titleEl = document.querySelector('input[placeholder^="ระบุหัวข้อบทความ"]');
            if (titleEl) { injectToElement(titleEl, ''); addLog('🧹 ล้างชื่อบทความ'); }
        }
        if (doDesc) {
            const descEl = document.querySelector('input[placeholder^="สรุปสั้น ๆ"]');
            if (descEl) { injectToElement(descEl, ''); addLog('🧹 ล้างคำอธิบายย่อ'); }
        }
        if (doContent) {
            const contentEl = document.querySelector('textarea[placeholder^="เขียนเนื้อหาบทความ"]');
            if (contentEl) { injectToElement(contentEl, ''); addLog('🧹 ล้างเนื้อหา'); }
        }
        if (doKeywords) {
            addLog('🧹 สแกนลบ Keywords tags เดิม...');
            const kwDeleted = await deleteAllKeywordTagsV3();
            addLog(`🧹 ลบ Keyword tags ไปทั้งหมด ${kwDeleted} รายการ`);
        }
        if (doQuestions) {
            addLog('🧹 ลบคำถาม QA เดิม...');
            const qSection = findQuestionSection();
            let qDeleted = 0;

            if (qSection) {
                for (let attempt = 0; attempt < 50; attempt++) {
                    const qInputs = Array.from(qSection.querySelectorAll('input')).filter(el =>
                        el.offsetWidth > 0 && !SP.isOurs(el) && (el.placeholder.includes('วิธียกเลิกบิลขาย') || el.placeholder.includes('คำถาม') || el.type === 'text')
                    );
                    if (qInputs.length === 0) break;

                    let clicked = false;
                    for (let inp of qInputs) {
                        const row = inp.closest('div.flex, div.grid, div.items-center, div.border') || inp.parentElement;
                        if (!row) continue;

                        const trashBtn = Array.from(row.querySelectorAll('button')).find(b => {
                            if (b.closest('#repair-panel')) return false;
                            if (b.getAttribute('role') === 'checkbox') return false;
                            const html = b.outerHTML.toLowerCase();
                            if (html.includes('print') || html.includes('printer')) return false;
                            const isTrashSvg = b.querySelector('.lucide-trash, .lucide-trash-2, [class*="trash"]') || html.includes('trash');
                            const isRed = b.classList.contains('text-destructive') || b.className.includes('destructive') || b.className.includes('text-red');
                            return isTrashSvg || isRed;
                        });

                        if (trashBtn) {
                            trashBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            trashBtn.click();
                            qDeleted++;
                            clicked = true;
                            await delay(350);
                            break;
                        }
                    }
                    if (!clicked) break;
                }
            }
            addLog(`🧹 ลบคำถาม QA ไปทั้งหมด ${qDeleted} ข้อ`);
        }

        setStatus('✨ ล้างข้อมูลในฟอร์มเรียบร้อยแล้ว!', '#059669');
        addLog('✨ ล้างข้อมูลในฟอร์มเสร็จสิ้น!');
    }

    async function fillFormFieldsAsync(art) {
        setStatus(`📝 กำลังหยอดข้อมูลบทความ: ${art.title.substring(0, 25)}...`);
        addLog(`📝 เริ่มหยอดข้อมูลข้อที่ ${art.idx}: ${art.title}`);

        const doTitle     = document.getElementById('repair-chk-title').checked;
        const doDesc      = document.getElementById('repair-chk-desc').checked;
        const doContent   = document.getElementById('repair-chk-content').checked;
        const doKeywords  = document.getElementById('repair-chk-keywords').checked;
        const doQuestions = document.getElementById('repair-chk-questions').checked;

        if (doTitle) {
            const el = document.querySelector('input[placeholder^="ระบุหัวข้อบทความ"]');
            if (el) { injectToElement(el, art.title); addLog(`✅ ชื่อบทความ: ${art.title.substring(0, 30)}...`); }
            await delay(200);
        }
        if (doDesc) {
            const el = document.querySelector('input[placeholder^="สรุปสั้น ๆ"]');
            if (el) { injectToElement(el, art.desc); addLog(`✅ คำอธิบายย่อ: ${art.desc.substring(0, 30)}...`); }
            await delay(200);
        }
        if (doContent) {
            const el = document.querySelector('textarea[placeholder^="เขียนเนื้อหาบทความ"]');
            if (el) { injectToElement(el, art.content); addLog(`✅ เนื้อหา (${art.content.length} ตัวอักษร)`); }
            await delay(200);
        }
        if (doKeywords && art.keywords) {
            const kwInput = Array.from(document.querySelectorAll('textarea, input')).find(el =>
                el.offsetWidth > 0 && !SP.isOurs(el) &&
                (el.placeholder.includes('keyword') || el.placeholder.includes('คีย์เวิร์ด') ||
                 el.placeholder.includes('Enter') || el.placeholder.includes('comma') ||
                 el.placeholder.includes('พิมพ์ keyword'))
            );

            if (kwInput) {
                const kwList = art.keywords.split(/[,,\n]/).map(k => k.trim()).filter(k => k.length > 0);
                addLog(`📝 กำลังหยอด Keywords ใหม่ ${kwList.length} คำ...`);

                const tag = kwInput.tagName === 'TEXTAREA' ? 'HTMLTextAreaElement' : 'HTMLInputElement';
                const setter = Object.getOwnPropertyDescriptor(window[tag].prototype, 'value').set;

                for (let word of kwList) {
                    kwInput.focus();
                    await delay(60);
                    if (setter) setter.call(kwInput, word); else kwInput.value = word;
                    kwInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    kwInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    await delay(100);
                    kwInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    kwInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    await delay(150);
                }
                kwInput.blur();
                addLog(`✅ ใส่ Keywords ใหม่ครบ ${kwList.length} คำเรียบร้อย`);
            }
        }
        if (doQuestions && art.questions) {
            await fillNewQuestions(art.questions);
        }

        setStatus(`🎉 ซ่อมเสร็จ! "${art.title.substring(0, 20)}..." — ตรวจสอบแล้วกดบันทึกเองนะครับ`, '#059669');
        addLog('🎉 หยอดข้อมูลเสร็จสิ้น! กรุณาตรวจสอบแล้วกดบันทึกเองนะครับ');
    }

    function findQuestionSection() {
        const heading = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,p,div,span,label')).find(el =>
            !SP.isOurs(el) && el.children.length <= 2 && el.textContent.trim().includes('คำถามตัวอย่าง')
        );
        if (!heading) return null;
        let section = heading.parentElement;
        for (let i = 0; i < 3; i++) {
            if (!section || section.tagName === 'BODY') break;
            if (section.querySelectorAll('input').length > 0) return section;
            section = section.parentElement;
        }
        return heading.parentElement;
    }

    async function fillNewQuestions(questions) {
        if (!questions || questions.length === 0) return;
        const qSection = findQuestionSection();
        if (!qSection) { addLog('❌ ไม่พบโซนคำถาม'); return; }

        for (let i = 0; i < questions.length; i++) {
            const qText = questions[i];
            await delay(300);

            const inputs = Array.from(qSection.querySelectorAll('input')).filter(el =>
                el.offsetWidth > 0 && !SP.isOurs(el) &&
                (el.placeholder.includes('วิธียกเลิกบิลขาย') || el.placeholder.includes('คำถาม') || el.type === 'text') &&
                el.value.trim() === ''
            );

            if (inputs.length === 0) { addLog(`⚠️ ไม่พบช่องใส่คำถามข้อที่ ${i + 1}`); break; }

            const inp = inputs[inputs.length - 1];
            const rowContainer = inp.closest('div.flex, div.grid, div.items-center') || inp.parentElement;

            inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
            inp.focus();
            await delay(100);

            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            if (setter) setter.call(inp, qText); else inp.value = qText;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));

            await delay(200);

            if (i === 0 && rowContainer) {
                const primaryBtn = rowContainer.querySelector('button[role="checkbox"]');
                if (primaryBtn && primaryBtn.getAttribute('aria-checked') === 'false') {
                    primaryBtn.click();
                    await delay(200);
                }
            }

            if (i < questions.length - 1) {
                let plusBtn = null;
                if (rowContainer) {
                    plusBtn = Array.from(rowContainer.querySelectorAll('button')).find(b => b.textContent.trim() === '+' || b.textContent.trim().includes('เพิ่ม')) || rowContainer.lastElementChild;
                }
                if (!plusBtn || plusBtn.tagName !== 'BUTTON') {
                    plusBtn = Array.from(qSection.querySelectorAll('button')).find(b => b.offsetWidth > 0 && (b.textContent.trim() === '+' || b.textContent.trim().includes('เพิ่ม')));
                }
                if (plusBtn && plusBtn.tagName === 'BUTTON') {
                    plusBtn.removeAttribute('disabled');
                    plusBtn.disabled = false;
                    plusBtn.click();
                    await delay(400);
                }
            }
            addLog(`✅ คำถาม ${i + 1}/${questions.length}: ${qText.substring(0, 30)}...`);
        }
    }

    // ============================================
    // 🎨 UI (pane ใน Drawer + status pill ลอย)
    // ============================================
    function mount(pane) {
        pane.innerHTML = `
          <div class="sp-pad sp-col" style="gap:14px">
            <div>
              <div class="sp-kicker" style="color:var(--tc)">SP · QA Repair</div>
              <div style="font-size:17px;font-weight:700;line-height:1.3">ซ่อมบทความ QA + งานของฉัน</div>
            </div>

            <div class="sp-card">
              <div class="sp-card-t">
                <span id="repair-user-label">งานค้าง (${SP.esc(currentUser.fullName || 'ผู้ใช้งาน')})</span>
                <button type="button" id="btn-request-perm" class="sp-btn sp-sm">เปิดแจ้งเตือน Windows</button>
              </div>
              <div id="repair-action-status-info" class="sp-note" style="margin-bottom:10px">กำลังตรวจเช็คงาน...</div>
              <div class="sp-row">
                <button type="button" id="btn-manual-check-actions" class="sp-btn sp-grow">${SP.ICON.refresh.replace('<svg', '<svg width="14" height="14"')} ตรวจงานเดี๋ยวนี้</button>
                <button type="button" id="btn-go-action-items" class="sp-btn sp-pri sp-grow">ไปหน้ารายการ (เลือกชื่อให้)</button>
              </div>
            </div>

            <div id="sp-myhandoff-slot"></div>

            <div class="sp-card">
              <div class="sp-card-t">
                <span>ผลงานปิดวันนี้ (Excel)</span>
                <span id="repair-closed-today-count" class="sp-pill" style="background:var(--sp-ok);color:var(--sp-toolInk)">0 รายการ</span>
              </div>
              <div id="repair-closed-today-info" class="sp-note" style="margin-bottom:10px">กำลังตรวจเช็คผลงานวันนี้...</div>
              <button type="button" id="btn-copy-daily-excel" class="sp-btn sp-ok sp-block">คัดลอกตาราง Excel สรุปงานวันนี้</button>
            </div>

            <div class="sp-row" style="margin:4px 0 -4px;gap:6px">
              <div class="sp-section-t sp-grow" style="margin:0">ซ่อมฟอร์มบทความจากไฟล์ .md</div>
              <button type="button" id="sp-qa-sample-btn" class="sp-btn sp-sm" title="ดาวน์โหลดไฟล์ .md ตัวอย่างที่นำเข้าได้ทันที">ไฟล์ตัวอย่าง</button>
              <button type="button" id="sp-qa-skill-btn" class="sp-btn sp-sm" title="ดาวน์โหลด SKILL.md สำหรับให้ AI ช่วยสร้างไฟล์ .md รูปแบบนี้">คำสั่งสร้าง Skill</button>
            </div>
            <div class="sp-field">
              <label class="sp-label" for="repair-file-input">1 · เลือกไฟล์ Markdown (.md)</label>
              <input type="file" id="repair-file-input" accept=".md" class="sp-input" style="padding:6px;height:auto">
              <div id="repair-file-info" class="sp-mono" style="font-size:11px;color:var(--tc);margin-top:4px"></div>
            </div>
            <div class="sp-field">
              <label class="sp-label" for="repair-article-select">2 · เลือกข้อที่จะนำมาซ่อม</label>
              <select id="repair-article-select" class="sp-select"><option value="">-- โหลดไฟล์ .md ก่อน --</option></select>
              <div id="repair-preview" class="sp-card" style="display:none;margin-top:8px;padding:10px;flex-direction:column;gap:3px">
                <div id="repair-preview-title" style="font-weight:700;font-size:12.5px"></div>
                <div id="repair-preview-keywords" class="sp-note"></div>
                <div id="repair-preview-questions" class="sp-note"></div>
                <div id="repair-preview-score" class="sp-row sp-wrap" style="gap:4px;margin-top:4px"></div>
              </div>
            </div>
            <div>
              <div class="sp-label">3 · เลือกส่วนที่ต้องการจัดการ</div>
              <div class="sp-grid sp-g2" style="gap:6px">
                <label class="sp-check sp-card" style="padding:8px 10px"><input type="checkbox" id="repair-chk-title" checked> ชื่อบทความ</label>
                <label class="sp-check sp-card" style="padding:8px 10px"><input type="checkbox" id="repair-chk-desc" checked> คำอธิบายย่อ</label>
                <label class="sp-check sp-card" style="padding:8px 10px"><input type="checkbox" id="repair-chk-content" checked> เนื้อหา</label>
                <label class="sp-check sp-card" style="padding:8px 10px"><input type="checkbox" id="repair-chk-keywords" checked> Keywords</label>
                <label class="sp-check sp-card" style="padding:8px 10px;grid-column:1/-1"><input type="checkbox" id="repair-chk-questions" checked> คำถาม QA</label>
              </div>
            </div>
            <div class="sp-col" style="gap:8px">
              <button type="button" id="btn-clear-all" class="sp-btn sp-danger sp-block">1 · ล้างข้อมูลในฟอร์มทิ้งทั้งหมด</button>
              <button type="button" id="btn-fill-fresh" class="sp-btn sp-block" disabled>2 · หยอดข้อมูลใหม่จาก MD</button>
              <button type="button" id="repair-run-btn" class="sp-btn sp-pri sp-lg sp-block" disabled>3 · ซ่อมอัตโนมัติ (ล้าง → รอ 1 วิ → หยอดใหม่)</button>
            </div>
            <div id="repair-log" class="sp-log" style="display:none"></div>
          </div>`;

        // status pill (ลอยกลางบน) — คง id เดิม
        if (!document.getElementById('repair-status-bar')) {
            const statusBar = document.createElement('div');
            statusBar.id = 'repair-status-bar';
            statusBar.className = 'sp-suite sp-toast';
            statusBar.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483000;display:none;--tc:var(--sp-qa);';
            statusBar.innerHTML = `
                <span class="sp-toast-mark">QA</span>
                <span id="repair-status-text">QA Repair กำลังทำงาน...</span>
                <button type="button" id="repair-btn-stop" class="sp-btn sp-sm" style="margin-left:6px">ซ่อน</button>`;
            SP.host().appendChild(statusBar);
            document.getElementById('repair-btn-stop').onclick = () => {
                statusBar.style.display = 'none';
                addLog('⛔ ซ่อนแถบสถานะ');
            };
        }

        document.getElementById('btn-manual-check-actions').onclick = () => { checkMyActionItems(true); };
        document.getElementById('btn-copy-daily-excel').onclick = () => { copyDailySummaryExcel(); };
        document.getElementById('btn-go-action-items').onclick = () => { navigateToMyActionItems(); };
        document.getElementById('btn-request-perm').onclick = () => {
            requestDesktopPermission();
            alert('🔔 ขอสิทธิ์แจ้งเตือนเรียบร้อยครับ (หากเบราว์เซอร์ขึ้นถาม ให้กด Allow/อนุญาต นะครับ)');
        };
        bindRepairLogic();
        SP.onUser(updateUserLabelInUI);
        document.getElementById('sp-qa-sample-btn').onclick = () => {
            SP.downloadText('ตัวอย่าง_QA_Repair.md', SP.QA_SAMPLE_MD);
            SP.toast('ดาวน์โหลดไฟล์ตัวอย่างแล้ว — เปิดดูรูปแบบ หรือลองโหลดเข้าเครื่องมือได้เลย', 'qa');
        };
        document.getElementById('sp-qa-skill-btn').onclick = () => {
            SP.downloadText('SKILL.md', SP.QA_SKILL_MD);
            SP.toast('ดาวน์โหลด SKILL.md แล้ว — นำไปสร้าง Skill หรือวางเป็นคำสั่งให้ AI ได้เลย', 'qa');
        };

        // ---- เริ่มงานเบื้องหลัง ----
        setTimeout(async () => {
            if (!SP.feature('qa')) return;
            await fetchCurrentUserProfile();
            await checkMyActionItems(false);
            if (sessionStorage.getItem('bplus_auto_select_assignee') === '1') checkAndApplyAutoSelect();
        }, 1500);
        if (sessionStorage.getItem('bplus_auto_select_assignee') === '1') checkAndApplyAutoSelect();

        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                if (sessionStorage.getItem('bplus_auto_select_assignee') === '1' && url.includes('/action-items')) checkAndApplyAutoSelect();
            }
        }).observe(document, { subtree: true, childList: true });

        setInterval(() => { if (SP.feature('qa')) checkMyActionItems(false); }, 120000);
    }

    SP.registerTool({
        id: 'qa', tc: 'qa', feature: 'qa', paneId: 'sp-pane-qa',
        label: 'QA Repair',
        title: 'ซ่อมบทความจาก .md + แจ้งเตือนงานค้างของฉัน + สรุปงานปิดวันนี้',
        desc: 'ซ่อมบทความจากไฟล์ .md · แจ้งเตือนงานค้างของฉัน · สรุปงานปิดวันนี้',
        width: 440,
        mount,
        onOpen() { updateTodayClosedUI(); }
    });
  })();
