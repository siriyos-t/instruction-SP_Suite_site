  // =====================================================================
  //  MODULE: Action Items Overdue Supervisor Assistant (v3.0 → SP Suite)
  //  ทำงานได้ทุกหน้า (ดึงผ่าน /api/action-items โดยตรง)
  //  logic กรองแผนก / จัดกลุ่ม / ข้อความ LINE คงเดิม
  // =====================================================================
  (function () {
    let rawOverdueItems = [];
    let currentDept = 'ALL';        // 'ALL', 'ERP', 'SE', 'HRM'
    let filterSupportOnly = true;   // ซ่อน RD หรือคนนอกทีม
    let isFetching = false;
    let loadedOnce = false;
    let lastDefaultDept = null;

    async function apiRequest(endpoint) {
      const token = SP.getToken();
      if (!token) return null;
      const res = await SP.rawFetch(`/api${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) return null;
      return await res.json();
    }

    function getDaysOverdue(dueDateStr) {
      if (!dueDateStr) return 0;
      try {
        const due = new Date(dueDateStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
      } catch (e) { return 0; }
    }

    function detectDept(item) {
      const name = (item.assignee_name || '').toUpperCase();
      const pname = (item.product_name || '').toUpperCase();
      if (name.includes('ERP') || pname.includes('ERP')) return 'ERP';
      if (name.includes('SE') || pname.includes('POS') || name.includes('POS')) return 'SE';
      if (name.includes('HRM') || pname.includes('HRM') || name.includes('HR') || pname.includes('HR')) return 'HRM';
      return 'OTHER';
    }

    function isSupportTeam(item) {
      const name = item.assignee_name || '';
      if (name.startsWith('RD_') || name.includes('RD ')) return false;
      return true;
    }

    async function fetchOverdueData() {
      if (isFetching) return;
      isFetching = true;
      const refreshBtn = document.getElementById('bplus-refresh-btn');
      if (refreshBtn) refreshBtn.classList.add('sp-spin');
      try {
        const res = await apiRequest('/action-items?overdue=true&limit=250&sort_by=created_at:desc');
        const items = res && res.data ? res.data : [];
        rawOverdueItems = items.filter(it => getDaysOverdue(it.due_date) >= 1);
        loadedOnce = true;
        renderUI();
      } catch (err) {
        console.error('[SP Overdue] Error:', err);
      } finally {
        isFetching = false;
        if (refreshBtn) refreshBtn.classList.remove('sp-spin');
      }
    }

    function getFilteredAssignees() {
      let filtered = rawOverdueItems;
      if (currentDept !== 'ALL') {
        filtered = filtered.filter(it => detectDept(it) === currentDept);
      } else {
        filtered = filtered.filter(it => ['ERP', 'SE', 'HRM'].includes(detectDept(it)));
      }
      if (filterSupportOnly) filtered = filtered.filter(it => isSupportTeam(it));

      const map = {};
      filtered.forEach(it => {
        const name = it.assignee_name || 'ยังไม่ระบุผู้รับผิดชอบ';
        if (!map[name]) map[name] = { name, dept: detectDept(it), assignedToId: it.assigned_to, tasks: [] };
        map[name].tasks.push({
          id: it.id,
          title: it.title,
          daysOver: getDaysOverdue(it.due_date),
          dueDate: it.due_date ? it.due_date.substring(0, 10) : '—'
        });
      });
      return Object.values(map).sort((a, b) => b.tasks.length - a.tasks.length);
    }

    function actionItemsUrl(params) {
      const u = new URL(location.origin + '/action-items');
      Object.keys(params || {}).forEach(k => u.searchParams.set(k, params[k]));
      return u.toString();
    }

    function renderUI() {
      const assignees = getFilteredAssignees();
      const totalTasks = assignees.reduce((sum, a) => sum + a.tasks.length, 0);
      const totalPeople = assignees.length;
      const maxAll = assignees.reduce((m, a) => Math.max(m, ...a.tasks.map(t => t.daysOver)), 0);

      SP.setBadge('overdue', totalTasks, maxAll > 7);
      SP.setHomeStat('overdueTotal', totalTasks);

      const listContainer = document.getElementById('bplus-assignee-list');
      const headerBadge = document.getElementById('bplus-total-overdue-badge');
      const countSubtitle = document.getElementById('bplus-count-subtitle');
      if (!listContainer) return;

      if (headerBadge) headerBadge.textContent = `${totalTasks} งาน`;
      if (countSubtitle) {
        const deptText = currentDept === 'ALL' ? 'ERP • SE • HRM' : currentDept;
        countSubtitle.innerHTML = `เกินกำหนด <b>${totalTasks}</b> งาน (<b>${totalPeople}</b> คน) · <span style="color:var(--tc)">${deptText}</span>`;
      }

      listContainer.innerHTML = '';
      if (assignees.length === 0) {
        listContainer.innerHTML = `<div class="sp-empty" style="border-color:var(--sp-ok);color:var(--sp-ok)">ยอดเยี่ยม! ไม่มีงานเกินกำหนดในแผนกนี้</div>`;
        return;
      }

      assignees.forEach((person, idx) => {
        const count = person.tasks.length;
        const daysArr = person.tasks.map(t => t.daysOver);
        const minDays = Math.min(...daysArr);
        const maxDays = Math.max(...daysArr);
        const dayRangeStr = minDays === maxDays ? `${maxDays} วัน` : `${minDays}-${maxDays} วัน`;
        // สีตามระดับความค้าง: ≤2 วัน เหลือง, ≤7 ส้ม, >7 แดง
        const sev = maxDays <= 2 ? 'var(--sp-warn)' : (maxDays <= 7 ? '#FF9A4D' : 'var(--sp-err)');

        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--sp-raise);box-shadow:inset 3px 0 0 ${sev};`;
        row.innerHTML = `
          <span class="sp-mono sp-faint" style="font-size:11px;width:18px;text-align:center">${idx + 1}</span>
          <div class="sp-grow">
            <div class="sp-row" style="gap:6px">
              <span class="sp-ellipsis" style="font-weight:600;font-size:13px;max-width:190px" title="${SP.esc(person.name)}">${SP.esc(person.name)}</span>
              <span class="sp-tag">${person.dept}</span>
            </div>
            <div class="sp-muted" style="font-size:11.5px">เกิน <b style="color:${sev}">${dayRangeStr}</b></div>
          </div>
          <span class="sp-pill" style="background:${sev};color:#0A0A0B">${count} งาน</span>
          <button type="button" class="sp-ibtn" data-act="filter" title="เปิดหน้า Action Items เฉพาะงานของคนนี้" aria-label="กรองงานของ ${SP.esc(person.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          </button>
          <button type="button" class="sp-ibtn" data-act="pm" title="คัดลอกข้อความทักเดี่ยว" aria-label="คัดลอกข้อความทัก ${SP.esc(person.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>`;

        row.querySelector('[data-act="filter"]').addEventListener('click', () => {
          if (person.assignedToId) {
            window.location.href = actionItemsUrl({ assigned_to: String(person.assignedToId), overdue: 'true' });
          } else {
            alert('รายการนี้ยังไม่ถูกมอบหมาย (Unassigned)');
          }
        });
        row.querySelector('[data-act="pm"]').addEventListener('click', () => copySingleStaffMessage(person));
        listContainer.appendChild(row);
      });
    }

    function copyLineSummary() {
      const assignees = getFilteredAssignees();
      if (assignees.length === 0) { alert('ไม่มีข้อมูลงานเกินกำหนดในแผนกนี้'); return; }

      const totalTasks = assignees.reduce((sum, a) => sum + a.tasks.length, 0);
      const now = new Date();
      const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      const deptTitle = currentDept === 'ALL' ? 'ERP / SE / HRM' : currentDept;

      let msg = `📌 สรุปงาน Action Items เกินกำหนด [แผนก ${deptTitle}]\n`;
      msg += `⏰ ข้อมูล ณ ${dateStr} (${timeStr} น.)\n`;
      msg += `🚨 รวมค้างเกินกำหนด: ${totalTasks} รายการ (${assignees.length} คน)\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      assignees.forEach((p, i) => {
        const daysArr = p.tasks.map(t => t.daysOver);
        const minDays = Math.min(...daysArr);
        const maxDays = Math.max(...daysArr);
        const dayStr = minDays === maxDays ? `${maxDays} วัน` : `${minDays} - ${maxDays} วัน`;
        msg += `${i + 1}. คุณ${p.name} ➜ ${p.tasks.length} งาน (เกิน ${dayStr})\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `🔗 ตรวจสอบงาน: ${actionItemsUrl({ overdue: 'true' })}\n`;
      msg += `🙏 รบกวนพี่ๆ น้องๆ เร่งตรวจสอบและอัปเดตสถานะด้วยครับ`;

      SP.copyText(msg).then(() => SP.toast('คัดลอกสรุปส่ง LINE เรียบร้อยแล้ว', 'ovd'));
    }

    function copySingleStaffMessage(person) {
      let msg = `สวัสดีครับคุณ ${person.name} 🙏\n`;
      msg += `ขออนุญาตติดตามงาน Action Items ที่เกินกำหนด ${person.tasks.length} รายการครับ:\n\n`;
      person.tasks.forEach((t, i) => {
        msg += `${i + 1}. [ID ${t.id}] ${t.title}\n   📅 เกินกำหนด: ${t.daysOver} วัน (ครบกำหนด: ${t.dueDate})\n`;
      });
      msg += `\nรบกวนช่วยตรวจสอบและอัปเดตให้หน่อยนะครับ ขอบคุณมากครับ ✨`;
      SP.copyText(msg).then(() => SP.toast(`คัดลอกข้อความทักคุณ ${person.name} แล้ว`, 'ovd'));
    }

    function setDeptTab(dept) {
      currentDept = dept;
      document.querySelectorAll('#sp-pane-overdue [data-dept-tab]').forEach(b => b.classList.toggle('sp-on', b.dataset.deptTab === dept));
      renderUI();
    }

    function mount(pane) {
      pane.innerHTML = `
        <div class="sp-pad sp-col" style="gap:14px">
          <div class="sp-row">
            <div class="sp-grow">
              <div class="sp-kicker" style="color:var(--tc)">SP · Overdue</div>
              <div class="sp-row" style="gap:8px">
                <span style="font-size:17px;font-weight:700">งานเกินกำหนด</span>
                <span id="bplus-total-overdue-badge" class="sp-pill">0 งาน</span>
              </div>
              <div id="bplus-count-subtitle" class="sp-muted" style="font-size:12px">กดเปิดเพื่อโหลดข้อมูล</div>
            </div>
            <button type="button" id="bplus-refresh-btn" class="sp-ibtn" title="รีเฟรช" aria-label="รีเฟรช">${SP.ICON.refresh}</button>
          </div>
          <div class="sp-seg" role="group" aria-label="แผนก" style="display:flex">
            ${['ALL', 'ERP', 'SE', 'HRM'].map(d => `<button type="button" data-dept-tab="${d}" style="flex:1">${d === 'ALL' ? 'ทั้งหมด' : d}</button>`).join('')}
          </div>
          <label class="sp-check"><input type="checkbox" id="bplus-filter-support-cb" checked> เฉพาะทีม Support (ซ่อน RD)</label>
          <div id="bplus-assignee-list" class="sp-col" style="gap:6px"></div>
        </div>
        <div class="sp-foot">
          <span class="sp-note sp-grow">ข้อความพร้อมวางใน LINE</span>
          <button type="button" id="bplus-pro-line-btn" class="sp-btn sp-pri">คัดลอกสรุปส่ง LINE</button>
        </div>`;

      pane.querySelectorAll('[data-dept-tab]').forEach(b => b.addEventListener('click', () => setDeptTab(b.dataset.deptTab)));
      document.getElementById('bplus-filter-support-cb').addEventListener('change', (e) => { filterSupportOnly = e.target.checked; renderUI(); });
      document.getElementById('bplus-pro-line-btn').addEventListener('click', copyLineSummary);
      document.getElementById('bplus-refresh-btn').addEventListener('click', fetchOverdueData);

      applyDefaultDept();
      SP.onSettings(applyDefaultDept);

      // โหลดครั้งแรกแบบเงียบ ๆ เพื่อให้ badge บน dock มีตัวเลข
      const tryInitial = (n) => {
        if (!SP.feature('overdue')) return;
        if (SP.getToken()) fetchOverdueData();
        else if (n < 20) setTimeout(() => tryInitial(n + 1), 1500);
      };
      setTimeout(() => tryInitial(0), 2500);
      // รีเฟรชเบื้องหลังทุก 10 นาที
      setInterval(() => { if (SP.feature('overdue') && SP.getToken()) fetchOverdueData(); }, 600000);
    }

    function applyDefaultDept() {
      const def = SP.deptValue('overdueDept') || 'ALL';
      if (def !== lastDefaultDept) {
        lastDefaultDept = def;
        setDeptTab(def);
      }
    }

    SP.registerTool({
      id: 'overdue', tc: 'ovd', feature: 'overdue', paneId: 'sp-pane-overdue',
      label: 'Overdue',
      title: 'ติดตามงาน Action Items เกินกำหนด + ข้อความทวงงาน LINE',
      desc: 'ติดตามทวงงาน Action Items ที่เกินกำหนด คัดลอกข้อความส่ง LINE',
      width: 480,
      mount,
      onOpen() { if (!loadedOnce || !isFetching) fetchOverdueData(); }
    });
  })();
