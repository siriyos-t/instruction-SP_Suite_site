  // =====================================================================
  //  TWEAKS — ตัวช่วย 5 ตัวที่ทำงานบนหน้าเว็บโดยตรง
  //  ทุกตัวเช็คหน้า (path) + สวิตช์ในตั้งค่า "ตอนทำงานจริง" จึงปิด/เปิดได้ทันที
  //  ทุกปุ่ม/ป้ายที่ฉีดเข้าเว็บมีตรา "SP" เพื่อให้รู้ว่าเป็นส่วนเสริม
  // =====================================================================
  const QUEUE_PATH = '/handoff-queue';
  const HISTORY_PATH = '/customer-history';
  const on = (id) => SP.feature(id);

  function getLeftPanelCard(span) {
    if (!span || span.closest('.lg\\:col-span-3') || span.closest('[class*="context"]')) return null;
    const card = span.closest('button');
    if (card && card.parentElement && card.classList.contains('text-left') && !card.closest('.lg\\:col-span-3')) return card;
    let curr = span.parentElement;
    while (curr && curr !== document.body) {
      if (curr.closest && curr.closest('.lg\\:col-span-3')) return null;
      if (curr.tagName === 'BUTTON' && curr.classList.contains('text-left')) return curr;
      curr = curr.parentElement;
    }
    return null;
  }
  function leftSessionSpans(leftPanel, excludeRight) {
    return Array.from(leftPanel.querySelectorAll('*')).filter(el =>
      el.children.length === 0 && /^[sS]\d{10,}/i.test(el.textContent.trim()) &&
      (!excludeRight || !el.closest('.lg\\:col-span-3')) && !SP.isOurs(el)
    );
  }
  function setReactValue(el, val) {
    if (!el) return;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, val); else el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ---------------------------------------------------------------------
  // [ตัวช่วย 1] แสดงชื่อไลน์ + ค้นหาคิวด่วน + ล็อกคิวตามแผนก + กันเด้งจอเดี่ยว (v8.1)
  // ---------------------------------------------------------------------
  (function () {
    const sessionProfileMap = new Map();
    const userProfileCache = new Map();
    const sessionUserMap = new Map();
    let isFetchingProfiles = false;
    let isAutoReturning = false;

    try {
      const cachedData = sessionStorage.getItem('bplus_user_profile_cache_v6');
      if (cachedData) Object.entries(JSON.parse(cachedData)).forEach(([k, v]) => userProfileCache.set(k, v));
      const cachedSessions = sessionStorage.getItem('bplus_session_profile_cache_v6');
      if (cachedSessions) Object.entries(JSON.parse(cachedSessions)).forEach(([k, v]) => sessionProfileMap.set(k, v));
    } catch (e) {}

    function saveCacheToStorage() {
      try {
        const obj = {}; userProfileCache.forEach((v, k) => { obj[k] = v; });
        sessionStorage.setItem('bplus_user_profile_cache_v6', JSON.stringify(obj));
        const objS = {}; sessionProfileMap.forEach((v, k) => { objS[k] = v; });
        sessionStorage.setItem('bplus_session_profile_cache_v6', JSON.stringify(objS));
      } catch (e) {}
    }

    // 1) ขยาย limit 1,000 + ล็อก productId ตามแผนก (เฉพาะ request ของหน้าเว็บในหน้าคิว)
    SP.addRewriter((url) => {
      if (!on('t_line') || !SP.onPath(QUEUE_PATH)) return null;
      if (!(url.includes('handoff/queue') || url.includes('handoff/active-sessions'))) return null;
      let u = url;
      if (u.includes('limit=')) u = u.replace(/limit=\d+/, 'limit=1000');
      else u += (u.includes('?') ? '&' : '?') + 'limit=1000';
      if (SP.deptValue('queueLock')) {
        const pid = String(SP.deptValue('queueProductId') || '').trim();
        if (pid) {
          if (u.includes('productId=')) u = u.replace(/productId=[^&]+/, 'productId=' + encodeURIComponent(pid));
          else u += '&productId=' + encodeURIComponent(pid);
        }
      }
      return u;
    });
    SP.addResponseListener((url) => url.includes('handoff/queue'), (json) => {
      const items = json.data || (Array.isArray(json) ? json : []);
      if (!Array.isArray(items)) return;
      items.forEach(item => { if (item && item.session_code && item.external_user_id) sessionUserMap.set(item.session_code, item.external_user_id); });
      if (on('t_line')) renderBadgesOnCards();
    });

    function setBtn(btnEl, text, state) {
      if (!btnEl) return;
      btnEl.classList.remove('sp-busy', 'sp-good', 'sp-bad');
      if (state) btnEl.classList.add(state);
      btnEl.querySelector('.sp-t').textContent = text;
    }
    const BTN_IDLE = 'ดึงชื่อไลน์ & บริษัท';

    // 2) ดึง Profile (20 คิวล่าสุด ป้องกัน 429)
    async function fetchProfilesOnDemand(btnEl) {
      if (isFetchingProfiles) return;
      isFetchingProfiles = true;
      const token = SP.getToken();
      if (!token) { alert('ไม่พบ Token ระบบ กรุณารีเฟรชหน้าจอ 1 ครั้ง'); isFetchingProfiles = false; return; }
      const headers = { 'Authorization': `Bearer ${token}` };
      const reset = (ms) => setTimeout(() => { setBtn(btnEl, BTN_IDLE); isFetchingProfiles = false; }, ms);
      setBtn(btnEl, 'กำลังดึงข้อมูล...', 'sp-busy');

      try {
        const leftPanel = document.querySelector('.lg\\:col-span-2') || document;
        const targetSessions = [];
        leftSessionSpans(leftPanel, true).forEach(span => {
          const match = span.textContent.trim().match(/[sS]\d{10,}/i);
          if (match && !sessionProfileMap.has(match[0]) && !targetSessions.includes(match[0])) targetSessions.push(match[0]);
        });
        const limitedTargets = targetSessions.slice(0, 20);
        if (limitedTargets.length === 0) {
          renderBadgesOnCards();
          setBtn(btnEl, 'ข้อมูลครบแล้ว', 'sp-good');
          reset(1500);
          return;
        }

        let done = 0;
        const total = limitedTargets.length;
        for (const sId of limitedTargets) {
          setBtn(btnEl, `ดึงข้อมูล (${done + 1}/${total})...`, 'sp-busy');
          const extId = sessionUserMap.get(sId);
          let lastName = '', firstName = '', company = '';
          try {
            if (extId) {
              if (userProfileCache.has(extId)) {
                const p = userProfileCache.get(extId);
                lastName = (p.last_name || '').trim();
                firstName = (p.first_name || p.display_name || '').trim();
                company = (p.company_name || '').trim();
              } else {
                const res = await SP.rawFetch(`/api/customer-profiles?search=${encodeURIComponent(extId)}`, { headers });
                if (res.ok) {
                  const json = await res.json();
                  if (json.data && json.data.length > 0) {
                    const p = json.data[0];
                    userProfileCache.set(extId, p);
                    lastName = (p.last_name || '').trim();
                    firstName = (p.first_name || p.display_name || '').trim();
                    company = (p.company_name || '').trim();
                  }
                }
              }
            }
            if (!lastName && !firstName && !company) {
              const cRes = await SP.rawFetch(`/api/chatbot/handoff/${sId}/context`, { headers });
              if (cRes.ok) {
                const d = (await cRes.json()).data || {};
                firstName = (d.customerName || '').trim();
                company = (d.customerCompany || '').trim();
              }
            }
            if (lastName || firstName || company) sessionProfileMap.set(sId, { last_name: lastName, first_name: firstName, company_name: company });
          } catch (err) {}
          done++;
          await SP.delay(40);
        }
        saveCacheToStorage();
        renderBadgesOnCards();
        setBtn(btnEl, 'แสดงชื่อครบแล้ว', 'sp-good');
        reset(2000);
      } catch (e) {
        setBtn(btnEl, 'เกิดข้อผิดพลาด', 'sp-bad');
        reset(2000);
      }
    }

    // 3) ป้ายชื่อบนการ์ดคิวฝั่งซ้าย
    function renderBadgesOnCards() {
      const leftPanel = document.querySelector('.lg\\:col-span-2') || document;
      leftSessionSpans(leftPanel, true).forEach(span => {
        const match = span.textContent.trim().match(/[sS]\d{10,}/i);
        if (!match) return;
        const sId = match[0];
        const card = getLeftPanelCard(span);
        if (!card) return;
        const prof = sessionProfileMap.get(sId);
        if (!prof) return;
        const lastName = (prof.last_name || '').trim();
        const firstName = (prof.first_name || prof.display_name || '').trim();
        const company = (prof.company_name || '').trim();
        if (!lastName && !firstName && !company) return;

        let badge = card.querySelector('.bplus-customer-badge');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'bplus-customer-badge sp-inject-chip';
          card.appendChild(badge);
        }
        const nameParts = [];
        if (lastName && firstName && lastName.toLowerCase() === firstName.toLowerCase()) {
          nameParts.push(`<span class="sp-hi">${SP.esc(firstName)}</span>`);
        } else {
          if (lastName) nameParts.push(`<span class="sp-hi">${SP.esc(lastName)}</span>`);
          if (firstName) nameParts.push(`<span>${SP.esc(firstName)}</span>`);
        }
        const formatted = [];
        if (nameParts.length) formatted.push(nameParts.join(' '));
        if (company) formatted.push(`<span style="color:#047857">🏢 ${SP.esc(company)}</span>`);
        const html = `<span class="sp-mark">SP</span><span class="sp-txt">${formatted.join(' <span style="color:#94a3b8">·</span> ')}</span>`;
        if (badge.innerHTML !== html) badge.innerHTML = html;
        badge.title = [lastName, firstName].filter(Boolean).join(' ') + (company ? ` · ${company}` : '');
      });
    }

    // 4) ปุ่มดึงชื่อข้างแท็บ + ช่องค้นหาคิว
    function injectUI() {
      const leftPanel = document.querySelector('.lg\\:col-span-2');
      if (!leftPanel) return;
      const tabBtn = Array.from(leftPanel.querySelectorAll('button')).find(b => {
        const t = b.textContent.trim();
        return t === 'คิวรอ (Reactive)' || t === 'เข้ารับช่วงเอง' || (t.includes('Reactive') && t.includes('คิวรอ'));
      });
      const tabArea = (tabBtn && tabBtn.closest('div.flex')) || (tabBtn && tabBtn.parentElement);
      if (!tabArea) return;

      if (!tabArea.querySelector('#sp-fetch-profiles-btn')) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-left:auto;display:flex;align-items:center;';
        wrap.innerHTML = `<button id="sp-fetch-profiles-btn" type="button" class="sp-inject-btn"><span class="sp-mark">SP</span><span class="sp-t">${BTN_IDLE}</span></button>`;
        wrap.querySelector('button').addEventListener('click', function () { fetchProfilesOnDemand(this); });
        tabArea.style.display = 'flex';
        tabArea.style.alignItems = 'center';
        tabArea.appendChild(wrap);
      }

      if (!leftPanel.querySelector('#sp-queue-search-wrap')) {
        const wrap = document.createElement('div');
        wrap.id = 'sp-queue-search-wrap';
        wrap.className = 'sp-inject-search';
        wrap.innerHTML = `
          <div class="sp-box">
            <span class="sp-mark">SP</span>
            <input type="text" id="sp-queue-filter-input" placeholder="ค้นหาชื่อ / นามสกุล / บริษัท / Session..." aria-label="ค้นหาคิว">
            <button type="button" class="sp-clear" aria-label="ล้างคำค้น">✕</button>
          </div>
          <div class="sp-count" id="sp-filter-count"></div>`;
        tabArea.parentElement.insertBefore(wrap, tabArea.nextSibling);
        const input = wrap.querySelector('input');
        const clearBtn = wrap.querySelector('.sp-clear');

        function applyFilter() {
          const q = input.value.trim().toLowerCase();
          sessionStorage.setItem('bplus_queue_filter_query', q);
          clearBtn.style.display = q ? 'block' : 'none';
          let count = 0;
          leftSessionSpans(leftPanel, false).forEach(span => {
            const match = span.textContent.trim().match(/[sS]\d{10,}/i);
            const sId = match ? match[0] : '';
            const card = getLeftPanelCard(span);
            if (!card) return;
            const prof = sId ? sessionProfileMap.get(sId) : null;
            const profText = prof ? `${prof.first_name || ''} ${prof.last_name || ''} ${prof.company_name || ''}`.toLowerCase() : '';
            const cardText = (card.innerText || '').toLowerCase();
            const isMatch = !q || cardText.includes(q) || profText.includes(q) || (sId && sId.toLowerCase().includes(q));
            card.style.display = isMatch ? '' : 'none';
            if (isMatch) count++;
          });
          const countEl = document.getElementById('sp-filter-count');
          if (countEl) countEl.textContent = q ? `พบ ${count} รายการ` : '';
        }
        const savedQ = sessionStorage.getItem('bplus_queue_filter_query') || '';
        if (savedQ) { input.value = savedQ; setTimeout(applyFilter, 100); }
        input.addEventListener('input', applyFilter);
        clearBtn.addEventListener('click', () => { input.value = ''; applyFilter(); input.focus(); });
      }
    }

    function removeUI() {
      ['sp-queue-search-wrap'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
      const b = document.getElementById('sp-fetch-profiles-btn'); if (b) b.parentElement.remove();
      document.querySelectorAll('.bplus-customer-badge.sp-inject-chip').forEach(el => el.remove());
    }

    // 5) กันเด้งเข้าจอเดี่ยวเมื่อคลิกคิว "เจ้าหน้าที่ตอบ"
    document.addEventListener('click', function (e) {
      if (isAutoReturning || !on('t_line') || !SP.onPath(QUEUE_PATH)) return;
      const clickedCard = e.target.closest && e.target.closest('button.text-left');
      if (!clickedCard) return;
      const isLeftPanel = !clickedCard.closest('.lg\\:col-span-3') && !clickedCard.closest('[class*="context"]');
      if (!isLeftPanel) return;
      const activeTabBtn = document.querySelector('button.bg-blue-600, button.bg-primary-600');
      const isHumanQueue = clickedCard.textContent.includes('เจ้าหน้าที่ตอบ') || (activeTabBtn && activeTabBtn.textContent.includes('เจ้าหน้าที่ตอบ'));
      if (!isHumanQueue) return;
      const checkJump = setInterval(() => {
        const headerText = (document.querySelector('h1, h2, h3, header') || {}).textContent || '';
        const isSingleFocusMode = headerText.includes('จอรับช่วง') && headerText.includes('ตอบโต้ลูกค้ารายเดียว');
        const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('กลับหน้ารายการคิว') || b.textContent.includes('กลับหน้ารวม'));
        if (isSingleFocusMode && backBtn) {
          clearInterval(checkJump);
          isAutoReturning = true;
          backBtn.click();
          setTimeout(() => { isAutoReturning = false; renderBadgesOnCards(); }, 300);
        }
      }, 50);
      setTimeout(() => clearInterval(checkJump), 2000);
    }, true);

    // 6) เลือก dropdown สินค้าตามแผนกอัตโนมัติ (ครั้งเดียวต่อการเข้าหน้าคิว)
    let productSelected = false;
    function autoSelectProductUI() {
      if (productSelected || !SP.deptValue('queueLock')) return;
      const label = String(SP.deptValue('queueProductLabel') || '').trim();
      if (!label) return;
      const selectTrigger = document.querySelector('button[role="combobox"], button.w-\\[140px\\]');
      if (!selectTrigger || SP.isOurs(selectTrigger)) return;
      if (selectTrigger.textContent.trim().includes(label)) { productSelected = true; return; }
      selectTrigger.click();
      setTimeout(() => {
        const options = Array.from(document.querySelectorAll('div[role="option"], div[role="menuitem"], div[cmdk-item]'));
        const opt = options.find(el => el.textContent.trim().includes(label));
        if (opt) { opt.click(); productSelected = true; }
        else { document.body.click(); productSelected = true; }
      }, 50);
    }

    let wasOn = false;
    setInterval(() => {
      const active = on('t_line') && SP.onPath(QUEUE_PATH);
      if (!active) {
        if (wasOn) { removeUI(); wasOn = false; }
        if (!SP.onPath(QUEUE_PATH)) productSelected = false;
        return;
      }
      wasOn = true;
      injectUI();
      renderBadgesOnCards();
      autoSelectProductUI();
    }, 600);

    SP.registerTweak({ id: 't_line', label: 'ชื่อไลน์ + ค้นหาคิว', desc: 'หน้าคิว: ปุ่มดึงชื่อไลน์/บริษัท, ช่องค้นหาคิว, ล็อกคิวตามแผนก, กันเด้งเข้าจอเดี่ยว' });
  })();

  // ---------------------------------------------------------------------
  // [ตัวช่วย 2] ปุ่มลัดแก้ไขโปรไฟล์ลูกค้า (v3.2)
  // ---------------------------------------------------------------------
  (function () {
    const TARGET_PATH = '/customer-history';

    function getRightPanelCustomerName() {
      const allSvgs = Array.from(document.querySelectorAll('svg')).filter(svg => {
        if (SP.isOurs(svg)) return false;
        const cls = String(svg.getAttribute('class') || (svg.className && svg.className.baseVal) || '');
        return cls.includes('user') && svg.getBoundingClientRect().left > 350;
      });
      for (const svg of allSvgs) {
        const span = svg.parentElement;
        if (!span) continue;
        const fullText = span.textContent.trim();
        if (fullText && fullText.length >= 2 && !/จัดการ|ประวัติ|Staff|Dashboard|รับช่วง|เข้ารับช่วง/i.test(fullText)) {
          const cleanName = fullText.split(/[\s/]+/)[0].trim();
          if (cleanName && cleanName.length >= 2) return cleanName;
        }
      }
      return '';
    }

    function injectFixButton() {
      const rightSessionSpans = Array.from(document.querySelectorAll('*')).filter(el => {
        if (el.children.length > 0 || SP.isOurs(el)) return false;
        if (!/^S\d{10,}/.test(el.textContent.trim())) return false;
        const rect = el.getBoundingClientRect();
        return rect.left > 350 && rect.top > 0;
      });
      const existing = document.getElementById('sp-right-fix-btn');
      if (rightSessionSpans.length === 0) { if (existing) existing.remove(); return; }
      const sessionSpan = rightSessionSpans[0];
      if (sessionSpan.parentElement && sessionSpan.parentElement.querySelector('#sp-right-fix-btn')) return;
      if (existing) existing.remove();
      const btn = document.createElement('button');
      btn.id = 'sp-right-fix-btn';
      btn.type = 'button';
      btn.className = 'sp-inject-btn sp-red';
      btn.style.marginLeft = '10px';
      btn.innerHTML = '<span class="sp-mark">SP</span><span>แก้ไขโปรไฟล์ลูกค้า</span>';
      sessionSpan.after(btn);
    }

    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('#sp-right-fix-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const customerName = getRightPanelCustomerName();
      if (!customerName) {
        alert('หาชื่อลูกค้าจากแชทนี้ไม่เจอ กำลังพาไปหน้า "ประวัติ Chat ลูกค้า" ครับ');
        window.open(location.origin + TARGET_PATH, '_blank');
        return;
      }
      window.open(`${location.origin}${TARGET_PATH}?auto_search=${encodeURIComponent(customerName)}`, '_blank');
    }, true);

    setInterval(() => {
      if (on('t_profile_btn') && SP.onPath(QUEUE_PATH)) injectFixButton();
      else { const b = document.getElementById('sp-right-fix-btn'); if (b) b.remove(); }
    }, 300);

    // หน้า Customer History: ค้นหาชื่ออัตโนมัติแล้วกดปุ่มแก้ไข
    function runAutoSearch() {
      if (!on('t_profile_btn') || !SP.onPath(HISTORY_PATH)) return;
      const autoSearch = new URLSearchParams(location.search).get('auto_search');
      if (!autoSearch) return;
      let tries = 0;
      const checkTimer = setInterval(() => {
        if (++tries > 100) { clearInterval(checkTimer); return; }
        const filterContainers = Array.from(document.querySelectorAll('div')).filter(el => {
          const t = el.textContent || '';
          return t.includes('ตัวกรอง') && el.querySelector('input') && el.querySelector('button') && !SP.isOurs(el);
        });
        let targetInput = null, targetSearchBtn = null;
        for (let i = filterContainers.length - 1; i >= 0; i--) {
          const c = filterContainers[i];
          const inputs = Array.from(c.querySelectorAll('input[type="text"], input:not([type])')).filter(x => !SP.isOurs(x));
          const btns = Array.from(c.querySelectorAll('button')).filter(b => b.textContent.trim() === 'ค้นหา');
          if (inputs.length > 0 && btns.length > 0) { targetInput = inputs[0]; targetSearchBtn = btns[0]; break; }
        }
        if (targetInput && targetSearchBtn) {
          clearInterval(checkTimer);
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(targetInput, autoSearch);
          targetInput.dispatchEvent(new Event('input', { bubbles: true }));
          targetInput.dispatchEvent(new Event('change', { bubbles: true }));
          targetSearchBtn.click();
          let pencilAttempts = 0;
          const pencilTimer = setInterval(() => {
            const pencils = document.querySelectorAll('button svg.lucide-pen, button svg[class*="pen"], button svg[class*="edit"]');
            if (pencils.length === 1) { clearInterval(pencilTimer); pencils[0].closest('button').click(); }
            if (++pencilAttempts > 20) clearInterval(pencilTimer);
          }, 300);
        }
      }, 300);
    }
    SP.whenReady(runAutoSearch);

    SP.registerTweak({ id: 't_profile_btn', label: 'ปุ่มแก้ไขโปรไฟล์', desc: 'หน้าคิว: ปุ่ม "แก้ไขโปรไฟล์ลูกค้า" ข้างรหัส Session → เปิดหน้าประวัติ ค้นหาและกดแก้ไขให้' });
  })();

  // ---------------------------------------------------------------------
  // [ตัวช่วย 3] กันหน้าจอแชทเด้งลงล่างสุดอัตโนมัติ (v1.2)
  // ---------------------------------------------------------------------
  (function () {
    const active = () => on('t_scroll') && SP.onPath(QUEUE_PATH);
    const origScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args) {
      if (active() && this.closest && this.closest('.lg\\:col-span-3')) return;
      return origScrollIntoView.apply(this, args);
    };
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (desc && desc.set) {
      Object.defineProperty(Element.prototype, 'scrollTop', {
        set: function (val) {
          if (active()) {
            const isRightChat = this.closest && this.closest('.lg\\:col-span-3') &&
              this.className && typeof this.className === 'string' && this.className.includes('overflow-y-auto');
            if (isRightChat) {
              const isNearBottom = this.scrollHeight - this.scrollTop - this.clientHeight < 80;
              if (!isNearBottom && val > this.scrollTop) return;
            }
          }
          return desc.set.call(this, val);
        },
        get: desc.get,
        configurable: true
      });
    }
    document.addEventListener('click', (e) => {
      if (!active()) return;
      const card = e.target.closest && e.target.closest('.lg\\:col-span-2 button.text-left, .lg\\:col-span-2 button[type="button"]');
      if (card && /^[sS]\d{10,}/i.test(card.innerText)) {
        setTimeout(() => {
          const rightChatScroll = document.querySelector('.lg\\:col-span-3 div.overflow-y-auto');
          if (rightChatScroll) rightChatScroll.scrollTop = 0;
        }, 60);
      }
    }, true);

    SP.registerTweak({ id: 't_scroll', label: 'กันแชทเด้งลงล่าง', desc: 'หน้าคิว: ไม่ให้กล่องแชทขวาเด้งลงล่างสุดเองขณะอ่านข้อความเก่า (ปิดได้ถ้าอยากให้เลื่อนตามข้อความใหม่)' });
  })();

  // ---------------------------------------------------------------------
  // [ตัวช่วย 4] จัดเรียงคิวตามเวลาแชทล่าสุดจริง (v2.6)
  // ---------------------------------------------------------------------
  (function () {
    const sessionLatestTimeMap = new Map();

    function getBestTimestamp(item) {
      if (!item) return 0;
      let maxTs = 0;
      [item.lastCustomerMsgAt, item.last_customer_msg_at, item.handoff_at, item.bot_paused_at, item.created_at, item.started_at].forEach(t => {
        if (t) { const ts = new Date(t).getTime(); if (!isNaN(ts) && ts > maxTs) maxTs = ts; }
      });
      return maxTs;
    }
    function collect(items) {
      (items || []).forEach(item => {
        if (item && item.session_code) {
          const ts = getBestTimestamp(item);
          if (ts > 0) sessionLatestTimeMap.set(item.session_code, ts);
        }
      });
    }

    SP.addRewriter((url) => {
      if (!on('t_sort') || !SP.onPath(QUEUE_PATH) || !url.includes('handoff/queue')) return null;
      if (url.includes('limit=')) return url.replace(/limit=\d+/, 'limit=1000');
      return url + (url.includes('?') ? '&' : '?') + 'limit=1000';
    });
    SP.addResponseListener((url) => url.includes('handoff/queue'), (json) => {
      const items = json.data || (Array.isArray(json) ? json : []);
      if (Array.isArray(items)) { collect(items); if (on('t_sort') && SP.onPath(QUEUE_PATH)) sortAndFormatCards(); }
    });

    let preloaded = false;
    async function preloadBothQueues() {
      const token = SP.getToken();
      if (!token) return;
      preloaded = true;
      const headers = { 'Authorization': `Bearer ${token}` };
      try {
        const [resActive, resBot] = await Promise.all([
          SP.rawFetch('/api/chatbot/handoff/queue?mode=active&limit=1000', { headers }).then(r => r.json()).catch(() => ({ data: [] })),
          SP.rawFetch('/api/chatbot/handoff/queue?mode=bot&limit=1000', { headers }).then(r => r.json()).catch(() => ({ data: [] }))
        ]);
        collect([...(resActive.data || []), ...(resBot.data || [])]);
        sortAndFormatCards();
      } catch (e) {}
    }

    function formatThaiDateTime(ts) {
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    function sortAndFormatCards() {
      const leftPanel = document.querySelector('.lg\\:col-span-2');
      if (!leftPanel) return;
      leftSessionSpans(leftPanel, false).forEach(span => {
        const match = span.textContent.trim().match(/[sS]\d{10,}/i);
        if (!match) return;
        const sId = match[0];
        const card = getLeftPanelCard(span);
        if (!card || !card.parentElement) return;
        const listContainer = card.parentElement;
        if (listContainer.style.display !== 'flex') { listContainer.style.display = 'flex'; listContainer.style.flexDirection = 'column'; }

        let timestamp = sessionLatestTimeMap.get(sId);
        if (!timestamp) {
          const m = card.innerText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
          if (m) {
            let yr = parseInt(m[3], 10);
            if (yr > 2500) yr -= 543;
            timestamp = new Date(yr, parseInt(m[2], 10) - 1, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10)).getTime();
          }
        }
        if (timestamp && timestamp > 0) {
          const orderValue = String(-Math.floor(timestamp / 1000));
          if (card.style.order !== orderValue) card.style.order = orderValue;
          card.querySelectorAll('.bplus-realtime-badge').forEach(b => b.remove());
          let bottomBadge = card.querySelector('.bplus-bottom-time-badge');
          if (!bottomBadge) {
            bottomBadge = document.createElement('div');
            bottomBadge.className = 'bplus-bottom-time-badge sp-inject-time';
            card.appendChild(bottomBadge);
          }
          const html = `<span class="sp-mark">SP</span>อัปเดตล่าสุด ${formatThaiDateTime(timestamp)}`;
          if (bottomBadge.innerHTML !== html) bottomBadge.innerHTML = html;
        }
      });
    }

    setInterval(() => {
      if (!on('t_sort') || !SP.onPath(QUEUE_PATH)) {
        if (!SP.onPath(QUEUE_PATH)) preloaded = false;
        else document.querySelectorAll('.bplus-bottom-time-badge.sp-inject-time').forEach(el => el.remove());
        return;
      }
      if (!preloaded) preloadBothQueues();
      sortAndFormatCards();
    }, 800);

    SP.registerTweak({ id: 't_sort', label: 'เรียงคิวตามเวลาล่าสุด', desc: 'หน้าคิว: เรียงการ์ดตามเวลาแชทล่าสุดจริง (ดึงลึก 1,000 คิว) พร้อมป้ายเวลา' });
  })();

  // ---------------------------------------------------------------------
  // [ตัวช่วย 5] เติมข้อมูลโปรไฟล์ลูกค้าเริ่มต้น (v1.4) — ค่าเติมตามแผนก
  // ---------------------------------------------------------------------
  (function () {
    function fillProfileForm(modal) {
      if (!modal) return;
      const V = (k) => String(SP.deptValue(k) || '');
      const inputs = Array.from(modal.querySelectorAll('input, textarea')).filter(el => !SP.isOurs(el));
      let filledCount = 0;
      inputs.forEach(el => {
        const placeholder = (el.placeholder || '').toLowerCase();
        const name = (el.name || '').toLowerCase();
        const val = (el.value || '').trim();
        const label = (el.closest('div') && el.closest('div').parentElement && el.closest('div').parentElement.innerText) || '';

        if ((label.includes('ตำแหน่ง') || placeholder.includes('ตำแหน่ง') || name.includes('position') || name.includes('job')) && !val) {
          setReactValue(el, V('af_position')); filledCount++;
        }
        if ((placeholder.includes('08x') || placeholder.includes('xxx') || label.includes('เบอร์โทร') || label.includes('โทรศัพท์') || name.includes('phone') || name.includes('tel')) && !val) {
          setReactValue(el, V('af_phone')); filledCount++;
        }
        if ((placeholder.includes('@') || placeholder.includes('email') || label.includes('อีเมล') || name.includes('email')) && !val) {
          setReactValue(el, V('af_email')); filledCount++;
        }
        if (placeholder.includes('role') || placeholder.includes('owner') || label.includes('บทบาท')) {
          const wrap = el.closest('div');
          const hasExistingTags = wrap && wrap.querySelectorAll('span.rounded, div.rounded-full').length > 0;
          if (!hasExistingTags && !val) {
            setReactValue(el, V('af_role'));
            const addBtn = wrap && wrap.querySelector('button');
            if (addBtn) addBtn.click();
            filledCount++;
          }
        }
        if (el.tagName === 'TEXTAREA' && !val) { setReactValue(el, V('af_note')); filledCount++; }
      });
      const statusEl = modal.querySelector('#sp-fill-status');
      if (statusEl) {
        statusEl.textContent = `เติมเรียบร้อย (${filledCount} ช่อง)`;
        statusEl.style.display = 'inline';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
    }

    function injectButtonInsideModal() {
      const modal = Array.from(document.querySelectorAll('div[role="dialog"], div.fixed, div.z-50')).find(m => {
        if (SP.isOurs(m)) return false;
        const t = m.innerText || '';
        return t.includes('แก้ไขข้อมูลลูกค้า') || (t.includes('ชื่อจริง') && t.includes('ความสมบูรณ์ข้อมูล'));
      });
      if (!modal || modal.querySelector('#sp-modal-autofill-btn')) return;
      const titleEl = Array.from(modal.querySelectorAll('h2, h3, div, span')).find(el => el.textContent.trim().startsWith('แก้ไขข้อมูลลูกค้า'));
      if (!titleEl) return;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:12px;';
      wrap.innerHTML = `
        <button id="sp-modal-autofill-btn" type="button" class="sp-inject-btn sp-blue" title="ค่าที่เติมแก้ได้ใน SP Suite › ตั้งค่า"><span class="sp-mark">SP</span><span>เติมข้อมูลเริ่มต้น (${SP.esc(SP.dept())})</span></button>
        <span id="sp-fill-status" style="font-size:11px;color:#047857;font-weight:700;display:none"></span>`;
      wrap.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fillProfileForm(modal); });
      titleEl.appendChild(wrap);
    }

    setInterval(() => { if (on('t_autofill') && SP.onPath(HISTORY_PATH)) injectButtonInsideModal(); }, 500);

    SP.registerTweak({ id: 't_autofill', label: 'เติมโปรไฟล์อัตโนมัติ', desc: 'หน้าประวัติลูกค้า: ปุ่มเติมตำแหน่ง/เบอร์/อีเมล/บทบาท/หมายเหตุ ตามค่าของแผนก' });
  })();
