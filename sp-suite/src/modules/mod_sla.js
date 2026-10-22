  // =====================================================================
  //  MODULE: Executive SLA & Daily Closeout Hub (v5.3 → SP Suite)
  //  logic / สูตร / poster PNG / CSV คงเดิม — เปลี่ยนแค่ที่อยู่ UI + ธีม
  // =====================================================================
  (function () {
  // State
  let currentHubMode = 'daily';
  let activeTab = 'all';
  let cachedSessions = [];
  let cachedActionItems = [];
  let customerMap = {};
  let agentMap = {};
  let userMap = {};
  let hasFetched = false;
  let lastApiError = null;

  function formatThaiDate(rawStr) {
    if (!rawStr) return '—';
    const datePart = rawStr.slice(0, 10);
    const parts = datePart.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parseInt(parts[0], 10) + 543}`;
    }
    return datePart;
  }

  // แปลงเป็นเวลาไทยท้องถิ่น (UTC+7)
  function formatTime(rawStr) {
    if (!rawStr) return '—';
    try {
      const d = new Date(rawStr);
      if (isNaN(d.getTime())) return rawStr.slice(11, 16) || '—';
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch (e) {
      return rawStr.slice(11, 16) || '—';
    }
  }

  function loadHtmlToImage(callback) {
    if (window.htmlToImage) { callback(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js';
    script.onload = callback;
    document.head.appendChild(script);
  }

  // ---------- API (ใช้ rawFetch ของ Suite) ----------
  // 3. API Get
  async function apiGet(endpoint) {
    const token = SP.getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token.replace(/^"|"$/g, '')}`;

    try {
      const res = await SP.rawFetch(`/api${endpoint}`, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastApiError = res.status === 429 ? 'ระบบป้องกันคำขอถี่เกินไป กรุณารอสักครู่' : `HTTP ${res.status}: ${json.message || res.statusText || 'Error'}`;
        return null;
      }
      return json;
    } catch (err) {
      lastApiError = err.message;
      return null;
    }
  }

  // Fetch Action Items for selection
  async function fetchActionItemsForSelection(qCode, prodId) {
    try {
      const prodParam = (prodId && prodId !== 'all') ? `&product_id=${prodId}` : '';
      const endpoint = `/action-items?action_type=content_issue${prodParam}&q=${qCode}&limit=100&page=1`;
      const firstRes = await apiGet(endpoint);
      let items = [];
      const dataArr = firstRes?.data?.items || firstRes?.data || [];
      if (Array.isArray(dataArr)) {
        items = dataArr;
        const totalPages = firstRes?.data?.pagination?.totalPages || firstRes?.pagination?.totalPages || 1;
        if (totalPages > 1) {
          const extraPromises = [];
          for (let p = 2; p <= Math.min(totalPages, 5); p++) {
            extraPromises.push(apiGet(`/action-items?action_type=content_issue${prodParam}&q=${qCode}&limit=100&page=${p}`));
          }
          const results = await Promise.all(extraPromises);
          results.forEach(r => {
            const arr = r?.data?.items || r?.data || [];
            if (Array.isArray(arr)) items = items.concat(arr);
          });
        }
      }
      return items;
    } catch (e) {
      return [];
    }
  }

  // 4. Fetch Core Data
  async function fetchAndRenderRealData() {
    const prompt = document.getElementById('hub-prompt');
    const loading = document.getElementById('hub-loading');
    const content = document.getElementById('hub-content');

    if (prompt) prompt.style.display = 'none';
    loading.style.display = 'block';
    content.style.display = 'none';
    lastApiError = null;

    try {
      let dateFrom, dateTo;
      if (currentHubMode === 'daily') {
        let d = document.getElementById('hub-date-input').value;
        if (!d) d = new Date().toISOString().slice(0, 10);
        dateFrom = d; dateTo = d;
      } else {
        let m = document.getElementById('hub-month-input').value || new Date().toISOString().slice(0, 7);
        const [year, month] = m.split('-');
        const lastDay = new Date(year, month, 0).getDate();
        dateFrom = `${m}-01`;
        dateTo = `${m}-${String(lastDay).padStart(2, '0')}`;
      }

      const prodFilter = document.getElementById('hub-product-select')?.value || 'Bplus ERP';
      const prodId = getProductId(prodFilter);
      const isSE = (prodFilter === 'Bplus POS' || prodFilter.includes('POS') || prodFilter.includes('SE'));
      const actionProdId = isSE ? 'all' : prodId;
      const qCode = (currentHubMode === 'daily' ? dateFrom : dateFrom.slice(0, 7)).replace(/-/g, '');

      const [sessionsRes, activeHandoffRes, profilesRes, usersRes, actionItemsList] = await Promise.all([
        apiGet(`/chatbot/monitor/sessions?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=600`),
        apiGet(`/chatbot/handoff/queue?mode=all&limit=200`),
        apiGet(`/customer-profiles?limit=500`),
        apiGet(`/auth/users`),
        fetchActionItemsForSelection(qCode, actionProdId)
      ]);

      cachedActionItems = actionItemsList || [];

      let rawList = [];
      if (Array.isArray(sessionsRes)) rawList = sessionsRes;
      else if (sessionsRes?.data?.items && Array.isArray(sessionsRes.data.items)) rawList = sessionsRes.data.items;
      else if (sessionsRes?.data && Array.isArray(sessionsRes.data)) rawList = sessionsRes.data;
      else if (sessionsRes?.items && Array.isArray(sessionsRes.items)) rawList = sessionsRes.items;
      cachedSessions = rawList;

      userMap = {};
      const userList = Array.isArray(usersRes?.data) ? usersRes.data : (Array.isArray(usersRes) ? usersRes : []);
      userList.forEach(u => {
        userMap[u.id] = u.full_name || u.fullName || u.name || u.username;
      });

      customerMap = {};
      const profileList = Array.isArray(profilesRes?.data) ? profilesRes.data : (Array.isArray(profilesRes) ? profilesRes : []);
      profileList.forEach(p => {
        const comp = (p.company_name || p.company || '').trim();
        const dName = (p.display_name || p.nickname || '').trim();
        const profileEntry = { company: comp || null, displayName: dName || null };
        if (p.identity_key) {
          customerMap[p.identity_key] = profileEntry;
          customerMap[p.identity_key.replace(/^[^:]+:/, '')] = profileEntry;
        }
        if (p.external_user_id) customerMap[p.external_user_id] = profileEntry;
      });

      agentMap = {};
      const combineHandoff = Array.isArray(activeHandoffRes?.data) ? activeHandoffRes.data : (Array.isArray(activeHandoffRes) ? activeHandoffRes : []);
      combineHandoff.forEach(item => {
        const sc = item.session_code;
        if (sc) {
          const aName = item.assignedAgent?.name || item.assigned_agent_name || (item.assigned_to && userMap[item.assigned_to]);
          if (aName) agentMap[sc] = aName;

          const cComp = (item.customerCompany || '').trim();
          const cName = (item.customerName || '').trim();
          if (cComp || cName) {
            const info = { company: cComp || null, displayName: cName || null };
            customerMap[sc] = info;
            if (item.external_user_id) customerMap[item.external_user_id] = info;
          }
        }
      });

      hasFetched = true;
      renderUIFromCache();
      loading.style.display = 'none';
      content.style.display = 'flex';

    } catch (err) {
      loading.innerHTML = `<div style="color:#ef4444; font-weight:bold;">❌ เกิดข้อผิดพลาด: ${err.message}</div>`;
    }
  }

  function getFilteredSessions() {
    const prodFilter = document.getElementById('hub-product-select')?.value || 'Bplus ERP';
    let list = cachedSessions;
    if (prodFilter !== 'all') {
      const f = prodFilter.toLowerCase();
      list = list.filter(s => {
        const p = (s.product_name || '').toLowerCase();
        return p === f || p.includes(f) || f.includes(p);
      });
    }
    // จัดเรียงคิวตามเวลาที่ลูกค้าทักเข้ามาล่าสุด (ใหม่ไปเก่า)
    return list.slice().sort((a, b) => {
      const timeA = new Date(a.lastCustomerMsgAt || a.last_customer_msg_at || a.started_at || 0).getTime();
      const timeB = new Date(b.lastCustomerMsgAt || b.last_customer_msg_at || b.started_at || 0).getTime();
      return timeB - timeA;
    });
  }

  function isGapSession(s) {
    const events = s.events || [];
    const hasLow = events.some(e => e.event_type === 'LowConfidence' || e.event_type === 'SilentFailure');
    const r = s.handoff_reason || '';
    return Boolean(hasLow || r.includes('Bot ตอบไม่ได้') || r.includes('มั่นใจต่ำ') || r.includes('SilentFailure'));
  }

  function getProductId(productName) {
    if (!productName || productName === 'all') return 'all';
    if (productName.includes('ERP')) return '1';
    if (productName.includes('POS')) return '2';
    if (productName.includes('HRM')) return '3';
    return 'all';
  }

  function isTargetTeamActionItem(it, prodFilter) {
    const isSE = (prodFilter === 'Bplus POS' || prodFilter.includes('POS') || prodFilter.includes('SE'));
    const isHRM = prodFilter.includes('HRM');
    const rawName = ((it.assigned_to && userMap[it.assigned_to]) || it.assignee_name || '').trim();

    if (isSE) {
      return /\(?\s*(SP|Bplus)\s*SE\s*\)?/i.test(rawName);
    } else if (isHRM) {
      const isUnassigned = !it.assigned_to && (!it.assignee_name || it.assignee_name === 'None' || it.assignee_name === 'ยังไม่มอบหมาย');
      if (isUnassigned) return true;
      return /\(?\s*(SP|Bplus)\s*HRM\s*\)?/i.test(rawName);
    } else {
      const isUnassigned = !it.assigned_to && (!it.assignee_name || it.assignee_name === 'None' || it.assignee_name === 'ยังไม่มอบหมาย');
      if (isUnassigned) return true;
      return /\(?\s*(SP|Bplus)\s*ERP\s*\)?/i.test(rawName);
    }
  }

  function getCustomerDisplay(s) {
    const lineId = (s.external_user_id || '').replace(/^[^:]+:/, '') || '—';
    const mapped = customerMap[s.session_code] || customerMap[s.external_user_id] || customerMap[lineId];
    let comp = (s.customer_company || s.company || mapped?.company || '').trim();
    if (comp) comp = comp.split(/[\r\n]+/)[0].trim().replace(/\s+(โทร|tel|ติดต่อ).*$/i, '').trim();
    return { company: comp || 'ไม่ระบุ', lineId };
  }

  function getStaffDisplay(s) {
    const isHandoff = s.handoff_mode === 'waiting' || s.handoff_mode === 'human' || s.isHandoffActive || s.status === 'Escalated';
    let staffName = agentMap[s.session_code] || s.assigned_agent_name || (s.assigned_to && userMap[s.assigned_to]);
    if (staffName) return `👤 ${staffName}`;
    if (isHandoff) return '⏳ รอเจ้าหน้าที่รับเรื่อง';
    return '🤖 Bot (อัตโนมัติ)';
  }

  // 5. Render Main UI
  function renderUIFromCache() {
    const content = document.getElementById('hub-content');
    const prodFilter = document.getElementById('hub-product-select')?.value || 'Bplus ERP';
    const isSE = (prodFilter === 'Bplus POS' || prodFilter.includes('POS') || prodFilter.includes('SE'));
    const isHRM = prodFilter.includes('HRM');
    const displaySessions = getFilteredSessions();
    const curDate = currentHubMode === 'daily' ? document.getElementById('hub-date-input').value : document.getElementById('hub-month-input').value;

    const handoffSessions = displaySessions.filter(s => s.handoff_mode === 'waiting' || s.handoff_mode === 'human' || s.isHandoffActive || s.status === 'Escalated');
    const botSessions = displaySessions.filter(s => !handoffSessions.includes(s));
    const gapSessions = displaySessions.filter(isGapSession);

    const totalCount = displaySessions.length;
    const botCount = botSessions.length;
    const handoffCount = handoffSessions.length;
    const gapCount = gapSessions.length;

    const botRate = totalCount > 0 ? ((botCount / totalCount) * 100).toFixed(1) : "0.0";
    const handoffRate = totalCount > 0 ? ((handoffCount / totalCount) * 100).toFixed(1) : "0.0";

    const erpActionItems = cachedActionItems.filter(it => isTargetTeamActionItem(it, prodFilter));
    const actionTotal = erpActionItems.length;
    const unassignedList = erpActionItems.filter(it => !it.assigned_to && (!it.assignee_name || it.assignee_name === 'None' || it.assignee_name === 'ยังไม่มอบหมาย'));
    // รวมทั้ง InProgress และ Review (รอตรวจทาน) เข้าเป็นงานกำลังดำเนินการ เพื่อไม่ให้ยอดหลุด
    const inProgressList = erpActionItems.filter(it => it.status === 'InProgress' || it.status === 'Review' || it.status === 'Open');
    const doneTotal = erpActionItems.filter(it => it.status === 'Resolved' || it.status === 'Closed').length;

    // Dates
    const [y, m, d] = (curDate || '').split('-');
    const thDateStr = d ? `${d}/${m}/${parseInt(y,10)+543}` : `${m}/${parseInt(y,10)+543}`;
    const nowStr = new Date().toLocaleTimeString('th-TH');

    // Donut math
    const circ = 238.76;
    const botRatio = totalCount > 0 ? (botCount / totalCount) : 0;
    const humanRatio = totalCount > 0 ? (handoffCount / totalCount) : 0;
    const botDash = (botRatio * circ).toFixed(1);
    const humanDash = (humanRatio * circ).toFixed(1);

    // Bar Heights
    const maxVal = Math.max(totalCount, actionTotal, gapCount, 10);
    const hTotal = Math.min(100, Math.max(8, Math.round((totalCount / maxVal) * 100)));
    const hBot = Math.min(100, Math.max(8, Math.round((botCount / maxVal) * 100)));
    const hHuman = Math.min(100, Math.max(8, Math.round((handoffCount / maxVal) * 100)));
    const hGap = Math.min(100, Math.max(8, Math.round((gapCount / maxVal) * 100)));
    const hAction = Math.min(100, Math.max(8, Math.round((actionTotal / maxVal) * 100)));

    // Dynamic Team Title & Subtexts
    const teamTitleText = isSE
      ? 'แผนก Support SE • สินค้า: '
      : (isHRM ? 'แผนก Support HRM • สินค้า: ' : 'แผนก Support ERP 1 และ ERP 2 • สินค้า: ');

    const actionBadgeText = isSE ? 'ทีม (SP SE)' : (isHRM ? 'ทีม (SP HRM)' : 'ทีม (SP ERP)');

    const actionConditionNote = isSE
      ? '*กรองเฉพาะรายการปัญหาเนื้อหาที่มอบหมายให้ทีม (SP SE) จากทุกผลิตภัณฑ์ (ERP, POS, HRM)'
      : (isHRM
          ? '*กรองเฉพาะผู้รับผิดชอบทีม (SP HRM) หรือรายการที่ยังไม่มอบหมาย'
          : '*กรองเฉพาะผู้รับผิดชอบทีม (SP ERP) หรือรายการที่ยังไม่มอบหมาย');

    content.innerHTML = `
      <!-- EXACT 980px CAPTURE POSTER CONTAINER (Matching Executive Dashboard v5) -->
      <div id="bplus-line-capture-container" style="width:980px; max-width:980px; margin:0 auto; background:#ffffff; border-radius:18px; border:1px solid #cbd5e1; box-shadow:0 4px 20px rgba(0,0,0,0.06); padding:26px 28px; box-sizing:border-box; display:flex; flex-direction:column; gap:16px;">

        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:14px; gap:16px;">
          <div style="display:flex; align-items:center; gap:14px; min-width:0; flex:1;">
            <span style="background:linear-gradient(135deg, #2563eb, #3730a3); color:#fff; font-weight:900; font-size:24px; padding:6px 14px; border-radius:12px; shrink:0;">B+</span>
            <div style="min-width:0;">
              <h1 style="margin:0; font-size:24px; font-weight:900; color:#0f172a; line-height:1.2; white-space:nowrap; letter-spacing:0.2px;">สรุปงานบริการคิว LINE ประจำวัน</h1>
              <div style="margin-top:6px; display:inline-flex; align-items:center; gap:8px; background:#eff6ff; border:1.5px solid #93c5fd; padding:4px 12px; border-radius:8px;">
                <span style="font-size:15px; font-weight:900; color:#1e40af; white-space:nowrap;">
                  ${teamTitleText}
                </span>
                <span style="font-size:15px; font-weight:900; color:#2563eb; background:#dbeafe; padding:2px 8px; border-radius:6px; white-space:nowrap;">
                  ${prodFilter}
                </span>
              </div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; shrink:0;">
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:6px 16px; text-align:right;">
              <div style="font-size:10px; font-weight:800; color:#2563eb; text-transform:uppercase;">วันที่ให้บริการ (LINE@)</div>
              <div style="font-size:19px; font-weight:900; color:#1e3a8a;">${thDateStr}</div>
            </div>
            <div style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; border-radius:6px; font-size:11px; font-weight:700; padding:2px 8px; white-space:nowrap;">
              ⏱️ ข้อมูล ณ เวลา: <b>${nowStr} น.</b>
            </div>
          </div>
        </div>

        <!-- Row 1: 5-Stage Process Flow (Left) + Donut Chart (Right) -->
        <div style="display:grid; grid-template-columns:8fr 4fr; gap:14px;">

          <!-- 5 Cards -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:14px; display:flex; flex-direction:column; justify-content:space-between;">
            <div style="font-size:13px; font-weight:900; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
              <span style="width:10px; height:10px; background:#10b981; border-radius:50%; display:inline-block;"></span>
              ภาพรวมการบริการคิว LINE (${prodFilter})
            </div>

            <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:8px;">
              <!-- 1. Inflow -->
              <div style="background:#fff; border:2px solid #60a5fa; border-radius:12px; padding:12px 4px; text-align:center; height:148px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                <div style="font-size:11px; font-weight:900; color:#1e40af; line-height:1.2;">1. คิวทัก LINE<br><span style="font-size:9px; color:#64748b;">(Inflow)</span></div>
                <div style="font-size:22px;">💬</div>
                <div>
                  <div style="font-size:32px; font-weight:900; color:#0f172a; line-height:1;">${totalCount}</div>
                  <div style="font-size:10px; font-weight:700; color:#64748b; margin-top:2px;">SESSIONS</div>
                </div>
                <div style="background:#dbeafe; color:#1e40af; font-size:10.5px; font-weight:900; padding:3px 2px; border-radius:5px;">Inflow รวม</div>
              </div>

              <!-- 2. Bot -->
              <div style="background:#fff; border:2px solid #34d399; border-radius:12px; padding:12px 4px; text-align:center; height:148px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                <div style="font-size:11px; font-weight:900; color:#065f46; line-height:1.2;">2. บอทตอบจบเอง<br><span style="font-size:9px; color:#64748b;">(Bot)</span></div>
                <div style="font-size:22px;">🤖</div>
                <div>
                  <div style="font-size:32px; font-weight:900; color:#059669; line-height:1;">${botCount}</div>
                  <div style="font-size:10px; font-weight:700; color:#64748b; margin-top:2px;">คิว</div>
                </div>
                <div style="background:#d1fae5; color:#065f46; font-size:10.5px; font-weight:900; padding:3px 2px; border-radius:5px;">${botRate}%</div>
              </div>

              <!-- 3. Handoff -->
              <div style="background:#fff; border:2px solid #fbbf24; border-radius:12px; padding:12px 4px; text-align:center; height:148px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                <div style="font-size:11px; font-weight:900; color:#92400e; line-height:1.2;">3. จนท. รับช่วง<br><span style="font-size:9px; color:#64748b;">(Handoff)</span></div>
                <div style="font-size:22px;">🎧</div>
                <div>
                  <div style="font-size:32px; font-weight:900; color:#d97706; line-height:1;">${handoffCount}</div>
                  <div style="font-size:10px; font-weight:700; color:#64748b; margin-top:2px;">คิว</div>
                </div>
                <div style="background:#fef3c7; color:#92400e; font-size:10.5px; font-weight:900; padding:3px 2px; border-radius:5px;">${handoffRate}%</div>
              </div>

              <!-- 4. Gap -->
              <div style="background:#fff; border:2px solid #f87171; border-radius:12px; padding:12px 4px; text-align:center; height:148px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                <div style="font-size:11px; font-weight:900; color:#991b1b; line-height:1.2;">4. บอทตอบไม่ได้<br><span style="font-size:9px; color:#64748b;">(Gap)</span></div>
                <div style="font-size:22px;">❓</div>
                <div>
                  <div style="font-size:32px; font-weight:900; color:#dc2626; line-height:1;">${gapCount}</div>
                  <div style="font-size:10px; font-weight:700; color:#64748b; margin-top:2px;">คำถาม</div>
                </div>
                <div style="background:#fee2e2; color:#991b1b; font-size:10.5px; font-weight:900; padding:3px 2px; border-radius:5px;">ส่งทำ Article</div>
              </div>

              <!-- 5. Action Items -->
              <div style="background:#fff; border:2px solid #c084fc; border-radius:12px; padding:12px 4px; text-align:center; height:148px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
                <div style="font-size:11px; font-weight:900; color:#6b21a8; line-height:1.2;">5. ดำเนินการต่อ<br><span style="font-size:9px; color:#64748b;">ปัญหาเนื้อหา</span></div>
                <div style="font-size:22px;">📋</div>
                <div>
                  <div style="font-size:32px; font-weight:900; color:#7e22ce; line-height:1;">${actionTotal}</div>
                  <div style="font-size:10px; font-weight:700; color:#64748b; margin-top:2px;">รายการ</div>
                </div>
                <div style="background:#f3e8ff; color:#6b21a8; font-size:10.5px; font-weight:900; padding:3px 2px; border-radius:5px;">${actionBadgeText}</div>
              </div>
            </div>
          </div>

          <!-- Donut Summary -->
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:14px; display:flex; flex-direction:column; justify-content:space-between;">
            <div style="font-size:13px; font-weight:900; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:8px;">📊 สัดส่วนการบริการคิว LINE รวม</div>
            <div style="display:flex; align-items:center; justify-content:space-around; gap:8px;">
              <div style="position:relative; width:110px; height:110px;">
                <svg viewBox="0 0 100 100" style="width:100%; height:100%; transform:rotate(-90deg);">
                  <circle cx="50" cy="50" r="38" stroke="#f1f5f9" stroke-width="14" fill="transparent" />
                  <circle cx="50" cy="50" r="38" stroke="#10b981" stroke-width="14" fill="transparent" stroke-dasharray="${botDash} ${circ}" />
                  <circle cx="50" cy="50" r="38" stroke="#f59e0b" stroke-width="14" fill="transparent" stroke-dasharray="${humanDash} ${circ}" stroke-dashoffset="-${botDash}" />
                </svg>
                <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                  <span style="font-size:22px; font-weight:900; color:#0f172a; line-height:1;">${totalCount}</span>
                  <span style="font-size:8px; font-weight:800; color:#94a3b8;">SESSIONS</span>
                </div>
              </div>

              <div style="font-size:11px; display:flex; flex-direction:column; gap:6px; min-width:130px;">
                <div>
                  <div style="font-weight:700; color:#475569; white-space:nowrap;">🟢 บอทตอบจบเอง</div>
                  <div style="font-weight:900; font-size:13px; color:#0f172a; white-space:nowrap;">${botCount} คิว (<span style="color:#059669;">${botRate}%</span>)</div>
                </div>
                <div>
                  <div style="font-weight:700; color:#475569; white-space:nowrap;">🟡 จนท. รับช่วงต่อ</div>
                  <div style="font-weight:900; font-size:13px; color:#0f172a; white-space:nowrap;">${handoffCount} คิว (<span style="color:#d97706;">${handoffRate}%</span>)</div>
                </div>
              </div>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px; text-align:center; font-size:11px; color:#334155; margin-top:8px; font-weight:700;">
              อัตราการลดภาระงานคน: <b style="color:#059669; font-size:13px;">${botRate}%</b>
            </div>
          </div>
        </div>

        <!-- Row 2: 5-Bar Volume Chart + 4 Action Items Status Cards -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <!-- 5-Bar Chart -->
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:14px; display:flex; flex-direction:column; justify-content:space-between;">
            <div style="font-size:13px; font-weight:900; color:#1e293b; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:8px;">📈 กราฟสรุปจำนวนคิว LINE</div>
            <div style="height:130px; display:flex; align-items:flex-end; gap:8px; padding:10px 10px 0 10px; border-bottom:1px solid #e2e8f0; box-sizing:border-box;">
              <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
                <span style="font-size:11px; font-weight:900; color:#2563eb; margin-bottom:2px;">${totalCount}</span>
                <div style="width:100%; background:#2563eb; height:${hTotal}%; border-radius:4px 4px 0 0;"></div>
                <span style="font-size:9.5px; font-weight:700; color:#475569; margin-top:4px;">คิวทัก (Inflow)</span>
              </div>
              <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
                <span style="font-size:11px; font-weight:900; color:#059669; margin-bottom:2px;">${botCount}</span>
                <div style="width:100%; background:#10b981; height:${hBot}%; border-radius:4px 4px 0 0;"></div>
                <span style="font-size:9.5px; font-weight:700; color:#475569; margin-top:4px;">บอทจบ (Bot)</span>
              </div>
              <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
                <span style="font-size:11px; font-weight:900; color:#d97706; margin-bottom:2px;">${handoffCount}</span>
                <div style="width:100%; background:#f59e0b; height:${hHuman}%; border-radius:4px 4px 0 0;"></div>
                <span style="font-size:9.5px; font-weight:700; color:#475569; margin-top:4px;">จนท. (Handoff)</span>
              </div>
              <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
                <span style="font-size:11px; font-weight:900; color:#dc2626; margin-bottom:2px;">${gapCount}</span>
                <div style="width:100%; background:#ef4444; height:${hGap}%; border-radius:4px 4px 0 0;"></div>
                <span style="font-size:9.5px; font-weight:700; color:#475569; margin-top:4px;">ตอบไม่ได้ (Gap)</span>
              </div>
              <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
                <span style="font-size:11px; font-weight:900; color:#7e22ce; margin-bottom:2px;">${actionTotal}</span>
                <div style="width:100%; background:#9333ea; height:${hAction}%; border-radius:4px 4px 0 0;"></div>
                <span style="font-size:9.5px; font-weight:700; color:#475569; margin-top:4px;">ต่อ (เนื้อหา)</span>
              </div>
            </div>
          </div>

          <!-- 4 Action Status Cards -->
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:14px; display:flex; flex-direction:column; justify-content:space-between;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:8px; gap:8px;">
              <span style="font-size:13px; font-weight:900; color:#1e293b; white-space:nowrap;">📋 สรุปสถานะการติดตามงาน (Action Items)</span>
              <span style="font-size:11px; font-weight:700; color:#64748b; white-space:nowrap;">วันที่ ${thDateStr}</span>
            </div>

            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
              <!-- 1. Total -->
              <div style="background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:8px 4px; text-align:center;">
                <div style="font-size:10px; font-weight:700; color:#6b21a8;">1. เกิดขึ้นทั้งหมด</div>
                <div style="font-size:22px; font-weight:900; color:#7e22ce; margin:2px 0;">${actionTotal}</div>
                <div style="background:#f3e8ff; color:#7e22ce; font-size:9px; font-weight:900; padding:1px; border-radius:4px;">100%</div>
              </div>

              <!-- 2. Unassigned -->
              <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:8px 4px; text-align:center;">
                <div style="font-size:10px; font-weight:700; color:#166534;">2. รอแจกคนดูแล</div>
                <div style="font-size:22px; font-weight:900; color:#16a34a; margin:2px 0;">${unassignedList.length}</div>
                <div style="background:#dcfce7; color:#166534; font-size:9px; font-weight:900; padding:1px; border-radius:4px;">${actionTotal > 0 ? Math.round((unassignedList.length/actionTotal)*100) : 0}%</div>
              </div>

              <!-- 3. In Progress (รวม Review) -->
              <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:8px 4px; text-align:center;">
                <div style="font-size:10px; font-weight:700; color:#92400e;">3. กำลังดำเนินการ</div>
                <div style="font-size:22px; font-weight:900; color:#d97706; margin:2px 0;">${inProgressList.length}</div>
                <div style="background:#fef3c7; color:#92400e; font-size:9px; font-weight:900; padding:1px; border-radius:4px;">${actionTotal > 0 ? Math.round((inProgressList.length/actionTotal)*100) : 0}%</div>
              </div>

              <!-- 4. Done -->
              <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:8px 4px; text-align:center;">
                <div style="font-size:10px; font-weight:700; color:#1e40af;">4. ปิดงานแล้ว</div>
                <div style="font-size:22px; font-weight:900; color:#2563eb; margin:2px 0;">${doneTotal}</div>
                <div style="background:#dbeafe; color:#1e40af; font-size:9px; font-weight:900; padding:1px; border-radius:4px;">${actionTotal > 0 ? Math.round((doneTotal/actionTotal)*100) : 0}%</div>
              </div>
            </div>

            <div style="font-size:9.5px; color:#94a3b8; text-align:right; margin-top:6px;">
              ${actionConditionNote}
            </div>
          </div>
        </div>

        <!-- Executive Insights -->
        <div style="background:#090d16; border-radius:14px; padding:14px; color:#e2e8f0; display:flex; gap:12px; align-items:flex-start; border:1px solid #1e293b;">
          <div style="font-size:22px; background:rgba(245, 158, 11, 0.15); border:1px solid rgba(245, 158, 11, 0.3); padding:6px; border-radius:8px;">💡</div>
          <div style="flex:1;">
            <div style="border-bottom:1px solid #1e293b; padding-bottom:4px; margin-bottom:6px;">
              <span style="font-size:12.5px; font-weight:900; color:#fbbf24;">บทสรุปผู้บริหาร: ภาพรวมและแนวทางการพัฒนา KM (EXECUTIVE INSIGHTS)</span>
            </div>
            <ul style="margin:0; padding-left:0; list-style:none; font-size:11.5px; line-height:1.6;">
              <li><span style="color:#34d399; font-weight:900;">✔</span> วันที่ ${thDateStr} มีคิว LINE รวม ${totalCount} Sessions โดย AI ตอบจบเองได้ ${botCount} คิว (${botRate}%) ช่วยลดภาระการรอคอยของลูกค้า</li>
              <li><span style="color:#fbbf24; font-weight:900;">✔</span> มี ${handoffCount} คิว (${handoffRate}%) ที่ส่งต่อเจ้าหน้าที่ เพื่อดูแลและให้บริการเชิงลึก</li>
              <li><span style="color:#f87171; font-weight:900;">✔</span> พบคำถามที่ AI ยังตอบไม่ได้ (Knowledge Gap) ${gapCount} คำถาม แนะนำจัดทำ Article เพิ่มเติมเพื่อขยายฐานความรู้</li>
              <li><span style="color:#c084fc; font-weight:900;">✔</span> Action Items ปัญหาเนื้อหาเกิดขึ้น ${actionTotal} รายการ อยู่ระหว่างดำเนินการ ${inProgressList.length} รายการ และปิดแล้ว ${doneTotal} รายการ</li>
              <li><span style="color:#60a5fa; font-weight:900;">✔</span> <b>ข้อเสนอแนะ:</b> ติดตามงาน Action Items ที่ค้างอยู่ และนำ Gap ที่พบบ่อยไปอัปเดตระบบ เพื่อลดอัตรา Handoff อย่างต่อเนื่อง</li>
            </ul>
          </div>
        </div>

        <!-- Footer / Watermark -->
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:10px; margin-top:2px;">
          <div>สร้างเมื่อ ${thDateStr} ${nowStr} • CloudBplusAI Live Data • Product: <b>${prodFilter}</b></div>
          <div style="font-weight:bold; color:#475569;">ระบบสรุปวิเคราะห์งานบริการคิว LINE@ — Business Plus</div>
        </div>

      </div>

      <!-- ตารางพิสูจน์ข้อมูล (ธีม SP) -->
      <div class="sp-card" style="display:flex; flex-direction:column; gap:12px; background:var(--sp-panel);">
        <div class="sp-row sp-wrap" style="justify-content:space-between;">
          <div class="sp-seg" role="group" aria-label="หมวดตาราง">
            <button type="button" data-hubtab="all" class="${activeTab === 'all' ? 'sp-on' : ''}">ทั้งหมด (${totalCount})</button>
            <button type="button" data-hubtab="bot" class="${activeTab === 'bot' ? 'sp-on' : ''}">บอทจบ (${botCount})</button>
            <button type="button" data-hubtab="human" class="${activeTab === 'human' ? 'sp-on' : ''}">จนท. รับช่วง (${handoffCount})</button>
            <button type="button" data-hubtab="gap" class="${activeTab === 'gap' ? 'sp-on' : ''}">Gap (${gapCount})</button>
            <button type="button" data-hubtab="action" class="${activeTab === 'action' ? 'sp-on' : ''}">Action Items (${actionTotal})</button>
          </div>
          <span class="sp-note">ตารางเจาะลึกเพื่อตรวจสอบและพิสูจน์ตัวเลขที่มา</span>
        </div>

        ${activeTab === 'action' ? `
          <div class="sp-table-wrap" style="max-height:360px;">
            <table class="sp-table">
              <thead><tr><th>วันที่</th><th>รหัส</th><th>หัวข้อปัญหา / คำถามลูกค้า</th><th>ผู้รับผิดชอบ</th><th style="text-align:center;">สถานะ</th></tr></thead>
              <tbody>
                ${erpActionItems.map(it => `
                  <tr>
                    <td class="sp-mono" style="white-space:nowrap;">${formatThaiDate(it.created_at)}</td>
                    <td class="sp-mono" style="font-weight:700; color:var(--tc);">${SP.esc(it.action_code || '—')}</td>
                    <td>${SP.esc(it.title)}</td>
                    <td>${SP.esc(it.assignee_name || (it.assigned_to ? userMap[it.assigned_to] : 'ยังไม่มอบหมาย'))}</td>
                    <td style="text-align:center;"><span class="sp-tag">${SP.esc(it.status || '—')}</span></td>
                  </tr>
                `).join('') || '<tr><td colspan="5" class="sp-muted" style="text-align:center; padding:20px;">ไม่พบรายการ</td></tr>'}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="sp-table-wrap" style="max-height:360px;">
            <table class="sp-table">
              <thead><tr><th>เวลา</th><th>ชื่อบริษัท</th><th>Session Code</th><th>ข้อความลูกค้า (คำถาม)</th><th style="text-align:center;">ผู้รับผิดชอบ / สถานะ</th></tr></thead>
              <tbody>
                ${(activeTab === 'bot' ? botSessions : (activeTab === 'human' ? handoffSessions : (activeTab === 'gap' ? gapSessions : displaySessions))).map(s => {
                  const cust = getCustomerDisplay(s);
                  const staff = getStaffDisplay(s);
                  return `
                    <tr>
                      <td class="sp-mono" style="white-space:nowrap;">${formatTime(s.lastCustomerMsgAt || s.last_customer_msg_at || s.started_at)}</td>
                      <td style="font-weight:600;">${SP.esc(cust.company)}</td>
                      <td class="sp-mono sp-muted">#${SP.esc(s.session_code || '')}</td>
                      <td class="sp-ellipsis" style="max-width:320px;" title="${SP.esc(s.lastCustomerMessage || s.handoff_reason || '')}">${SP.esc(s.lastCustomerMessage || s.handoff_reason || '—')}</td>
                      <td style="text-align:center; white-space:nowrap;">${SP.esc(staff)}</td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="5" class="sp-muted" style="text-align:center; padding:20px;">ไม่พบรายการในหมวดนี้</td></tr>'}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  // 6. Download PNG function
  function downloadDashboardPNG() {
    loadHtmlToImage(async () => {
      const container = document.getElementById('bplus-line-capture-container');
      if (!container) { alert('กรุณากดดึงข้อมูลก่อนบันทึกภาพ'); return; }

      const dateVal = currentHubMode === 'daily' ? document.getElementById('hub-date-input').value : document.getElementById('hub-month-input').value;
      const prodFilter = document.getElementById('hub-product-select')?.value || 'Bplus ERP';

      const origBoxShadow = container.style.boxShadow;
      const origMargin = container.style.margin;

      try {
        container.style.margin = '20px auto';
        container.style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)';

        const blob = await window.htmlToImage.toBlob(container, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          skipFonts: true,
          cacheBust: true,
          style: {
            margin: '0',
            transform: 'none'
          }
        });

        if (!blob) { alert('ไม่สามารถสร้างรูปภาพได้'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `Bplus_LINE_Service_${prodFilter.replace(/\s+/g,'_')}_${dateVal}.png`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการสร้างภาพ PNG: ' + err);
      } finally {
        container.style.boxShadow = origBoxShadow;
        container.style.margin = origMargin;
      }
    });
  }

  // 7. Export CSV
  function exportFilteredCSV() {
    const displaySessions = getFilteredSessions();
    const prodFilter = document.getElementById('hub-product-select')?.value || 'Bplus ERP';
    const dateVal = currentHubMode === 'daily' ? document.getElementById('hub-date-input').value : document.getElementById('hub-month-input').value;

    let csv = "\uFEFF";
    csv += `สรุปงานบริการ LINE ประจำวัน (${prodFilter}) - วันที่ ${dateVal}\r\n\r\n`;

    if (activeTab === 'action') {
      csv += "วันที่,รหัส Action,หัวข้อ Action,ผู้รับผิดชอบ,สถานะ\r\n";
      const erpActionItems = cachedActionItems.filter(it => isTargetTeamActionItem(it, prodFilter));
      erpActionItems.forEach(it => {
        csv += `"${formatThaiDate(it.created_at)}","${it.action_code || ''}","${(it.title||'').replace(/"/g,'""')}","${(it.assignee_name||'').replace(/"/g,'""')}","${it.status||''}"\r\n`;
      });
    } else {
      csv += "เวลา,ชื่อบริษัท,LINE User ID,Session Code,ข้อความลูกค้า,สถานะ\r\n";
      displaySessions.forEach(s => {
        const cust = getCustomerDisplay(s);
        const staff = getStaffDisplay(s);
        csv += `"${formatTime(s.lastCustomerMsgAt || s.last_customer_msg_at || s.started_at)}","${cust.company.replace(/"/g,'""')}","${cust.lineId}","${s.session_code||''}","${(s.lastCustomerMessage||'').replace(/"/g,'""')}","${staff}"\r\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Bplus_LINE_Export_${prodFilter}_${dateVal}.csv`;
    link.click();
  }

  // ---------- Mount ลงใน pane ของ Drawer (แทน modal เดิม) ----------
  let lastDefaultProduct = null;
  function applyDefaultProduct(force) {
    const sel = document.getElementById('hub-product-select');
    const def = SP.deptValue('slaProduct');
    if (!sel) return;
    if (force || def !== lastDefaultProduct) {
      sel.value = def;
      lastDefaultProduct = def;
      if (hasFetched) renderUIFromCache();
    }
  }

  function mount(pane) {
    pane.innerHTML = `
      <div class="sp-pad sp-col" style="gap:14px;">
        <div class="sp-row sp-wrap" style="gap:10px;">
          <div class="sp-grow" style="min-width:200px;">
            <div class="sp-kicker" style="color:var(--tc)">SP · สรุป SLA</div>
            <div style="font-size:17px; font-weight:700; line-height:1.3;">สรุปงานบริการคิว LINE</div>
          </div>
          <div class="sp-seg" role="group" aria-label="ช่วงเวลา">
            <button type="button" id="hub-toggle-daily" class="sp-on">รายวัน</button>
            <button type="button" id="hub-toggle-monthly">รายเดือน</button>
          </div>
          <div id="hub-date-daily-wrap" style="display:flex;"><input type="date" id="hub-date-input" class="sp-input sp-mono" style="width:150px;" aria-label="วันที่"></div>
          <div id="hub-date-monthly-wrap" style="display:none;"><input type="month" id="hub-month-input" class="sp-input sp-mono" style="width:150px;" aria-label="เดือน"></div>
          <select id="hub-product-select" class="sp-select" style="width:160px;" aria-label="สินค้า">
            <option value="Bplus ERP">Bplus ERP</option>
            <option value="Bplus POS">Bplus POS</option>
            <option value="Bplus HRM">Bplus HRM</option>
            <option value="all">ทุกสินค้า (All)</option>
          </select>
          <button type="button" id="hub-fetch-btn" class="sp-btn">${SP.ICON.refresh.replace('<svg', '<svg width="14" height="14"')} ดึงข้อมูล</button>
          <button type="button" id="hub-export-btn" class="sp-btn" title="ส่งออกเป็น CSV">CSV</button>
          <button type="button" id="hub-btn-save-png" class="sp-btn sp-pri sp-lg" title="บันทึกภาพ PNG ความคมชัดสูง">บันทึก PNG</button>
        </div>

        <div id="hub-body" class="sp-col" style="gap:16px;">
          <div id="hub-prompt" class="sp-empty">
            <div style="font-size:15px; font-weight:700; color:var(--sp-text); margin-bottom:4px;">พร้อมดึงข้อมูลสรุปงานบริการคิว LINE</div>
            <div class="sp-note">เลือกวันที่หรือเดือน แล้วกด "ดึงข้อมูล"</div>
            <button type="button" id="hub-prompt-fetch-btn" class="sp-btn sp-pri" style="margin-top:14px;">ดึงข้อมูลทันที</button>
          </div>
          <div id="hub-loading" class="sp-empty" style="display:none;">
            <div class="sp-spin" style="font-size:22px;">${SP.ICON.refresh.replace('<svg', '<svg width="22" height="22"')}</div>
            <div style="margin-top:8px; font-weight:600; color:var(--sp-text);">กำลังประมวลผลข้อมูลสรุปคิว LINE และ Action Items...</div>
          </div>
          <div id="hub-content" style="display:none; flex-direction:column; gap:16px;"></div>
        </div>
      </div>`;

    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    document.getElementById('hub-date-input').value = today;
    document.getElementById('hub-month-input').value = today.slice(0, 7);
    applyDefaultProduct(true);

    document.getElementById('hub-fetch-btn').onclick = fetchAndRenderRealData;
    document.getElementById('hub-prompt-fetch-btn').onclick = fetchAndRenderRealData;
    document.getElementById('hub-btn-save-png').onclick = downloadDashboardPNG;
    document.getElementById('hub-export-btn').onclick = exportFilteredCSV;
    document.getElementById('hub-product-select').onchange = () => { if (hasFetched) renderUIFromCache(); };

    const bDaily = document.getElementById('hub-toggle-daily');
    const bMonthly = document.getElementById('hub-toggle-monthly');
    bDaily.onclick = () => {
      currentHubMode = 'daily';
      bDaily.classList.add('sp-on'); bMonthly.classList.remove('sp-on');
      document.getElementById('hub-date-daily-wrap').style.display = 'flex';
      document.getElementById('hub-date-monthly-wrap').style.display = 'none';
    };
    bMonthly.onclick = () => {
      currentHubMode = 'monthly';
      bMonthly.classList.add('sp-on'); bDaily.classList.remove('sp-on');
      document.getElementById('hub-date-daily-wrap').style.display = 'none';
      document.getElementById('hub-date-monthly-wrap').style.display = 'flex';
    };

    // แท็บตารางพิสูจน์ (แทน window.setHubTab เดิม)
    pane.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hubtab]');
      if (!b) return;
      activeTab = b.dataset.hubtab;
      renderUIFromCache();
    });

    SP.onSettings(() => applyDefaultProduct(false));
  }

  SP.registerTool({
    id: 'sla', tc: 'sla', feature: 'sla', paneId: 'sp-pane-sla',
    label: 'สรุป SLA',
    title: 'สรุปงานบริการคิว LINE รายวัน/รายเดือน + บันทึก PNG',
    desc: 'สรุปคิว LINE ประจำวัน จับภาพ PNG ส่งสรุปงานสิ้นวัน',
    width: () => 1140,
    mount
  });

  })();
