  // =====================================================================
  //  UI SHELL — Dock (ปุ่มบนแถบ header) + Drawer (หน้าต่างคลี่ลงมา)
  //            + Home pane + Settings pane + Toast/Notice
  // =====================================================================
  const UI = SP.ui = { activeId: null, badges: {}, panes: {}, mounted: false };

  // ---------- Host ----------
  // เว็บนี้ให้ React render ลง <body> ตรง ๆ และจะล้างของใน body ตอน mount
  // ดังนั้น UI ทั้งหมดของ Suite ต้องอยู่ใน host ที่แขวนกับ <html> (นอก body) และคอยแขวนกลับถ้าหลุด
  SP.host = function () {
    let h = document.getElementById('sp-suite-host');
    if (!h) {
      h = document.createElement('div');
      h.id = 'sp-suite-host';
      h.className = 'sp-suite';
      h.style.cssText = 'position:static;margin:0;padding:0;';
    }
    if (!h.isConnected || h.parentNode !== document.documentElement) document.documentElement.appendChild(h);
    return h;
  };

  // ---------- Toast ----------
  SP.toast = function (text, tool) {
    if (!document.body) return;
    let stack = document.getElementById('sp-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'sp-toast-stack';
      stack.className = 'sp-suite sp-toast-stack';
      SP.host().appendChild(stack);
    }
    const t = document.createElement('div');
    t.className = `sp-toast sp-tc-${tool || 'home'}`;
    t.setAttribute('role', 'status');
    t.innerHTML = `<span class="sp-toast-mark">SP</span><span></span>`;
    t.lastChild.textContent = text;
    stack.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 260); }, 2600);
  };

  // ---------- Notice (การ์ดแจ้งเตือนมุมล่างซ้าย มีปุ่ม action) ----------
  SP.notice = function ({ id, title, html, tool, actions }) {
    const nid = id || 'sp-notice';
    const old = document.getElementById(nid);
    if (old) old.remove();          // สร้างใหม่ทุกครั้งเพื่อให้แอนิเมชันเด้งเล่นซ้ำ
    const n = document.createElement('div');
    n.id = nid;
    n.className = `sp-suite sp-notice sp-tc-${tool || 'home'}`;
    n.setAttribute('role', 'alert');
    n.innerHTML = `
      <div class="sp-row">
        <span class="sp-n-bell">${SP.ICON.bell}</span>
        <span class="sp-kicker">SP · แจ้งเตือน</span>
        <span class="sp-grow"></span>
        <button type="button" class="sp-n-x" data-x aria-label="ปิด">${SP.ICON.x}</button>
      </div>
      <div class="sp-n-title">${title}</div>
      <div class="sp-n-body">${html}</div>
      <div class="sp-row sp-wrap" data-acts></div>`;
    n.querySelector('[data-x]').onclick = () => n.remove();
    const box = n.querySelector('[data-acts]');
    (actions || []).forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-n-act';
      b.textContent = a.label;
      b.onclick = () => { n.remove(); a.fn(); };
      box.appendChild(b);
    });
    SP.host().appendChild(n);
  };

  // ---------- Badges ----------
  SP.setBadge = function (id, count, alert) {
    UI.badges[id] = { count: count || 0, alert: !!alert };
    renderBadges();
    if (UI.activeId === 'home') UI.renderHome();
  };
  function badgeText(n) { return n > 99 ? '99+' : String(n); }
  function renderBadges() {
    const dock = UI.dock;
    if (!dock) return;
    Object.keys(UI.badges).forEach(id => {
      const b = UI.badges[id];
      const btn = dock.querySelector(`[data-open="${id}"]`);
      if (!btn) return;
      const el = btn.querySelector('.sp-badge');
      if (el) {
        el.textContent = badgeText(b.count);
        el.classList.toggle('sp-show', b.count > 0);
      }
      btn.classList.toggle('sp-alert', !!b.alert && b.count > 0);
    });
    // badge รวมบนปุ่ม SP (โชว์ตอนย่อ dock)
    const sum = (UI.badges.overdue ? UI.badges.overdue.count : 0) + (UI.badges.qa ? UI.badges.qa.count : 0);
    const brandBadge = dock.querySelector('.sp-brand .sp-badge');
    if (brandBadge) {
      brandBadge.textContent = badgeText(sum);
      brandBadge.classList.toggle('sp-show', sum > 0 && SP.settings.collapsed);
    }
  }

  // ---------- Panes ----------
  function enabledTools() {
    return SP.tools.filter(t => SP.feature(t.feature || t.id));
  }
  function allPanes() {
    return [
      { id: 'home', label: 'หน้ารวม', tc: 'home', width: 460 },
      ...enabledTools(),
      { id: 'settings', label: 'ตั้งค่า', tc: 'set', width: 560 }
    ];
  }
  function paneDef(id) { return allPanes().find(p => p.id === id) || SP.tools.find(t => t.id === id); }

  // ---------- Dock ----------
  function buildDock() {
    const dock = document.createElement('nav');
    dock.className = 'sp-suite sp-dock';
    dock.setAttribute('aria-label', 'SP Support Tools');
    dock.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-open],[data-act]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.act === 'theme') {
        SP.saveSettings({ theme: { base: SP.settings.theme.base === 'light' ? 'dark' : 'light' } });
        renderDock();
        if (UI.activeId === 'settings') UI.renderSettings();
        return;
      }
      if (btn.dataset.act === 'collapse') {
        SP.saveSettings({ collapsed: !SP.settings.collapsed });
        return;
      }
      UI.toggle(btn.dataset.open);
    });
    UI.dock = dock;
    renderDock();
    return dock;
  }

  function renderDock() {
    const dock = UI.dock;
    if (!dock) return;
    const collapsed = !!SP.settings.collapsed;
    dock.classList.toggle('sp-collapsed', collapsed);
    dock.classList.toggle('sp-float', SP.settings.dockMode === 'float');
    const tools = enabledTools();
    dock.innerHTML = `
      <button type="button" class="sp-brand sp-tc-ovd" data-open="home" title="SP Suite — หน้ารวม">
        ${SP.ICON.grid}<span>SP·${SP.esc(SP.settings.dept || 'SET')}</span><span class="sp-badge" style="background:#0A0A0B;color:#FF6B5B"></span>
      </button>
      ${tools.length ? '<span class="sp-sep"></span>' : ''}
      ${tools.map(t => `
        <button type="button" class="sp-tb sp-tc-${t.tc}" data-open="${t.id}" title="${SP.esc(t.title || t.label)}">
          <span class="sp-dot"></span><span class="sp-lbl">${SP.esc(t.label)}</span><span class="sp-badge"></span>
        </button>`).join('')}
      <span class="sp-sep"></span>
      <button type="button" class="sp-tb sp-ic" data-act="theme" aria-label="สลับธีมสว่าง/มืด" title="${SP.settings.theme.base === 'light' ? 'เปลี่ยนเป็นธีมมืด' : 'เปลี่ยนเป็นธีมสว่าง'}">${SP.settings.theme.base === 'light' ? SP.ICON.moon : SP.ICON.sun}</button>
      <button type="button" class="sp-tb sp-ic" data-open="settings" aria-label="ตั้งค่า" title="ตั้งค่า">${SP.ICON.gear}</button>
      <button type="button" class="sp-tb sp-ic sp-keep" data-act="collapse" aria-label="${collapsed ? 'ขยายแถบเครื่องมือ' : 'ย่อแถบเครื่องมือ'}" title="${collapsed ? 'ขยาย' : 'ย่อ'}">${collapsed ? SP.ICON.left : SP.ICON.right}</button>`;
    markActive();
    renderBadges();
  }

  function markActive() {
    if (!UI.dock) return;
    UI.dock.querySelectorAll('[data-open]').forEach(b => b.classList.toggle('sp-on', b.dataset.open === UI.activeId));
  }

  let headerTries = 0;
  function findHeaderSlot() {
    const inp = document.querySelector('input[placeholder*="ค้นหา article"]') ||
                document.querySelector('header input[placeholder*="ค้นหา"]');
    if (!inp) return null;
    let el = inp;
    while (el.parentElement && el.parentElement !== document.body) {
      const par = el.parentElement;
      const cs = getComputedStyle(par);
      const r = par.getBoundingClientRect();
      if (cs.display.indexOf('flex') !== -1 && cs.flexDirection.indexOf('column') === -1 &&
          r.width > window.innerWidth * 0.45 && r.height < 120 && r.top < 90) {
        return { row: par, after: el };
      }
      el = par;
    }
    return null;
  }

  function placeDock() {
    if (!document.body) return;
    const dock = UI.dock || buildDock();
    if (SP.settings.dockMode === 'float') {
      dock.classList.remove('sp-fixed-top');
      dock.classList.add('sp-float');
      if (dock.parentElement !== SP.host()) SP.host().appendChild(dock);
      dock.dataset.slot = 'float';
      return;
    }
    dock.classList.remove('sp-float');
    if (dock.isConnected && dock.dataset.slot === 'header') return;
    const slot = findHeaderSlot();
    if (slot) {
      slot.after.insertAdjacentElement('afterend', dock);
      dock.classList.remove('sp-fixed-top');
      dock.dataset.slot = 'header';
      headerTries = 0;
      return;
    }
    headerTries++;
    if (headerTries > 6 && (!dock.isConnected || dock.dataset.slot !== 'fixed')) {
      dock.classList.add('sp-fixed-top');
      SP.host().appendChild(dock);
      dock.dataset.slot = 'fixed';
    }
  }

  // ---------- Drawer ----------
  function buildDrawer() {
    const d = document.createElement('section');
    d.className = 'sp-suite sp-drawer';
    d.setAttribute('aria-label', 'SP Suite');
    d.innerHTML = `
      <button type="button" class="sp-ibtn sp-drawer-x" data-close aria-label="พับเก็บ (Esc)" title="พับเก็บ (Esc)">${SP.ICON.x}</button>
      <div class="sp-drawer-body"></div>`;
    d.querySelector('[data-close]').onclick = () => UI.close();
    SP.host().appendChild(d);
    UI.drawer = d;
    UI.body = d.querySelector('.sp-drawer-body');

    // สร้าง pane ทุกตัวไว้ล่วงหน้า (ซ่อน) เพื่อให้ logic เบื้องหลัง เช่น แจ้งเตือนงานค้าง ทำงานได้ทันที
    const homePane = makePane('home', 'home');
    UI.homePane = homePane;
    SP.tools.forEach(t => {
      const p = makePane(t.id, t.tc, t.paneId);
      try { t.mount(p); } catch (e) { console.error('[SP Suite] mount', t.id, e); }
    });
    UI.settingsPane = makePane('settings', 'set');
    renderTabs();
  }

  function makePane(id, tc, domId) {
    const p = document.createElement('div');
    p.className = `sp-pane sp-tc-${tc}`;
    p.dataset.pane = id;
    if (domId) p.id = domId;
    UI.body.appendChild(p);
    UI.panes[id] = p;
    return p;
  }

  function renderTabs() {
    if (!UI.drawer) return;
    const tabs = UI.drawer.querySelector('.sp-tabs');
    if (!tabs) return;   // แท็บถูกเอาออกแล้ว (ใช้ปุ่มบนแถบแทน)
    tabs.innerHTML = allPanes().map(p => `
      <button type="button" role="tab" class="sp-tab sp-tc-${p.tc} ${p.id === UI.activeId ? 'sp-on' : ''}" data-tab="${p.id}" aria-selected="${p.id === UI.activeId}">
        <span class="sp-dot"></span>${SP.esc(p.label)}
      </button>`).join('');
  }

  function positionDrawer() {
    const d = UI.drawer, dock = UI.dock;
    if (!d || !dock) return;
    const def = paneDef(UI.activeId) || { width: 460 };
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(typeof def.width === 'function' ? def.width() : (def.width || 460), vw - 24);
    const r = dock.getBoundingClientRect();
    d.style.width = w + 'px';
    let right = Math.max(12, vw - r.right);
    if (vw - right - w < 12) right = Math.max(12, vw - w - 12);
    d.style.right = right + 'px';
    d.style.left = 'auto';
    if (dock.dataset.slot === 'float') {
      d.style.top = 'auto';
      d.style.bottom = (vh - r.top + 10) + 'px';
      d.style.maxHeight = Math.max(240, r.top - 26) + 'px';
      d.style.transformOrigin = 'bottom right';
    } else {
      const top = Math.max(8, r.bottom + 10);
      d.style.top = top + 'px';
      d.style.bottom = 'auto';
      d.style.maxHeight = Math.max(240, vh - top - 14) + 'px';
      d.style.transformOrigin = 'top right';
    }
    d.className = `sp-suite sp-drawer sp-tc-${def.tc || 'home'}${d.classList.contains('sp-open') ? ' sp-open' : ''}`;
  }

  UI.open = function (id) {
    if (!UI.drawer) return;
    const prevDef = paneDef(UI.activeId);
    if (prevDef && prevDef.canLeave && prevDef.id !== id && !prevDef.canLeave()) return;
    if (!paneDef(id)) id = 'home';
    UI.activeId = id;
    Object.keys(UI.panes).forEach(k => UI.panes[k].classList.toggle('sp-on', k === id));
    if (id === 'home') UI.renderHome();
    if (id === 'settings') UI.renderSettings();
    renderTabs();
    markActive();
    positionDrawer();
    UI.drawer.classList.add('sp-open');
    UI.body.scrollTop = 0;
    const def = paneDef(id);
    if (def && def.onOpen) { try { def.onOpen(); } catch (e) { console.error('[SP Suite]', e); } }
  };

  UI.close = function () {
    if (!UI.drawer) return;
    const def = paneDef(UI.activeId);
    if (def && def.canLeave && !def.canLeave()) return;
    UI.drawer.classList.remove('sp-open');
    UI.activeId = null;
    markActive();
  };

  UI.toggle = function (id) {
    if (UI.activeId === id && UI.drawer.classList.contains('sp-open')) UI.close();
    else UI.open(id);
  };
  SP.open = (id) => UI.open(id);

  // ---------- Home pane ----------
  SP.detectLegacy = function () {
    const ids = ['bplus-hub-launcher-btn', 'bplus-open-smart-return-btn', 'bplus-pro-overdue-tool', 'repair-btn',
      'bplus-fetch-profiles-btn', 'bplus-queue-search-wrap', 'bplus-right-fix-btn', 'bplus-modal-autofill-btn'];
    return ids.filter(id => document.getElementById(id));
  };

  UI.homeStats = {};  // โมดูลเติมค่าเข้ามา เช่น { myPending, closedToday, overdueTotal }
  SP.setHomeStat = (k, v) => { UI.homeStats[k] = v; if (UI.activeId === 'home') UI.renderHome(); };

  UI.renderHome = function () {
    const p = UI.homePane;
    if (!p) return;
    const st = UI.homeStats;
    const dept = SP.settings.dept;
    const tools = enabledTools();
    const legacy = SP.detectLegacy();
    const num = (v) => (v === undefined || v === null) ? '—' : v;
    const tweaksOn = SP.tweaks.filter(t => SP.feature(t.id));
    p.innerHTML = `
      <div class="sp-pad sp-col">
        <div class="sp-row">
          <div class="sp-grow">
            <div class="sp-kicker" style="color:var(--sp-accent-ink)">SP SUITE · ${SP.esc(dept || 'ยังไม่เลือกแผนก')}</div>
            <div style="font-size:18px;font-weight:700;line-height:1.3">${SP.user.fullName ? 'สวัสดี ' + SP.esc(SP.user.fullName) : 'ศูนย์รวมเครื่องมือ Support'}</div>
          </div>
          <span class="sp-pill">${SP.settings.role === 'staff' ? 'เจ้าหน้าที่' : 'หัวหน้า'}</span>
        </div>
        ${legacy.length ? `<div class="sp-warnbox"><b>พบสคริปต์เดิมยังเปิดอยู่</b> — ให้ปิดสคริปต์ 9 ตัวเดิมใน Tampermonkey เพื่อไม่ให้ทำงานซ้อนกัน <span class="sp-mono sp-faint">(${legacy.length} จุด)</span></div>` : ''}
        ${!dept ? `<div class="sp-warnbox" style="border-color:var(--sp-accent);background:var(--sp-accent-soft)">ยังไม่ได้เลือกแผนก — <button type="button" class="sp-btn sp-sm sp-accent" data-go="settings">ตั้งค่าแผนก</button></div>` : ''}
        <div class="sp-grid sp-g2">
          <div class="sp-kpi sp-tc-ovd"><span>Overdue (${SP.esc(SP.deptValue('overdueDept'))})</span><b style="color:var(--tc)">${num(st.overdueTotal)}</b></div>
          <div class="sp-kpi sp-tc-qa"><span>Action Items ค้างของฉัน</span><b style="color:var(--tc)">${num(st.myPending)}</b></div>
          <button type="button" class="sp-kpi sp-tc-bot" data-go="qa" style="text-align:left;cursor:pointer;font:inherit;color:inherit"><span>คิวที่ฉันรับช่วงค้าง</span><b style="color:var(--tc)">${num(st.myHandoff)}</b></button>
          <div class="sp-kpi"><span>ปิดงานวันนี้</span><b style="color:var(--sp-ok)">${num(st.closedToday)}</b></div>
        </div>
        <div>
          <div class="sp-section-t">เครื่องมือ</div>
          <div class="sp-col" style="gap:6px">
            ${tools.map(t => `
              <button type="button" class="sp-choice sp-tc-${t.tc}" data-go="${t.id}" style="flex-direction:row;align-items:center;gap:12px;width:100%">
                <span style="width:10px;height:10px;border-radius:50%;background:var(--tc);flex:none"></span>
                <span class="sp-grow" style="display:flex;flex-direction:column;gap:1px;font-size:12px;color:var(--sp-muted)">
                  <b style="font-size:13.5px;color:var(--sp-text)">${SP.esc(t.label)}</b>${SP.esc(t.desc || '')}
                </span>
                ${UI.badges[t.id] && UI.badges[t.id].count ? `<span class="sp-pill">${badgeText(UI.badges[t.id].count)}</span>` : ''}
              </button>`).join('') || '<div class="sp-note">ปิดเครื่องมือไว้ทั้งหมด — เปิดได้ที่ตั้งค่า</div>'}
          </div>
        </div>
        <div>
          <div class="sp-section-t">ตัวช่วยบนหน้าเว็บ · เปิด ${tweaksOn.length}/${SP.tweaks.length}</div>
          <div class="sp-row sp-wrap" style="gap:6px">
            ${SP.tweaks.map(t => `<span class="sp-tag" style="${SP.feature(t.id) ? 'color:var(--sp-text);border-color:var(--sp-accent-line)' : 'opacity:.55;text-decoration:line-through'}">${SP.esc(t.label)}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="sp-foot">
        <span class="sp-mono sp-faint" style="font-size:11px;flex:1">v${SP.VERSION} · Esc = พับเก็บ</span>
        <button type="button" class="sp-btn sp-sm" data-go="settings">${SP.ICON.gear.replace('<svg', '<svg width="14" height="14"')} ตั้งค่า</button>
      </div>`;
    p.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => UI.open(b.dataset.go); });
  };

  // ---------- Settings pane ----------
  const TWEAK_HELP = {};
  UI.renderSettings = function () {
    const p = UI.settingsPane;
    if (!p) return;
    const s = SP.settings;
    const dept = s.dept;
    const accent = SP.currentAccent();
    const dv = (k) => SP.esc(SP.deptValue(k));
    const toolRows = SP.tools.map(t => `
      <label class="sp-switch-row">
        <input type="checkbox" class="sp-switch" data-feature="${t.feature || t.id}" ${SP.feature(t.feature || t.id) ? 'checked' : ''}>
        <span class="sp-grow"><b style="display:block;font-size:13px">${SP.esc(t.label)}</b><span class="sp-note">${SP.esc(t.desc || '')}</span></span>
        <span class="sp-tc-${t.tc}" style="width:10px;height:10px;border-radius:50%;background:var(--tc);margin-top:6px"></span>
      </label>`).join('');
    const tweakRows = SP.tweaks.map(t => `
      <label class="sp-switch-row">
        <input type="checkbox" class="sp-switch" data-feature="${t.id}" ${SP.feature(t.id) ? 'checked' : ''}>
        <span class="sp-grow"><b style="display:block;font-size:13px">${SP.esc(t.label)}</b><span class="sp-note">${SP.esc(t.desc || '')}</span></span>
      </label>`).join('');

    p.innerHTML = `
      <div class="sp-pad sp-col" style="gap:20px">
        ${!dept ? `<div class="sp-warnbox" style="border-color:var(--sp-accent);background:var(--sp-accent-soft)"><b>ยินดีต้อนรับสู่ SP Suite</b><br>เลือกแผนกก่อน ระบบจะตั้งค่าเริ่มต้นของทุกเครื่องมือให้ตรงกับแผนกให้อัตโนมัติ</div>` : ''}

        <section>
          <div class="sp-section-t">1 · แผนกของคุณ</div>
          <div class="sp-grid sp-g3">
            ${Object.values(SP.DEPTS).map(d => `
              <button type="button" class="sp-choice ${dept === d.key ? 'sp-on' : ''}" data-dept="${d.key}">
                <b>${d.key}</b><span>${SP.esc(d.name)}</span>
                <span class="sp-mono" style="font-size:10.5px">${SP.esc(d.values.slaProduct)}</span>
              </button>`).join('')}
          </div>
          <div class="sp-row" style="margin-top:10px">
            <span class="sp-label" style="margin:0">บทบาท</span>
            <div class="sp-seg" role="group" aria-label="บทบาท">
              <button type="button" data-role="lead" class="${s.role !== 'staff' ? 'sp-on' : ''}">หัวหน้า</button>
              <button type="button" data-role="staff" class="${s.role === 'staff' ? 'sp-on' : ''}">เจ้าหน้าที่</button>
            </div>
            <span class="sp-note">เจ้าหน้าที่ = ซ่อน SLA / Overdue / คืน BOT ให้อัตโนมัติ</span>
          </div>
        </section>

        <section>
          <div class="sp-section-t">2 · ธีมสี</div>
          <div class="sp-row sp-wrap" style="gap:8px">
            <label class="sp-check"><input type="checkbox" data-theme-follow ${s.theme.followDept && !s.theme.custom ? 'checked' : ''}> ใช้สีประจำแผนก</label>
          </div>
          <div class="sp-row sp-wrap" style="gap:8px;margin-top:10px">
            ${Object.keys(SP.THEMES).map(k => `<button type="button" class="sp-swatch ${!s.theme.custom && SP.currentAccent() === SP.THEMES[k].accent ? 'sp-on' : ''}" data-preset="${k}" title="${SP.THEMES[k].name}" aria-label="${SP.THEMES[k].name}" style="background:${SP.THEMES[k].accent}"></button>`).join('')}
            <label class="sp-row" style="gap:6px;margin-left:6px">
              <input type="color" data-custom value="${accent}" style="width:34px;height:34px;border:0;padding:0;background:none;cursor:pointer" aria-label="กำหนดสีเอง">
              <span class="sp-note">กำหนดเอง</span>
            </label>
          </div>
          <div class="sp-row" style="margin-top:12px">
            <span class="sp-label" style="margin:0">ธีม</span>
            <div class="sp-seg" role="group" aria-label="พื้นหน้าต่าง">
              <button type="button" data-base="dark" class="${s.theme.base !== 'light' ? 'sp-on' : ''}">มืด</button>
              <button type="button" data-base="light" class="${s.theme.base === 'light' ? 'sp-on' : ''}">สว่าง</button>
            </div>
            <span class="sp-note">สลับเร็วได้จากปุ่ม ☀/☾ บนแถบ</span>
          </div>
          <div class="sp-row" style="margin-top:12px">
            <span class="sp-label" style="margin:0">ตำแหน่งแถบ</span>
            <div class="sp-seg" role="group" aria-label="ตำแหน่งแถบ">
              <button type="button" data-dock="header" class="${s.dockMode !== 'float' ? 'sp-on' : ''}">ฝังใน header</button>
              <button type="button" data-dock="float" class="${s.dockMode === 'float' ? 'sp-on' : ''}">ลอยมุมล่างขวา</button>
            </div>
          </div>
        </section>

        <section>
          <div class="sp-section-t">3 · เครื่องมือบนแถบ</div>
          <div>${toolRows}</div>
        </section>

        <section>
          <div class="sp-section-t">4 · ตัวช่วยบนหน้าเว็บ</div>
          <div>${tweakRows}</div>
        </section>

        <section>
          <div class="sp-row" style="margin-bottom:8px">
            <div class="sp-section-t sp-grow" style="margin:0">5 · ค่าเริ่มต้นของแผนก ${SP.esc(SP.dept())}</div>
            <button type="button" class="sp-btn sp-sm" data-reset-dept>คืนค่าแผนก</button>
          </div>
          <div class="sp-grid sp-g2">
            <div class="sp-field"><label class="sp-label" for="sp-dv-sla">สรุป SLA · สินค้าเริ่มต้น</label>
              <select class="sp-select" id="sp-dv-sla" data-dv="slaProduct">
                ${['Bplus ERP', 'Bplus POS', 'Bplus HRM', 'all'].map(v => `<option value="${v}" ${SP.deptValue('slaProduct') === v ? 'selected' : ''}>${v === 'all' ? 'ทุกสินค้า (All)' : v}</option>`).join('')}
              </select></div>
            <div class="sp-field"><label class="sp-label" for="sp-dv-ovd">Overdue · แท็บเริ่มต้น</label>
              <select class="sp-select" id="sp-dv-ovd" data-dv="overdueDept">
                ${['ALL', 'ERP', 'SE', 'HRM'].map(v => `<option value="${v}" ${SP.deptValue('overdueDept') === v ? 'selected' : ''}>${v === 'ALL' ? 'ทั้งหมด' : v}</option>`).join('')}
              </select></div>
            <div class="sp-field"><label class="sp-label" for="sp-dv-bot">คืน BOT · Product ที่ชื่อมีคำว่า</label>
              <input class="sp-input" id="sp-dv-bot" data-dv="botProductMatch" value="${dv('botProductMatch')}"></div>
            <div class="sp-field"><label class="sp-label" for="sp-dv-qid">คิว Handoff · ล็อก productId</label>
              <div class="sp-row"><input type="checkbox" class="sp-switch" data-dv-bool="queueLock" ${SP.deptValue('queueLock') ? 'checked' : ''} aria-label="เปิดล็อกคิว">
              <input class="sp-input sp-mono" id="sp-dv-qid" data-dv="queueProductId" value="${dv('queueProductId')}" style="width:70px">
              <input class="sp-input" data-dv="queueProductLabel" value="${dv('queueProductLabel')}" aria-label="ชื่อในดรอปดาวน์"></div></div>
          </div>
          <div class="sp-section-t" style="margin-top:16px">เติมข้อมูลโปรไฟล์ลูกค้าอัตโนมัติ</div>
          <div class="sp-grid sp-g2">
            <div class="sp-field"><label class="sp-label" for="sp-af1">ตำแหน่ง</label><input class="sp-input" id="sp-af1" data-dv="af_position" value="${dv('af_position')}"></div>
            <div class="sp-field"><label class="sp-label" for="sp-af2">บทบาท (Role)</label><input class="sp-input" id="sp-af2" data-dv="af_role" value="${dv('af_role')}"></div>
            <div class="sp-field"><label class="sp-label" for="sp-af3">เบอร์โทร</label><input class="sp-input sp-mono" id="sp-af3" data-dv="af_phone" value="${dv('af_phone')}"></div>
            <div class="sp-field"><label class="sp-label" for="sp-af4">อีเมล</label><input class="sp-input sp-mono" id="sp-af4" data-dv="af_email" value="${dv('af_email')}"></div>
            <div class="sp-field" style="grid-column:1/-1"><label class="sp-label" for="sp-af5">ความต้องการพิเศษ</label><input class="sp-input" id="sp-af5" data-dv="af_note" value="${dv('af_note')}"></div>
          </div>
        </section>

        <section>
          <div class="sp-section-t">6 · อื่น ๆ</div>
          <div class="sp-switch-row">
            <span class="sp-grow"><b style="display:block;font-size:13px">เวลาเริ่มเตือนคืน Bot ของฉัน</b><span class="sp-note">ถ้ายังมีคิวที่รับช่วงค้าง จะเด้งเตือนทุก 30 นาทีหลังเวลานี้</span></span>
            <input type="time" class="sp-input sp-mono" data-remind-time value="${SP.esc(s.remindTime || '17:00')}" style="width:120px">
            <button type="button" class="sp-btn sp-sm" data-remind-test>ทดลองเตือน</button>
          </div>
          <label class="sp-switch-row">
            <input type="checkbox" class="sp-switch" data-hide-legacy ${s.hideLegacy ? 'checked' : ''}>
            <span class="sp-grow"><b style="display:block;font-size:13px">ซ่อนปุ่มลอยของสคริปต์เดิม</b><span class="sp-note">กันหน้าจอรก กรณียังไม่ได้ปิดสคริปต์เก่าใน Tampermonkey</span></span>
          </label>
        </section>
      </div>
      <div class="sp-foot"><span class="sp-note sp-grow">บันทึกอัตโนมัติทุกครั้งที่เปลี่ยน · เก็บในเบราว์เซอร์เครื่องนี้</span><span class="sp-mono sp-faint" style="font-size:11px">v${SP.VERSION}</span></div>`;

    // ----- bind -----
    p.querySelectorAll('[data-dept]').forEach(b => b.onclick = () => {
      SP.saveSettings({ dept: b.dataset.dept });
      SP.toast(`ตั้งค่าเป็นแผนก ${b.dataset.dept} แล้ว`);
      UI.renderSettings();
    });
    p.querySelectorAll('[data-role]').forEach(b => b.onclick = () => {
      const lead = b.dataset.role === 'lead';
      SP.saveSettings({ role: b.dataset.role, features: { sla: lead, overdue: lead, bot: lead } });
      UI.renderSettings();
    });
    p.querySelector('[data-theme-follow]').onchange = (e) => {
      SP.saveSettings({ theme: { followDept: e.target.checked, custom: '' } });
      UI.renderSettings();
    };
    p.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
      SP.saveSettings({ theme: { preset: b.dataset.preset, custom: '', followDept: false } });
      UI.renderSettings();
    });
    p.querySelector('[data-custom]').oninput = (e) => {
      SP.settings.theme.custom = e.target.value;
      SP.settings.theme.followDept = false;
      SP.applyTheme();
    };
    p.querySelector('[data-custom]').onchange = () => { SP.saveSettings(); UI.renderSettings(); };
    p.querySelectorAll('[data-base]').forEach(b => b.onclick = () => { SP.saveSettings({ theme: { base: b.dataset.base } }); UI.renderSettings(); });
    p.querySelectorAll('[data-dock]').forEach(b => b.onclick = () => {
      SP.saveSettings({ dockMode: b.dataset.dock });
      if (UI.dock) { UI.dock.dataset.slot = ''; placeDock(); }
      UI.renderSettings();
      setTimeout(positionDrawer, 30);
    });
    p.querySelectorAll('[data-feature]').forEach(cb => cb.onchange = () => {
      SP.saveSettings({ features: { [cb.dataset.feature]: cb.checked } });
    });
    p.querySelectorAll('[data-dv]').forEach(inp => inp.onchange = () => {
      SP.setDeptValue(inp.dataset.dv, inp.value.trim());
      SP.saveSettings();
    });
    p.querySelectorAll('[data-dv-bool]').forEach(inp => inp.onchange = () => {
      SP.setDeptValue(inp.dataset.dvBool, inp.checked);
      SP.saveSettings();
    });
    p.querySelector('[data-reset-dept]').onclick = () => {
      SP.resetDeptValues();
      SP.toast(`คืนค่าเริ่มต้นแผนก ${SP.dept()} แล้ว`);
      UI.renderSettings();
    };
    p.querySelector('[data-remind-time]').onchange = (e) => SP.saveSettings({ remindTime: e.target.value || '17:00' });
    p.querySelector('[data-remind-test]').onclick = () => { if (SP.remindHandoffNow) SP.remindHandoffNow(); SP.toast('กำลังตรวจคิวของคุณ...', 'bot'); };
    p.querySelector('[data-hide-legacy]').onchange = (e) => SP.saveSettings({ hideLegacy: e.target.checked });
  };

  // ---------- Legacy hide ----------
  function applyLegacyHide() {
    let st = document.getElementById('sp-legacy-hide');
    if (!SP.settings.hideLegacy) { if (st) st.remove(); return; }
    if (!st) {
      st = SP.ensureStyle('sp-legacy-hide', '#bplus-hub-launcher-btn,#bplus-open-smart-return-btn,#bplus-pro-overdue-tool,#repair-btn,#bplus-action-toast{display:none!important}');
    }
  }

  // ---------- Boot ----------
  let lastSig = '';
  SP.onSettings(() => {
    SP.applyTheme();
    applyLegacyHide();
    const sig = JSON.stringify([SP.settings.dept, SP.settings.features, SP.settings.collapsed, SP.settings.dockMode]);
    if (sig !== lastSig) {
      lastSig = sig;
      renderDock();
      renderTabs();
      if (UI.activeId && !paneDef(UI.activeId)) UI.close();
      else if (UI.activeId) positionDrawer();
    }
  });

  SP.bootUI = function () {
    if (UI.mounted || !document.body) return;
    UI.mounted = true;
    SP.injectCSS();
    SP.applyTheme();
    applyLegacyHide();
    lastSig = JSON.stringify([SP.settings.dept, SP.settings.features, SP.settings.collapsed, SP.settings.dockMode]);
    buildDock();
    placeDock();
    buildDrawer();

    setInterval(() => {
      const host = SP.host();
      if (UI.drawer && UI.drawer.parentNode !== host) host.appendChild(UI.drawer);
      SP.injectCSS();
      if (!document.getElementById('sp-suite-vars') || document.getElementById('sp-suite-vars').parentNode !== host) SP.applyTheme();
      placeDock();
      if (UI.activeId && UI.drawer.classList.contains('sp-open')) positionDrawer();
    }, 1000);
    window.addEventListener('resize', () => { if (UI.activeId) positionDrawer(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && UI.activeId && UI.drawer.classList.contains('sp-open')) UI.close();
    });

    if (!SP.settings.dept) setTimeout(() => UI.open('settings'), 1200);
    setTimeout(() => {
      const legacy = SP.detectLegacy();
      if (legacy.length) SP.toast('พบสคริปต์เดิมยังเปิดอยู่ — ปิดใน Tampermonkey เพื่อไม่ให้ทำงานซ้อนกัน', 'ovd');
    }, 6000);
    SP.onUser(() => { if (UI.activeId === 'home') UI.renderHome(); });
  };
