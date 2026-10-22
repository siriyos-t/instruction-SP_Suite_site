  // =====================================================================
  //  MODULE: Smart Bot Return Tool (v2.0 → SP Suite)
  //  ทำงานได้ทุกหน้า ผ่าน /api/chatbot/handoff/queue และ /{code}/release
  //  ตัวกรอง / พรีวิว / เลือกทีละรายการ / คืนทีละ 5 คิวพร้อมกัน — คงเดิม
  // =====================================================================
  (function () {
    let productsList = [];
    let fetchedSessions = [];
    let selectedSessionCodes = new Set();
    let isProcessing = false;
    let shouldStop = false;
    let lastMatch = null;

    async function apiRequest(endpoint, options = {}) {
      const token = SP.getToken();
      if (!token) throw new Error('ไม่พบ Token ในระบบ กรุณาเข้าสู่ระบบก่อน');
      const res = await SP.rawFetch(`/api${endpoint}`, {
        ...options,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const errJson = await res.json(); msg = errJson.message || msg; } catch (e) {}
        throw new Error(msg);
      }
      return await res.json();
    }

    function selectDeptProduct(force) {
      const select = document.getElementById('bplus-filter-product');
      if (!select || !productsList.length) return;
      const match = String(SP.deptValue('botProductMatch') || '').trim().toUpperCase();
      if (!force && match === lastMatch) return;
      lastMatch = match;
      if (!match) { select.value = 'all'; return; }
      const p = productsList.find(x => String(x.name || x.code || '').toUpperCase().includes(match));
      select.value = p ? String(p.id) : 'all';
    }

    async function loadProducts() {
      try {
        const res = await apiRequest('/products');
        if (res.success && Array.isArray(res.data)) {
          productsList = res.data;
          const select = document.getElementById('bplus-filter-product');
          if (select) {
            select.innerHTML = '<option value="all">ทุก Product (ทั้งหมด)</option>';
            productsList.forEach(p => {
              const opt = document.createElement('option');
              opt.value = p.id;
              opt.textContent = `${p.id}. ${p.name || p.code}`;
              select.appendChild(opt);
            });
            selectDeptProduct(true);
          }
        }
      } catch (e) {
        console.error('[SP BotReturn] Load products error:', e);
      }
    }

    function formatDate(isoStr) {
      if (!isoStr) return '—';
      try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (e) { return isoStr; }
    }

    async function fetchQueueData() {
      const productVal = document.getElementById('bplus-filter-product').value;
      const modeVal = document.querySelector('#sp-pane-bot input[name="bplus_filter_mode"]:checked').value;
      const dateFromVal = document.getElementById('bplus-filter-date-from').value;
      const dateToVal = document.getElementById('bplus-filter-date-to').value;
      const searchKeyword = document.getElementById('bplus-filter-search').value.trim().toLowerCase();
      const maxLimitVal = parseInt(document.getElementById('bplus-filter-limit').value, 10) || 300;
      const previewStatus = document.getElementById('bplus-preview-status');
      previewStatus.innerHTML = '<span style="color:var(--tc)">กำลังดึงข้อมูลจากระบบ กรุณารอสักครู่...</span>';

      let modes = [];
      if (modeVal === 'waiting') modes = ['waiting'];
      else if (modeVal === 'human') modes = ['human'];
      else modes = ['waiting', 'human'];

      let allItems = [];
      try {
        for (const m of modes) {
          let url = `/chatbot/handoff/queue?mode=${m}&limit=${maxLimitVal}`;
          if (productVal && productVal !== 'all') url += `&productId=${productVal}`;
          const res = await apiRequest(url);
          if (res.data && Array.isArray(res.data)) allItems.push(...res.data);
        }

        const filtered = allItems.filter(item => {
          const dateTarget = item.handoff_at || item.started_at || item.lastCustomerMsgAt;
          if (dateTarget) {
            const itemDate = new Date(dateTarget);
            if (dateFromVal && itemDate < new Date(dateFromVal + 'T00:00:00')) return false;
            if (dateToVal && itemDate > new Date(dateToVal + 'T23:59:59.999')) return false;
          }
          if (searchKeyword) {
            const haystack = [item.session_code, item.product_name, item.lastCustomerMessage, item.handoff_reason,
              item.channel_name, item.assigned_agent_name, item.external_user_id].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(searchKeyword)) return false;
          }
          return true;
        });

        fetchedSessions = filtered;
        selectedSessionCodes = new Set(filtered.map(x => x.session_code));
        renderTable();
        previewStatus.innerHTML = `ดึงข้อมูลสำเร็จ: พบ <b style="color:var(--tc)">${filtered.length}</b> รายการ (จากทั้งหมด ${allItems.length} คิวในระบบ)`;
      } catch (err) {
        console.error('[SP BotReturn] Fetch queue error:', err);
        previewStatus.innerHTML = `<span style="color:var(--sp-err)">ดึงข้อมูลล้มเหลว: ${SP.esc(err.message)}</span>`;
      }
    }

    function renderTable() {
      const tbody = document.getElementById('bplus-table-tbody');
      const countInfo = document.getElementById('bplus-selected-count-info');
      const executeBtn = document.getElementById('bplus-execute-btn');
      const selectAllCb = document.getElementById('bplus-select-all-cb');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (fetchedSessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="sp-muted" style="text-align:center;padding:36px 16px">ไม่พบรายการคิวตามเงื่อนไขที่ระบุ (ลองปรับตัวกรองหรือเพิ่มขอบเขตการค้นหา)</td></tr>`;
        countInfo.textContent = 'เลือก 0 / 0 รายการ';
        executeBtn.disabled = true;
        selectAllCb.checked = false;
        return;
      }

      selectAllCb.checked = selectedSessionCodes.size === fetchedSessions.length;

      fetchedSessions.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.id = `row-${item.session_code}`;
        const isChecked = selectedSessionCodes.has(item.session_code);
        const isWaiting = item.handoff_mode === 'waiting';
        const modeBadge = isWaiting
          ? '<span class="sp-pill" style="background:var(--sp-warn);color:#0A0A0B">รอรับช่วง</span>'
          : '<span class="sp-pill" style="background:var(--sp-sla);color:#0A0A0B">เจ้าหน้าที่ตอบ</span>';
        const lastMsg = item.lastCustomerMessage ? SP.esc(item.lastCustomerMessage) : '—';
        const reason = item.handoff_reason ? SP.esc(item.handoff_reason.split('\n')[0]) : '—';
        const timeStr = formatDate(item.handoff_at || item.started_at);

        tr.innerHTML = `
          <td style="text-align:center"><input type="checkbox" class="bplus-row-cb" data-code="${SP.esc(item.session_code)}" ${isChecked ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--tc);cursor:pointer" aria-label="เลือก ${SP.esc(item.session_code)}"></td>
          <td class="sp-mono sp-faint">${index + 1}</td>
          <td class="sp-mono" style="font-weight:700"><span id="badge-${SP.esc(item.session_code)}">${SP.esc(item.session_code)}</span></td>
          <td><div style="font-weight:600">${SP.esc(item.product_name || '—')}</div><div class="sp-muted" style="font-size:11px">${SP.esc(item.channel_name || '')}</div></td>
          <td style="text-align:center">${modeBadge}</td>
          <td class="sp-muted" style="font-size:11px;white-space:nowrap">${timeStr}</td>
          <td style="max-width:300px">
            <div class="sp-ellipsis" title="${lastMsg}">${lastMsg}</div>
            <div class="sp-ellipsis sp-faint" style="font-size:11px" title="${reason}">เหตุผล: ${reason}</div>
          </td>`;

        tr.querySelector('.bplus-row-cb').addEventListener('change', (e) => {
          if (e.target.checked) selectedSessionCodes.add(item.session_code);
          else selectedSessionCodes.delete(item.session_code);
          updateSelectionState();
        });
        tbody.appendChild(tr);
      });
      updateSelectionState();
    }

    function updateSelectionState() {
      const countInfo = document.getElementById('bplus-selected-count-info');
      const executeBtn = document.getElementById('bplus-execute-btn');
      const selectAllCb = document.getElementById('bplus-select-all-cb');
      const total = fetchedSessions.length;
      const selected = selectedSessionCodes.size;
      countInfo.innerHTML = `เลือก <b class="sp-mono">${selected}</b> / <b class="sp-mono">${total}</b> รายการ`;
      selectAllCb.checked = total > 0 && selected === total;
      if (selected > 0 && !isProcessing) {
        executeBtn.disabled = false;
        executeBtn.textContent = `ยืนยันคืน Bot (${selected} รายการ)`;
      } else {
        executeBtn.disabled = true;
        executeBtn.textContent = 'ยืนยันคืน Bot (เลือกอย่างน้อย 1 รายการ)';
      }
    }

    async function executeRelease() {
      if (selectedSessionCodes.size === 0 || isProcessing) return;
      const count = selectedSessionCodes.size;
      const confirmMsg = `⚠️ ยืนยันการคืน BOT ให้กับคิวที่เลือกไว้ทั้งหมด ${count} รายการ?\n\nเมื่อดำเนินการแล้ว Session เหล่านี้จะถูกส่งกลับไปให้ Bot ตอบลูกค้าต่อทันที`;
      if (!confirm(confirmMsg)) return;

      isProcessing = true;
      shouldStop = false;
      const executeBtn = document.getElementById('bplus-execute-btn');
      const stopBtn = document.getElementById('bplus-stop-btn');
      const progressBox = document.getElementById('bplus-modal-progress-box');
      const progressBar = document.getElementById('bplus-modal-progress-bar');
      const progressText = document.getElementById('bplus-modal-progress-text');
      const liveStatus = document.getElementById('bplus-modal-live-status');

      executeBtn.style.display = 'none';
      stopBtn.style.display = 'inline-flex';
      stopBtn.disabled = false;
      stopBtn.textContent = 'หยุดการทำงาน';
      progressBox.style.display = 'block';

      const codesToProcess = Array.from(selectedSessionCodes);
      let successCount = 0;
      let failCount = 0;
      const CONCURRENCY = 5;

      for (let i = 0; i < codesToProcess.length; i += CONCURRENCY) {
        if (shouldStop) break;
        const chunk = codesToProcess.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(async (code) => {
          const row = document.getElementById(`row-${code}`);
          const badge = document.getElementById(`badge-${code}`);
          try {
            liveStatus.textContent = `กำลังคืน: ${code}...`;
            await apiRequest(`/chatbot/handoff/${encodeURIComponent(code)}/release`, {
              method: 'POST',
              body: JSON.stringify({ note: 'คืน Bot ผ่าน Smart Return Preview Tool' })
            });
            successCount++;
            selectedSessionCodes.delete(code);
            if (row) {
              row.classList.add('sp-done');
              if (badge) badge.innerHTML = `<span style="color:var(--sp-ok);font-weight:700">✓ คืนแล้ว</span> <span class="sp-faint" style="font-size:11px">(${SP.esc(code)})</span>`;
              const cb = row.querySelector('.bplus-row-cb');
              if (cb) { cb.checked = false; cb.disabled = true; }
            }
          } catch (e) {
            failCount++;
            console.error(`[SP BotReturn] Failed to release ${code}:`, e);
            if (badge) badge.innerHTML = `<span style="color:var(--sp-err)">✗ ผิดพลาด</span> (${SP.esc(code)})`;
          }
        }));
        const doneTotal = successCount + failCount;
        const pct = Math.round((doneTotal / codesToProcess.length) * 100);
        progressBar.style.width = `${pct}%`;
        progressText.textContent = `${doneTotal}/${codesToProcess.length} (${pct}%) · สำเร็จ ${successCount} · ล้มเหลว ${failCount}`;
        await new Promise(r => setTimeout(r, 100));
      }

      isProcessing = false;
      executeBtn.style.display = 'inline-flex';
      stopBtn.style.display = 'none';
      updateSelectionState();

      if (shouldStop) {
        liveStatus.textContent = 'หยุดการทำงานชั่วคราวแล้ว';
        alert(`⏹️ หยุดการทำงานแล้ว\nคืน Bot สำเร็จ: ${successCount} รายการ\nล้มเหลว: ${failCount} รายการ`);
      } else {
        progressBar.style.width = '100%';
        liveStatus.textContent = 'ดำเนินการเสร็จสมบูรณ์ทุกรายการที่เลือก';
        alert(`🎉 เสร็จสิ้นเรียบร้อย!\nคืน Bot สำเร็จทั้งหมด: ${successCount} รายการ\n(ล้มเหลว: ${failCount} รายการ)`);
      }
    }

    function mount(pane) {
      pane.innerHTML = `
        <div class="sp-pad sp-col" style="gap:14px">
          <div>
            <div class="sp-kicker" style="color:var(--tc)">SP · คืน BOT</div>
            <div style="font-size:17px;font-weight:700;line-height:1.3">คืน BOT พร้อมพรีวิว &amp; กรองเฉพาะรายการ</div>
            <div class="sp-note">เลือก Product ช่วงวันที่ คำค้นหา แล้วติ๊กเฉพาะรายการที่ต้องการก่อนส่งคืน Bot</div>
          </div>
          <div class="sp-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            <div class="sp-field"><label class="sp-label" for="bplus-filter-product">Product</label>
              <select id="bplus-filter-product" class="sp-select"><option value="all">กำลังโหลด Product...</option></select></div>
            <div class="sp-field"><label class="sp-label" for="bplus-filter-date-from">ตั้งแต่วันที่</label>
              <input type="date" id="bplus-filter-date-from" class="sp-input sp-mono"></div>
            <div class="sp-field"><label class="sp-label" for="bplus-filter-date-to">ถึงวันที่</label>
              <input type="date" id="bplus-filter-date-to" class="sp-input sp-mono"></div>
            <div class="sp-field"><label class="sp-label" for="bplus-filter-search">ค้นหาข้อความ / Session Code</label>
              <input type="text" id="bplus-filter-search" class="sp-input" placeholder="พิมพ์คำถามลูกค้า หรือรหัส..."></div>
          </div>
          <div class="sp-row sp-wrap" style="justify-content:space-between;gap:12px">
            <div class="sp-row sp-wrap" style="gap:14px" role="radiogroup" aria-label="สถานะคิว">
              <span class="sp-label" style="margin:0">สถานะคิว</span>
              <label class="sp-check"><input type="radio" name="bplus_filter_mode" value="waiting" checked> ค้างรอรับช่วง (Waiting)</label>
              <label class="sp-check"><input type="radio" name="bplus_filter_mode" value="human"> จนท. ตอบ (Human)</label>
              <label class="sp-check"><input type="radio" name="bplus_filter_mode" value="both"> ทั้งสองสถานะ</label>
            </div>
            <div class="sp-row" style="gap:8px">
              <label class="sp-label" for="bplus-filter-limit" style="margin:0">ดึงสูงสุด</label>
              <select id="bplus-filter-limit" class="sp-select" style="width:110px">
                <option value="100">100 คิว</option><option value="300" selected>300 คิว</option>
                <option value="500">500 คิว</option><option value="1000">1,000 คิว</option>
              </select>
              <button type="button" id="bplus-preview-search-btn" class="sp-btn sp-pri">ค้นหาและดูพรีวิว</button>
            </div>
          </div>
          <div id="bplus-preview-status" class="sp-note">กด "ค้นหาและดูพรีวิว" เพื่อดึงรายการคิวมาแสดงในตาราง</div>
          <div class="sp-table-wrap" style="max-height:min(52vh,520px)">
            <table class="sp-table">
              <thead><tr>
                <th style="width:44px;text-align:center"><input type="checkbox" id="bplus-select-all-cb" style="width:16px;height:16px;accent-color:var(--tc);cursor:pointer" aria-label="เลือกทั้งหมด"></th>
                <th style="width:40px">#</th><th style="width:150px">Session Code</th><th style="width:180px">Product / Channel</th>
                <th style="width:130px;text-align:center">สถานะ</th><th style="width:150px">เวลา Handoff</th><th>ข้อความลูกค้าล่าสุด / สาเหตุ</th>
              </tr></thead>
              <tbody id="bplus-table-tbody">
                <tr><td colspan="7" class="sp-muted" style="text-align:center;padding:44px 16px">ยังไม่มีข้อมูลพรีวิว — กำหนดเงื่อนไขแล้วกด "ค้นหาและดูพรีวิว"</td></tr>
              </tbody>
            </table>
          </div>
          <div id="bplus-modal-progress-box" style="display:none">
            <div class="sp-row" style="justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:6px">
              <span id="bplus-modal-live-status">กำลังดำเนินการ...</span>
              <span id="bplus-modal-progress-text" class="sp-mono">0/0</span>
            </div>
            <div class="sp-bar" style="height:10px"><i id="bplus-modal-progress-bar" style="width:0%"></i></div>
          </div>
        </div>
        <div class="sp-foot">
          <span id="bplus-selected-count-info" class="sp-grow sp-muted">เลือก 0 / 0 รายการ</span>
          <button type="button" id="bplus-stop-btn" class="sp-btn sp-danger" style="display:none">หยุดการทำงาน</button>
          <button type="button" id="bplus-execute-btn" class="sp-btn sp-pri sp-lg" disabled>ยืนยันคืน Bot (เลือกอย่างน้อย 1 รายการ)</button>
        </div>`;

      document.getElementById('bplus-preview-search-btn').addEventListener('click', fetchQueueData);
      document.getElementById('bplus-select-all-cb').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        pane.querySelectorAll('.bplus-row-cb').forEach(cb => {
          if (!cb.disabled) {
            cb.checked = isChecked;
            const code = cb.getAttribute('data-code');
            if (isChecked) selectedSessionCodes.add(code); else selectedSessionCodes.delete(code);
          }
        });
        updateSelectionState();
      });
      document.getElementById('bplus-execute-btn').addEventListener('click', executeRelease);
      document.getElementById('bplus-stop-btn').addEventListener('click', (e) => {
        shouldStop = true;
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = 'กำลังหยุด...';
      });
      document.getElementById('bplus-filter-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchQueueData(); });
      SP.onSettings(() => selectDeptProduct(false));
    }

    SP.registerTool({
      id: 'bot', tc: 'bot', feature: 'bot', paneId: 'sp-pane-bot',
      label: 'คืน BOT',
      title: 'คืน BOT แบบพรีวิวและเลือกรายการ',
      desc: 'ส่งคิวกลับให้ Bot ตอบต่อ (ใช้สิ้นวัน / ก่อนเริ่มงานเช้า)',
      width: () => 1100,
      mount,
      async onOpen() {
        if (!productsList.length) await loadProducts();
        if (fetchedSessions.length === 0) fetchQueueData();
      },
      canLeave() {
        if (!isProcessing) return true;
        if (!confirm('ระบบกำลังคืน Bot อยู่ ต้องการปิดหน้าต่างใช่หรือไม่? (การประมวลผลจะหยุดลง)')) return false;
        shouldStop = true;
        return true;
      }
    });
  })();
