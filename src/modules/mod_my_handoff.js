  // =====================================================================
  //  MODULE: คิวที่ฉันรับช่วงค้างอยู่ + เตือนคืน Bot ก่อนเลิกงาน (ส่วนตัว)
  //  ดึง /chatbot/handoff/queue?mode=human แล้วกรอง assigned_agent_id = ผู้ใช้ที่ล็อกอิน
  //  การ์ดแสดงในหน้า QA Repair (#sp-myhandoff-slot) · แจ้งเตือนเป็นการ์ดเด้งมุมซ้ายล่าง
  // =====================================================================
  (function () {
    let mine = [];
    let loading = false;
    let releasing = false;
    let lastRemindAt = 0;
    const REMIND_EVERY_MS = 30 * 60 * 1000;

    async function api(endpoint, options = {}) {
      const token = SP.getToken();
      if (!token) throw new Error('ไม่พบ Token');
      const res = await SP.rawFetch(`/api${endpoint}`, {
        ...options,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }

    function isMine(item) {
      const u = SP.user;
      if (u.id && item.assigned_agent_id !== undefined && item.assigned_agent_id !== null) return String(item.assigned_agent_id) === String(u.id);
      return !!(u.fullName && item.assigned_agent_name && item.assigned_agent_name.trim() === u.fullName.trim());
    }

    async function refresh() {
      if (loading || !SP.getToken()) return mine;
      loading = true;
      try {
        if (!SP.user.id) await SP.fetchUser();
        const res = await api('/chatbot/handoff/queue?mode=human&limit=1000');
        mine = (res.data || []).filter(isMine);
        SP.setHomeStat('myHandoff', mine.length);
        render();
      } catch (e) {
        console.error('[SP MyHandoff]', e);
      } finally {
        loading = false;
      }
      return mine;
    }

    function timeAgo(iso) {
      const t = new Date(iso).getTime();
      if (!t) return '';
      const m = Math.max(0, Math.round((Date.now() - t) / 60000));
      if (m < 60) return `${m} นาที`;
      const h = Math.floor(m / 60);
      return h < 24 ? `${h} ชม.` : `${Math.floor(h / 24)} วัน`;
    }

    function render() {
      const slot = document.getElementById('sp-myhandoff-slot');
      if (!slot) return;
      if (!SP.feature('remind_handoff')) { slot.innerHTML = ''; return; }
      const n = mine.length;
      slot.innerHTML = `
        <div class="sp-card sp-tc-bot" style="${n ? 'border-color:var(--tc);box-shadow:inset 4px 0 0 var(--tc)' : ''}">
          <div class="sp-card-t">
            <span>คิวที่ฉันรับช่วงค้างอยู่</span>
            <span class="sp-pill" style="${n ? '' : 'background:var(--sp-ok)'}">${n} คิว</span>
          </div>
          ${n ? `
            <div class="sp-col" style="gap:4px;max-height:180px;overflow:auto;margin-bottom:10px">
              ${mine.slice(0, 30).map(it => `
                <div class="sp-row" style="font-size:12px;gap:8px">
                  <span class="sp-mono" style="font-weight:700">${SP.esc(it.session_code)}</span>
                  <span class="sp-grow sp-ellipsis sp-muted" title="${SP.esc(it.lastCustomerMessage || '')}">${SP.esc(it.lastCustomerMessage || it.product_name || '')}</span>
                  <span class="sp-mono sp-faint" style="font-size:11px">${timeAgo(it.lastCustomerMsgAt || it.last_customer_msg_at || it.handoff_at)}</span>
                </div>`).join('')}
            </div>
            <div class="sp-row">
              <button type="button" class="sp-btn sp-grow" data-mh="refresh">${SP.ICON.refresh.replace('<svg', '<svg width="14" height="14"')} รีเฟรช</button>
              <button type="button" class="sp-btn sp-pri sp-grow" data-mh="release">คืน Bot ทั้งหมดของฉัน (${n})</button>
            </div>
            <div class="sp-note" style="margin-top:6px">จะเตือนทุก 30 นาทีตั้งแต่ ${SP.esc(SP.settings.remindTime || '17:00')} น. ถ้ายังมีคิวค้าง</div>
          ` : `
            <div class="sp-note" style="color:var(--sp-ok)">ไม่มีคิวค้าง — เคลียร์ครบแล้ว</div>
            <button type="button" class="sp-btn sp-sm" data-mh="refresh" style="margin-top:8px">${SP.ICON.refresh.replace('<svg', '<svg width="13" height="13"')} ตรวจอีกครั้ง</button>
          `}
        </div>`;
      slot.querySelectorAll('[data-mh="refresh"]').forEach(b => b.onclick = refresh);
      const rb = slot.querySelector('[data-mh="release"]');
      if (rb) rb.onclick = releaseAllMine;
    }

    async function releaseAllMine() {
      if (releasing) return;
      await refresh();
      if (!mine.length) { SP.toast('ไม่มีคิวค้างแล้ว', 'bot'); return; }
      if (!confirm(`คืน Bot ให้คิวที่คุณรับช่วงอยู่ทั้งหมด ${mine.length} คิว?\n\nคิวเหล่านี้จะกลับไปให้ Bot ตอบลูกค้าต่อทันที`)) return;
      releasing = true;
      let ok = 0, fail = 0;
      const codes = mine.map(x => x.session_code);
      for (let i = 0; i < codes.length; i += 5) {
        await Promise.all(codes.slice(i, i + 5).map(async code => {
          try {
            await api(`/chatbot/handoff/${encodeURIComponent(code)}/release`, { method: 'POST', body: JSON.stringify({ note: 'คืน Bot โดยเจ้าของคิว (SP Suite)' }) });
            ok++;
          } catch (e) { fail++; }
        }));
        await SP.delay(100);
      }
      releasing = false;
      const notice = document.getElementById('sp-handoff-notice');
      if (notice) notice.remove();
      SP.toast(`คืน Bot แล้ว ${ok} คิว${fail ? ` · ไม่สำเร็จ ${fail}` : ''}`, 'bot');
      refresh();
    }

    function afterRemindTime() {
      const [h, m] = String(SP.settings.remindTime || '17:00').split(':').map(Number);
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes() >= (h || 0) * 60 + (m || 0);
    }

    async function remindTick(force) {
      if (!SP.feature('remind_handoff') || !SP.getToken()) return;
      await refresh();
      if (!mine.length) return;
      if (!force && (!afterRemindTime() || Date.now() - lastRemindAt < REMIND_EVERY_MS)) return;
      lastRemindAt = Date.now();
      SP.notice({
        id: 'sp-handoff-notice',
        tool: 'bot',
        title: `ยังมี ${mine.length} คิวที่คุณรับช่วงค้างอยู่`,
        html: `ก่อนเลิกงานอย่าลืมคืน Bot ให้คิวที่คุยจบแล้ว ลูกค้าจะได้ไม่ค้างรอเจ้าหน้าที่<br><span style="font-family:'JetBrains Mono',monospace;font-size:11.5px">${mine.slice(0, 3).map(x => SP.esc(x.session_code)).join(' · ')}${mine.length > 3 ? ' …' : ''}</span>`,
        actions: [
          { label: `คืน Bot ทั้งหมด (${mine.length})`, fn: releaseAllMine },
          { label: 'ดูรายการ', fn: () => SP.open('qa') }
        ]
      });
    }
    SP.remindHandoffNow = () => remindTick(true);

    SP.whenReady(() => {
      setTimeout(() => remindTick(false), 8000);
      setInterval(() => remindTick(false), 5 * 60 * 1000);
    });
    SP.onSettings(render);

    // เมื่อเปิดหน้า QA Repair ให้รีเฟรชรายการ
    const qa = SP.tools.find(t => t.id === 'qa');
    if (qa) {
      const prev = qa.onOpen;
      qa.onOpen = function () { if (prev) prev(); if (SP.feature('remind_handoff')) refresh(); };
    }

    SP.registerTweak({ id: 'remind_handoff', label: 'เตือนคืน Bot ของฉัน', desc: 'แสดงคิวที่ฉันรับช่วงค้างไว้ (ในหน้า QA Repair) และเด้งเตือนให้กดคืน Bot ทุก 30 นาทีหลังเวลาที่ตั้งไว้' });
  })();
