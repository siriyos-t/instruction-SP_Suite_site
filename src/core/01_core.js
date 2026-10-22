  // =====================================================================
  //  SP SUITE CORE — settings, department profiles, themes, fetch hub
  // =====================================================================
  const SP = {};
  window.__SP_SUITE__ = SP;
  SP.VERSION = '__VERSION__';

  // ---------- Raw fetch (ก่อนถูก patch) ----------
  // โมดูลของ Suite เรียก API ผ่าน rawFetch เสมอ เพื่อไม่ให้ตัวดักของ tweak
  // (เช่น ล็อก productId / limit) ไปแก้ request ของเครื่องมือเอง
  const rawFetch = window.fetch.bind(window);
  SP.rawFetch = rawFetch;

  // ---------- Utils ----------
  SP.$ = (sel, root) => (root || document).querySelector(sel);
  SP.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  SP.delay = (ms) => new Promise(r => setTimeout(r, ms));
  SP.onPath = (p) => location.pathname.startsWith(p);
  SP.esc = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  // element นี้เป็นของ Suite เองหรือไม่ (ใช้กันไม่ให้ตัวสแกนหน้าเว็บไปจับ UI ของเรา)
  SP.isOurs = (el) => !!(el && el.closest && el.closest('.sp-suite, #repair-panel'));

  SP.copyText = async function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  };

  // ---------- Department profiles ----------
  // ค่าเริ่มต้นของแต่ละแผนก — ผู้ใช้แก้ทับได้ในหน้าตั้งค่า (เก็บแยกต่อแผนก)
  SP.DEPTS = {
    ERP: {
      key: 'ERP', name: 'Support ERP', theme: 'lime',
      values: {
        slaProduct: 'Bplus ERP',
        overdueDept: 'ERP',
        botProductMatch: 'ERP',
        queueLock: true,
        queueProductId: '1',
        queueProductLabel: 'Bplus ERP',
        af_position: 'บัญชี',
        af_phone: '000-000-0000',
        af_email: 'UNKNOW@EMAIL.COM',
        af_role: 'บัญชี',
        af_note: 'ไม่มีข้อกำหนดพิเศษ'
      }
    },
    HRM: {
      key: 'HRM', name: 'Support HRM', theme: 'rose',
      values: {
        slaProduct: 'Bplus HRM',
        overdueDept: 'HRM',
        botProductMatch: 'HRM',
        queueLock: true,
        queueProductId: '3',
        queueProductLabel: 'Bplus HRM',
        af_position: 'ฝ่ายบุคคล',
        af_phone: '000-000-0000',
        af_email: 'UNKNOW@EMAIL.COM',
        af_role: 'ฝ่ายบุคคล',
        af_note: 'ไม่มีข้อกำหนดพิเศษ'
      }
    },
    SE: {
      key: 'SE', name: 'Support SE', theme: 'cyan',
      values: {
        slaProduct: 'Bplus POS',
        overdueDept: 'SE',
        botProductMatch: 'POS',
        queueLock: true,
        queueProductId: '2',
        queueProductLabel: 'Bplus POS',
        af_position: 'เจ้าของร้าน',
        af_phone: '000-000-0000',
        af_email: 'UNKNOW@EMAIL.COM',
        af_role: 'เจ้าของร้าน',
        af_note: 'ไม่มีข้อกำหนดพิเศษ'
      }
    }
  };

  // ---------- Theme presets ----------
  SP.THEMES = {
    lime:   { name: 'Neon Lime',  accent: '#C6F432' },
    cyan:   { name: 'Ice Cyan',   accent: '#4FD1FF' },
    rose:   { name: 'Hot Rose',   accent: '#FF7EB6' },
    amber:  { name: 'Amber',      accent: '#FFB547' },
    violet: { name: 'Violet',     accent: '#A78BFA' },
    mint:   { name: 'Mint',       accent: '#34E3A4' }
  };

  // ---------- Settings ----------
  const LS_KEY = 'sp_suite_settings_v1';
  const DEFAULT_SETTINGS = {
    dept: null,                 // null = ยังไม่ได้เลือก (เปิดหน้าตั้งค่าครั้งแรก)
    role: 'lead',               // lead = หัวหน้า, staff = เจ้าหน้าที่
    theme: { preset: 'lime', custom: '', base: 'light', followDept: true },
    remindTime: '17:00',        // เวลาเริ่มเตือนคืน Bot ของตัวเอง
    dockMode: 'header',         // header = ฝังในแถบบน, float = ลอยมุมล่างขวา
    collapsed: false,
    hideLegacy: true,
    features: {
      sla: true, overdue: true, bot: true, qa: true,
      t_line: true, t_profile_btn: true, t_scroll: true, t_sort: true, t_autofill: true, remind_handoff: true
    },
    deptValues: {}              // { ERP: {...override}, HRM: {...}, SE: {...} }
  };

  function deepMerge(base, extra) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(extra || {}).forEach(k => {
      const v = extra[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && base[k] !== null) {
        out[k] = deepMerge(base[k], v);
      } else {
        out[k] = v;
      }
    });
    return out;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) {}
    return deepMerge(DEFAULT_SETTINGS, {});
  }

  SP.settings = loadSettings();
  const settingListeners = [];
  SP.onSettings = (fn) => settingListeners.push(fn);
  SP.saveSettings = function (patch) {
    if (patch) SP.settings = deepMerge(SP.settings, patch);
    try { localStorage.setItem(LS_KEY, JSON.stringify(SP.settings)); } catch (e) {}
    settingListeners.forEach(fn => { try { fn(SP.settings); } catch (e) { console.error('[SP Suite]', e); } });
  };
  SP.feature = (id) => SP.settings.features[id] !== false;
  SP.dept = () => SP.settings.dept || 'ERP';
  SP.deptValue = function (key) {
    const d = SP.dept();
    const ov = (SP.settings.deptValues[d] || {});
    if (Object.prototype.hasOwnProperty.call(ov, key)) return ov[key];
    return SP.DEPTS[d].values[key];
  };
  SP.setDeptValue = function (key, val) {
    const d = SP.dept();
    const dv = Object.assign({}, SP.settings.deptValues);
    dv[d] = Object.assign({}, dv[d] || {}, { [key]: val });
    SP.settings.deptValues = dv;
  };
  SP.resetDeptValues = function () {
    const dv = Object.assign({}, SP.settings.deptValues);
    delete dv[SP.dept()];
    SP.settings.deptValues = dv;
    SP.saveSettings();
  };

  // ---------- Token + fetch hub ----------
  const hub = { rewriters: [], listeners: [], tokenListeners: [], token: '' };
  SP.getToken = function () {
    const t = hub.token || localStorage.getItem('bplus_ai_token') || localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    return String(t).replace(/^"|"$/g, '').trim();
  };
  SP.onToken = (fn) => hub.tokenListeners.push(fn);
  // rewriter(url) => url ใหม่ หรือ null/undefined ถ้าไม่แก้
  SP.addRewriter = (fn) => hub.rewriters.push(fn);
  // listener: { match(url) => bool, fn(json, url) }
  SP.addResponseListener = (match, fn) => hub.listeners.push({ match, fn });

  function captureToken(args) {
    let auth = '';
    const h = args[1] && args[1].headers;
    if (h) {
      if (typeof h.get === 'function') auth = h.get('Authorization') || h.get('authorization') || '';
      else auth = h['Authorization'] || h['authorization'] || '';
    }
    if (!auth && args[0] && typeof args[0] === 'object' && args[0].headers && typeof args[0].headers.get === 'function') {
      auth = args[0].headers.get('Authorization') || '';
    }
    if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const tok = auth.replace('Bearer ', '').trim();
      if (tok && tok !== hub.token) {
        hub.token = tok;
        hub.tokenListeners.forEach(fn => { try { fn(tok); } catch (e) {} });
      }
    }
  }

  window.fetch = async function (...args) {
    let url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    try { captureToken(args); } catch (e) {}

    if (url && hub.rewriters.length) {
      let next = url;
      hub.rewriters.forEach(rw => {
        try { const r = rw(next); if (r) next = r; } catch (e) {}
      });
      if (next !== url) {
        url = next;
        if (typeof args[0] === 'string') args[0] = url;
        else if (args[0] && args[0].url) args[0] = new Request(url, args[0]);
      }
    }

    const response = await rawFetch(...args);

    if (url && hub.listeners.length) {
      hub.listeners.forEach(l => {
        try {
          if (l.match(url)) {
            response.clone().json().then(j => l.fn(j, url)).catch(() => {});
          }
        } catch (e) {}
      });
    }
    return response;
  };

  // ---------- Current user (/auth/me) ----------
  SP.user = { id: null, fullName: '', username: '' };
  const userListeners = [];
  SP.onUser = (fn) => userListeners.push(fn);
  let userFetching = null;
  SP.fetchUser = function () {
    const token = SP.getToken();
    if (!token) return Promise.resolve(SP.user);
    if (userFetching) return userFetching;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload && payload.userId) SP.user.id = payload.userId;
      if (payload && payload.username) SP.user.username = payload.username;
    } catch (e) {}
    userFetching = rawFetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json && json.data) {
          SP.user.id = json.data.id;
          SP.user.fullName = json.data.fullName || json.data.full_name || json.data.name || SP.user.username || 'ผู้ใช้งาน';
          SP.user.username = json.data.username || SP.user.username;
          userListeners.forEach(fn => { try { fn(SP.user); } catch (e) {} });
        }
        return SP.user;
      })
      .catch(() => SP.user)
      .finally(() => { setTimeout(() => { userFetching = null; }, 30000); });
    return userFetching;
  };
  SP.onToken(() => { userFetching = null; SP.fetchUser(); });

  // ---------- Module registry ----------
  SP.tools = [];   // เครื่องมือที่มีปุ่มบน dock + pane ใน drawer
  SP.tweaks = [];  // ตัวช่วยที่ทำงานบนหน้าเว็บ (ไม่มี pane)
  SP.registerTool = (def) => SP.tools.push(def);
  SP.registerTweak = (def) => SP.tweaks.push(def);

  // ---------- DOM ready helper ----------
  SP.whenReady = function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fn(), { once: true });
    else fn();
  };
