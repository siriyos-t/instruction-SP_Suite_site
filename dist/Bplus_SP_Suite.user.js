// ==UserScript==
// @name         Bplus SP Suite — All-in-One Support Tools
// @namespace    https://cloudbplusai.bplus.co.th/
// @version      2.1.1
// @description  รวม 9 เครื่องมือ Support (SLA Hub, Overdue, คืน BOT, QA Repair + ตัวช่วย 5 ตัว) เป็นแถบเดียวบน header — ตั้งค่าตามแผนก ERP / HRM / SE และเลือกธีมสีได้
// @author       Nueng (ERP Support) & Claude
// @match        https://cloudbplusai.bplus.co.th/*
// @match        https://appbplusai.bplus.co.th/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ───────────── core/01_core.js ─────────────
  // =====================================================================
  //  SP SUITE CORE — settings, department profiles, themes, fetch hub
  // =====================================================================
  const SP = {};
  window.__SP_SUITE__ = SP;
  SP.VERSION = '2.1.1';

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

  // ───────────── core/02_theme.js ─────────────
  // =====================================================================
  //  THEME — CSS variables (--sp-*) + component classes (.sp-*)
  //  Dock เป็นสีเข้มเสมอเพื่อให้ "แยกออกจากเว็บ" ชัดเจน
  //  Panel เลือกได้ dark / light, สีหลัก (accent) เลือกจาก preset หรือกำหนดเอง
  // =====================================================================
  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    if (isNaN(n) || full.length !== 6) return { r: 198, g: 244, b: 50 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  SP.onColor = (hex) => luminance(hex) > 0.35 ? '#0A0A0B' : '#FFFFFF';
  SP.rgba = (hex, a) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

  SP.currentAccent = function () {
    const t = SP.settings.theme;
    if (t.custom && /^#[0-9a-f]{6}$/i.test(t.custom)) return t.custom;
    const preset = t.followDept ? SP.DEPTS[SP.dept()].theme : t.preset;
    return (SP.THEMES[preset] || SP.THEMES.lime).accent;
  };

  const PALETTE = {
    dark: {
      bg: '#0A0A0B', panel: '#141417', raise: '#1C1C21', sunk: '#0E0E10', line: '#2A2A30',
      text: '#ECECEF', muted: '#A1A1AA', faint: '#71717A',
      sla: '#4FD1FF', ovd: '#FF6B5B', bot: '#FFB547', qa: '#F472D0', set: '#A1A1AA',
      ok: '#34E3A4', warn: '#FFB547', err: '#FF6B5B', toolInk: '#0A0A0B', shadow: '0 30px 60px -12px rgba(0,0,0,.7)',
      dockBg: '#0E0E10', dockLine: '#2A2A30', dockText: '#ECECEF', dockMuted: '#A1A1AA', dockHover: '#1F1F24'
    },
    light: {
      bg: '#F4F3EE', panel: '#FFFFFF', raise: '#F4F3EE', sunk: '#ECEBE4', line: '#E0DED5',
      text: '#18181B', muted: '#52525B', faint: '#71717A',
      sla: '#0369A1', ovd: '#C2261B', bot: '#A14A06', qa: '#A0189F', set: '#52525B',
      ok: '#047857', warn: '#A14A06', err: '#C2261B', toolInk: '#FFFFFF', shadow: '0 30px 60px -16px rgba(24,24,27,.35)',
      dockBg: '#FFFFFF', dockLine: '#18181B', dockText: '#18181B', dockMuted: '#52525B', dockHover: '#F1F0EA'
    }
  };

  SP.applyTheme = function () {
    const base = SP.settings.theme.base === 'light' ? 'light' : 'dark';
    const p = PALETTE[base];
    const accent = SP.currentAccent();
    const v = {};
    Object.keys(p).forEach(k => { v[`--sp-${k}`] = p[k]; });
    v['--sp-accent'] = accent;
    v['--sp-on-accent'] = SP.onColor(accent);
    v['--sp-accent-soft'] = SP.rgba(accent, 0.16);
    v['--sp-accent-line'] = SP.rgba(accent, 0.45);
    v['--sp-accent-ink'] = base === 'dark' ? accent : '#18181B';
    v['--sp-scheme'] = base;
    ['sla', 'ovd', 'bot', 'qa', 'set'].forEach(t => { v[`--sp-${t}-soft`] = SP.rgba(p[t], base === 'dark' ? 0.16 : 0.10); });
    // เขียนเป็น <style> ใน host — เว็บนี้ล้าง style/attribute ของ <html> ทิ้ง จึงห้ามตั้งค่าที่ <html> ตรง ๆ
    const css = ':root{' + Object.keys(v).map(k => `${k}:${v[k]}`).join(';') + '}';
    SP.ensureStyle('sp-suite-vars', css);
    SP.themeBase = base;
  };

  // วาง <style> ไว้ใน host (นอก body/head ที่เว็บอาจ render ทับ)
  SP.ensureStyle = function (id, css) {
    const host = SP.host ? SP.host() : (document.head || document.documentElement);
    let st = document.getElementById(id);
    if (!st) { st = document.createElement('style'); st.id = id; }
    if (css !== undefined && st.textContent !== css) st.textContent = css;
    if (st.parentNode !== host) host.insertBefore(st, host.firstChild);
    return st;
  };

  SP.CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
  .sp-suite, .sp-suite * { box-sizing: border-box; }
  .sp-suite { font-family: 'Anuphan', 'Leelawadee UI', 'Sarabun', system-ui, sans-serif; color: var(--sp-text); font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  .sp-suite button { font-family: inherit; }
  .sp-mono { font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; }
  .sp-kicker { font-family: 'JetBrains Mono', ui-monospace, Consolas, monospace; font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .sp-muted { color: var(--sp-muted); }
  .sp-faint { color: var(--sp-faint); }

  /* ---------- DOCK (เข้มเสมอ) ---------- */
  .sp-dock { display: inline-flex; align-items: center; gap: 4px; height: 46px; padding: 4px; background: var(--sp-dockBg); border: 1px solid var(--sp-dockLine); border-radius: 14px; box-shadow: 0 10px 28px -10px rgba(0,0,0,.45), 0 0 0 3px var(--sp-accent-line); color: var(--sp-dockText); flex: none; margin: 0 12px 0 auto; position: relative; z-index: 50; }
  .sp-dock.sp-float { position: fixed; right: 20px; bottom: 20px; margin: 0; z-index: 2147482000; }
  .sp-dock.sp-fixed-top { position: fixed; top: 10px; right: 340px; margin: 0; z-index: 2147482000; }
  .sp-dock .sp-brand { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px 0 8px; border: 0; border-radius: 10px; background: var(--sp-accent); color: var(--sp-on-accent); font-family: 'JetBrains Mono', Consolas, monospace; font-size: 12px; font-weight: 700; letter-spacing: .06em; cursor: pointer; }
  .sp-dock .sp-brand svg { width: 16px; height: 16px; }
  .sp-dock .sp-brand.sp-on { box-shadow: 0 0 0 2px var(--sp-dockBg), 0 0 0 4px var(--sp-accent); }
  .sp-dock .sp-tb { position: relative; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 11px; border: 0; border-radius: 10px; background: transparent; color: var(--sp-dockText); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .12s; }
  .sp-dock .sp-tb:hover { background: var(--sp-dockHover); }
  .sp-dock .sp-tb:focus-visible, .sp-dock .sp-brand:focus-visible { outline: 2px solid var(--sp-accent); outline-offset: 2px; }
  .sp-dock .sp-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--tc); transition: box-shadow .15s; }
  .sp-dock .sp-tb:hover .sp-dot { box-shadow: 0 0 8px var(--tc); }
  .sp-dock .sp-tb.sp-on { background: var(--tc); color: #0A0A0B; }
  .sp-dock .sp-tb.sp-on .sp-dot { background: #0A0A0B; box-shadow: none; }
  .sp-dock .sp-badge { display: none; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 6px; background: var(--tc); color: #0A0A0B; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 11px; font-weight: 700; }
  .sp-dock .sp-badge.sp-show { display: inline-flex; }
  .sp-dock .sp-tb.sp-on .sp-badge { background: #0A0A0B; color: var(--tc); }
  .sp-dock .sp-tb.sp-alert .sp-dot { animation: spPulse 1.6s ease-in-out infinite; }
  @keyframes spPulse { 0%,100% { box-shadow: 0 0 0 0 var(--tc); } 50% { box-shadow: 0 0 0 5px transparent; } }
  .sp-dock .sp-sep { width: 1px; height: 22px; background: var(--sp-dockLine); opacity: .5; margin: 0 2px; }
  .sp-dock .sp-ic { width: 36px; padding: 0; justify-content: center; color: var(--sp-dockMuted); }
  .sp-dock .sp-ic svg { width: 16px; height: 16px; }
  .sp-dock.sp-collapsed .sp-tb:not(.sp-keep), .sp-dock.sp-collapsed .sp-sep { display: none; }

  /* ---------- DRAWER ---------- */
  .sp-drawer { position: fixed; z-index: 2147482500; display: flex; flex-direction: column; background: var(--sp-panel); border: 1px solid var(--sp-line); border-top: 4px solid var(--tc, var(--sp-accent)); border-radius: 18px; box-shadow: var(--sp-shadow); overflow: hidden; transform-origin: top right; opacity: 0; transform: translateY(-10px) scaleY(.96); pointer-events: none; transition: opacity .18s ease, transform .22s cubic-bezier(.2,.8,.2,1); }
  .sp-drawer.sp-open { opacity: 1; transform: none; pointer-events: auto; }
  .sp-drawer-head { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--sp-line); background: var(--sp-panel); flex: none; }
  .sp-tabs { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; min-width: 0; }
  .sp-tab { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--sp-muted); font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .sp-tab:hover { background: var(--sp-raise); color: var(--sp-text); }
  .sp-tab .sp-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tc); }
  .sp-tab.sp-on { background: var(--sp-raise); border-color: var(--sp-line); color: var(--sp-text); box-shadow: inset 0 -2px 0 var(--tc); }
  .sp-drawer-body { flex: 1; min-height: 0; overflow-y: auto; }
  .sp-drawer-x { position: absolute; top: 12px; right: 12px; z-index: 3; background: var(--sp-raise); border: 1px solid var(--sp-line); }
  .sp-drawer .sp-pane > .sp-pad:first-child > :first-child { padding-right: 44px; }
  .sp-pane { display: none; }
  .sp-pane.sp-on { display: block; }

  /* ---------- Components ---------- */
  .sp-ibtn { width: 32px; height: 32px; border: 0; border-radius: 9px; background: transparent; color: var(--sp-muted); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
  .sp-ibtn:hover { background: var(--sp-raise); color: var(--sp-text); }
  .sp-ibtn svg { width: 16px; height: 16px; }
  .sp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--sp-line); background: var(--sp-raise); color: var(--sp-text); font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: filter .12s, transform .12s; }
  .sp-btn:hover { filter: brightness(1.08); }
  .sp-btn:active { transform: translateY(1px); }
  .sp-btn:disabled { opacity: .45; cursor: not-allowed; filter: none; }
  .sp-btn.sp-pri { background: var(--tc, var(--sp-accent)); border-color: transparent; color: var(--sp-tool-ink, var(--sp-on-accent)); }
  .sp-btn.sp-accent { background: var(--sp-accent); border-color: transparent; color: var(--sp-on-accent); }
  .sp-btn.sp-ok { background: var(--sp-ok); border-color: transparent; color: var(--sp-toolInk); }
  .sp-btn.sp-danger { background: var(--sp-err); border-color: transparent; color: var(--sp-toolInk); }
  .sp-btn.sp-lg { height: 40px; font-size: 13.5px; padding: 0 18px; }
  .sp-btn.sp-sm { height: 28px; padding: 0 10px; font-size: 11.5px; border-radius: 8px; }
  .sp-btn.sp-block { width: 100%; }
  .sp-input, .sp-select, .sp-textarea { height: 34px; padding: 0 10px; border: 1px solid var(--sp-line); border-radius: 9px; background: var(--sp-sunk); color: var(--sp-text); font-family: inherit; font-size: 12.5px; outline: none; width: 100%; color-scheme: var(--sp-scheme, dark); }
  .sp-textarea { height: auto; min-height: 70px; padding: 8px 10px; resize: vertical; line-height: 1.5; }
  .sp-input:focus, .sp-select:focus, .sp-textarea:focus { border-color: var(--tc, var(--sp-accent)); box-shadow: 0 0 0 3px var(--sp-accent-soft); }
  .sp-label { display: block; font-size: 11.5px; font-weight: 600; color: var(--sp-muted); margin-bottom: 5px; }
  .sp-field { display: flex; flex-direction: column; min-width: 0; }
  .sp-check { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 12.5px; }
  .sp-check input { accent-color: var(--tc, var(--sp-accent)); width: 15px; height: 15px; margin: 0; }
  .sp-seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--sp-sunk); border: 1px solid var(--sp-line); border-radius: 11px; }
  .sp-seg button { height: 28px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--sp-muted); font-size: 12px; font-weight: 600; cursor: pointer; }
  .sp-seg button.sp-on { background: var(--tc, var(--sp-accent)); color: var(--sp-tool-ink, var(--sp-on-accent)); }
  .sp-card { background: var(--sp-raise); border: 1px solid var(--sp-line); border-radius: 14px; padding: 14px; }
  .sp-card-t { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; font-size: 12.5px; font-weight: 700; }
  .sp-kpi { background: var(--sp-raise); border: 1px solid var(--sp-line); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sp-kpi b { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 24px; font-weight: 700; line-height: 1.2; }
  .sp-kpi span { font-size: 12px; color: var(--sp-muted); }
  .sp-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 11px; font-weight: 700; background: var(--tc, var(--sp-accent)); color: var(--sp-tool-ink, var(--sp-on-accent)); white-space: nowrap; }
  .sp-pill.sp-soft { background: var(--sp-raise); color: var(--sp-muted); border: 1px solid var(--sp-line); }
  .sp-tag { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 5px; font-size: 10.5px; font-weight: 700; background: var(--sp-sunk); border: 1px solid var(--sp-line); color: var(--sp-muted); }
  .sp-row { display: flex; align-items: center; gap: 8px; }
  .sp-wrap { flex-wrap: wrap; }
  .sp-grow { flex: 1; min-width: 0; }
  .sp-col { display: flex; flex-direction: column; gap: 12px; }
  .sp-grid { display: grid; gap: 10px; }
  .sp-g2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .sp-g3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .sp-g4 { grid-template-columns: repeat(4, minmax(0,1fr)); }
  .sp-pad { padding: 16px 18px; }
  .sp-foot { display: flex; align-items: center; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--sp-line); background: var(--sp-sunk); position: sticky; bottom: 0; }
  .sp-bar { height: 8px; border-radius: 4px; background: var(--sp-sunk); overflow: hidden; }
  .sp-bar i { display: block; height: 100%; border-radius: 4px; background: var(--tc, var(--sp-accent)); transition: width .2s; }
  .sp-log { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 11px; color: var(--sp-muted); background: var(--sp-sunk); border: 1px solid var(--sp-line); border-radius: 10px; padding: 8px 10px; max-height: 150px; overflow-y: auto; line-height: 1.6; }
  .sp-log div { padding: 2px 0; border-bottom: 1px solid var(--sp-line); }
  .sp-empty { text-align: center; padding: 36px 16px; color: var(--sp-muted); border: 1px dashed var(--sp-line); border-radius: 14px; }
  .sp-table-wrap { border: 1px solid var(--sp-line); border-radius: 12px; overflow: auto; }
  .sp-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
  .sp-table thead th { position: sticky; top: 0; z-index: 1; background: var(--sp-sunk); color: var(--sp-muted); font-weight: 600; font-size: 11.5px; padding: 9px 12px; border-bottom: 1px solid var(--sp-line); white-space: nowrap; }
  .sp-table td { padding: 9px 12px; border-bottom: 1px solid var(--sp-line); vertical-align: top; }
  .sp-table tbody tr:hover td { background: var(--sp-raise); }
  .sp-table tr.sp-done td { background: var(--sp-bot-soft); }
  .sp-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sp-spin { display: inline-block; animation: spSpin 1s linear infinite; }
  @keyframes spSpin { to { transform: rotate(360deg); } }
  .sp-section-t { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--sp-muted); margin: 0 0 8px; }
  .sp-swatch { width: 34px; height: 34px; border-radius: 10px; border: 2px solid transparent; cursor: pointer; padding: 0; }
  .sp-swatch.sp-on { border-color: var(--sp-text); box-shadow: 0 0 0 2px var(--sp-panel) inset; }
  .sp-choice { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left; padding: 12px; border-radius: 12px; border: 1px solid var(--sp-line); background: var(--sp-raise); color: var(--sp-text); cursor: pointer; }
  .sp-choice.sp-on { border-color: var(--sp-accent); box-shadow: 0 0 0 3px var(--sp-accent-soft); }
  .sp-choice b { font-size: 15px; }
  .sp-choice > span:not(.sp-pill) { font-size: 11.5px; color: var(--sp-muted); }
  .sp-switch-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-top: 1px solid var(--sp-line); }
  .sp-switch-row:first-child { border-top: 0; }
  .sp-switch { appearance: none; -webkit-appearance: none; width: 36px; height: 20px; border-radius: 10px; background: var(--sp-line); position: relative; cursor: pointer; margin: 2px 0 0; flex: none; transition: background .15s; }
  .sp-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
  .sp-switch:checked { background: var(--sp-accent); }
  .sp-switch:checked::after { left: 18px; }
  .sp-note { font-size: 11.5px; color: var(--sp-muted); line-height: 1.5; }
  .sp-warnbox { border: 1px solid var(--sp-ovd); background: var(--sp-ovd-soft); color: var(--sp-text); border-radius: 12px; padding: 10px 12px; font-size: 12px; }

  /* tool color scopes */
  .sp-tc-home { --tc: var(--sp-accent); --sp-tool-ink: var(--sp-on-accent); }
  .sp-tc-sla { --tc: var(--sp-sla); --sp-tool-ink: var(--sp-toolInk); }
  .sp-tc-ovd { --tc: var(--sp-ovd); --sp-tool-ink: var(--sp-toolInk); }
  .sp-tc-bot { --tc: var(--sp-bot); --sp-tool-ink: var(--sp-toolInk); }
  .sp-tc-qa  { --tc: var(--sp-qa);  --sp-tool-ink: var(--sp-toolInk); }
  .sp-tc-set { --tc: var(--sp-accent); --sp-tool-ink: var(--sp-on-accent); }
  .sp-dock .sp-tc-sla { --tc: #4FD1FF; } .sp-dock .sp-tc-ovd { --tc: #FF6B5B; } .sp-dock .sp-tc-bot { --tc: #FFB547; } .sp-dock .sp-tc-qa { --tc: #F472D0; }

  /* ---------- Toast & status pill ---------- */
  .sp-toast-stack { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 2147483000; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
  .sp-toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 10px 14px 10px 10px; background: #0E0E10; color: #ECECEF; border: 1px solid #2A2A30; border-radius: 12px; box-shadow: 0 16px 40px -10px rgba(0,0,0,.6); font-size: 13px; max-width: min(560px, 92vw); animation: spIn .2s ease; }
  .sp-toast .sp-toast-mark { width: 26px; height: 26px; border-radius: 8px; background: var(--tc, var(--sp-accent)); color: #0A0A0B; display: inline-flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; flex: none; }
  @keyframes spIn { from { opacity: 0; transform: translateY(-6px); } }
  .sp-notice { position: fixed; left: 20px; bottom: 20px; z-index: 2147483000; width: min(400px, calc(100vw - 40px)); background: var(--tc); color: #0A0A0B; border: 3px solid #0A0A0B; border-radius: 16px; box-shadow: 6px 6px 0 #0A0A0B, 0 0 0 0 var(--tc); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; transform-origin: 20% 100%; animation: spNoticeIn .5s cubic-bezier(.2,1.6,.4,1) both, spWiggle 1.1s ease-in-out .5s 2, spGlow 1.6s ease-in-out .6s infinite; }
  .sp-notice:hover { animation-play-state: paused; }
  .sp-notice.sp-tc-qa { --tc: #FF8BDF; } .sp-notice.sp-tc-ovd { --tc: #FF8A7A; } .sp-notice.sp-tc-sla { --tc: #6FDBFF; } .sp-notice.sp-tc-bot { --tc: #FFC266; } .sp-notice.sp-tc-home { --tc: #D4FF4A; }
  .sp-notice .sp-kicker { color: #0A0A0B !important; opacity: .75; }
  .sp-notice .sp-n-title { font-weight: 700; font-size: 15px; line-height: 1.35; }
  .sp-notice .sp-n-body { font-size: 12.5px; line-height: 1.5; color: #1A1A1D; }
  .sp-notice .sp-n-x { width: 28px; height: 28px; border: 2px solid #0A0A0B; border-radius: 8px; background: rgba(255,255,255,.5); color: #0A0A0B; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .sp-notice .sp-n-x svg { width: 14px; height: 14px; }
  .sp-notice .sp-n-act { height: 34px; padding: 0 14px; border: 0; border-radius: 10px; background: #0A0A0B; color: #FFFFFF; font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .sp-notice .sp-n-act:hover { filter: brightness(1.3); }
  .sp-notice .sp-n-bell { display: inline-flex; width: 22px; height: 22px; animation: spRing 1.2s ease-in-out infinite; transform-origin: 50% 10%; }
  @keyframes spNoticeIn { from { opacity: 0; transform: translateY(30px) scale(.85); } }
  @keyframes spWiggle { 0%,100% { transform: rotate(0); } 15% { transform: rotate(-3deg); } 30% { transform: rotate(3deg); } 45% { transform: rotate(-2deg); } 60% { transform: rotate(2deg); } 75% { transform: rotate(-1deg); } }
  @keyframes spGlow { 0%,100% { box-shadow: 6px 6px 0 #0A0A0B, 0 0 0 0 var(--tc); } 50% { box-shadow: 6px 6px 0 #0A0A0B, 0 0 0 10px transparent; } }
  @keyframes spRing { 0%,60%,100% { transform: rotate(0); } 10% { transform: rotate(18deg); } 20% { transform: rotate(-16deg); } 30% { transform: rotate(12deg); } 40% { transform: rotate(-8deg); } 50% { transform: rotate(4deg); } }
  @media (prefers-reduced-motion: reduce) { .sp-notice, .sp-notice .sp-n-bell { animation: none; } }

  /* ---------- Injected on website — สีตามต้นฉบับเดิม + ตรา SP เล็ก ๆ ---------- */
  .sp-inject-btn { --ib: #16a34a; display: inline-flex !important; align-items: center !important; gap: 6px !important; height: 28px !important; padding: 0 12px 0 4px !important; border: 0 !important; border-radius: 6px !important; background: var(--ib) !important; color: #ffffff !important; font-family: inherit !important; font-size: 12px !important; font-weight: 700 !important; cursor: pointer !important; white-space: nowrap !important; box-shadow: 0 1px 3px rgba(0,0,0,.15) !important; vertical-align: middle !important; line-height: 1 !important; transition: filter .15s !important; }
  .sp-inject-btn:hover { filter: brightness(1.08); }
  .sp-inject-btn .sp-mark { display: inline-flex; align-items: center; justify-content: center; height: 20px; padding: 0 5px; border-radius: 4px; background: rgba(255,255,255,.92); color: var(--ib); font-family: 'JetBrains Mono', Consolas, monospace; font-size: 9.5px; font-weight: 700; letter-spacing: .04em; }
  .sp-inject-btn.sp-busy { --ib: #d97706; }
  .sp-inject-btn.sp-good { --ib: #15803d; }
  .sp-inject-btn.sp-bad { --ib: #dc2626; }
  .sp-inject-btn.sp-red { --ib: #dc2626; }
  .sp-inject-btn.sp-blue { --ib: #2563eb; }
  .sp-inject-chip { margin-top: 4px; padding: 2px 6px; border-radius: 4px; background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 3px solid #16a34a; color: #166534; font-family: inherit; font-size: 11px; font-weight: 500; line-height: 1.35; display: flex; align-items: center; gap: 5px; width: 100%; box-sizing: border-box; overflow: hidden; white-space: nowrap; clear: both; }
  .sp-inject-chip .sp-mark { flex: none; display: inline-flex; align-items: center; height: 14px; padding: 0 3px; border-radius: 3px; background: #16a34a; color: #ffffff; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 8.5px; font-weight: 700; }
  .sp-inject-chip .sp-txt { overflow: hidden; text-overflow: ellipsis; color: #1e293b; }
  .sp-inject-chip .sp-hi { color: #15803d; font-weight: 700; }
  .sp-inject-time { margin-top: 4px; font-size: 11px; font-weight: 700; color: #d97706; display: flex; align-items: center; gap: 4px; clear: both; }
  .sp-inject-time .sp-mark { display: inline-flex; align-items: center; height: 14px; padding: 0 3px; border-radius: 3px; background: #fef3c7; color: #b45309; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 8.5px; }
  .sp-inject-search { margin: 6px 0 8px; display: flex; flex-direction: column; gap: 4px; width: 100%; }
  .sp-inject-search .sp-box { position: relative; display: flex; align-items: center; height: 34px; border-radius: 8px; background: #ffffff; border: 1.5px solid #2563eb; padding: 0 28px 0 5px; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .sp-inject-search .sp-mark { flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 5px; border-radius: 4px; background: #2563eb; color: #ffffff; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 9.5px; font-weight: 700; margin-right: 7px; }
  .sp-inject-search input { flex: 1; min-width: 0; height: 100%; border: 0 !important; outline: none !important; background: transparent !important; color: #0f172a !important; font-family: inherit; font-size: 12.5px; box-shadow: none !important; padding: 0 !important; }
  .sp-inject-search input::placeholder { color: #94a3b8; }
  .sp-inject-search .sp-clear { position: absolute; right: 6px; width: 20px; height: 20px; border: 0; border-radius: 4px; background: transparent; color: #94a3b8; cursor: pointer; display: none; font-size: 13px; line-height: 1; }
  .sp-inject-search .sp-count { font-size: 11px; font-weight: 600; color: #2563eb; padding-left: 2px; }

  /* SLA poster: คงสีขาวสำหรับบันทึก PNG */
  #bplus-line-capture-container { font-family: 'Leelawadee UI', 'Sarabun', -apple-system, sans-serif; color: #0f172a; }

  @media (max-width: 1280px) { .sp-dock .sp-tb .sp-lbl { display: none; } .sp-dock .sp-tb { padding: 0 10px; } }
  @media (prefers-reduced-motion: reduce) { .sp-drawer { transition: none; } .sp-dock .sp-tb.sp-alert .sp-dot { animation: none; } }
  `;

  SP.injectCSS = function () { SP.ensureStyle('sp-suite-css', SP.CSS); };

  SP.ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>'
  };

  // ───────────── core/03_ui.js ─────────────
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

  // ───────────── modules/mod_sla.js ─────────────
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

  // ───────────── modules/mod_overdue.js ─────────────
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

  // ───────────── modules/mod_bot_return.js ─────────────
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

  // ───────────── modules/qa_templates.js ─────────────
  // =====================================================================
  //  QA TEMPLATES — ไฟล์ตัวอย่าง .md + ไฟล์คำสั่งสร้าง Skill
  //  รูปแบบต้องตรงกับ parseMDContent() ใน mod_qa_repair.js เสมอ
  //  ถ้าแก้ parser ต้องแก้ไฟล์นี้ตามด้วย
  // =====================================================================
  (function () {
    const F = '```';

    // ตัวอย่างและคำสั่งมาจากมาตรฐานของคุณหนึ่ง (BPlus_KM_Knowledge_Base.md + Custom_GPT_Instructions.txt)
    SP.QA_SAMPLE_MD = `# ชุดบทความตัวอย่าง (Gold Standard) สำหรับ SP Suite › QA Repair
> 1 ไฟล์มีหลายบทความได้ คั่นด้วย "## บทความที่ N" · โหลดไฟล์นี้เข้าเครื่องมือเพื่อดูว่าแต่ละช่องถูกกรอกอย่างไร

## บทความที่ 1
**ชื่อบทความ:** วิธีการเลือกข้อมูลหลายรายการพร้อมกันด้วยปุ่ม Ctrl ในระบบ Bplus ERP (เวอร์ชั่น 3.1 ขึ้นไป)
**คำอธิบายย่อ:** วิธีเลือกหลายรายการพร้อมกันใน Bplus ERP V3.1 โดยกดปุ่ม Ctrl ค้างแล้วคลิกเมาส์ สังเกตสัญลักษณ์จุดสีดำหน้ารายการ
**คำถามตัวอย่าง:**
- (Primary) วิธีการเลือกข้อมูลหลายรายการพร้อมกันด้วยปุ่ม Ctrl ในระบบ Bplus ERP (เวอร์ชั่น 3.1 ขึ้นไป)
- สอบถามค่ะต้องการคลิกคลุมหลายๆบรรทัด ต้องให้คำสั่งอะไรค่ะ (ปกติ กดCtrl+บรรทัดที่ต้องการ)  แต่ 3.1 นี้ไม่ได้
- วิธีเลือกสินค้าหลายรายการพร้อมกันใน Bplus 3.1
- กด Ctrl ค้างแล้วคลิกเลือกในโปรแกรม Bplus ทำยังไงคะ
- ทำไมคลุมหลายบรรทัดใน Bplus 3.1 ไม่ขึ้นแถบสีน้ำเงิน
- จุดสีดำหน้ารายการสินค้าหมายถึงอะไรใน Bplus
- วิธีเลือกหลายบรรทัดในตารางปรับราคาเป็นกลุ่ม
- เลือกหลาย sku พร้อมกันในระบบ Bplus ERP ทำยังไงค่ะ
- คลุมดำหลายรายการในโปรแกรม Bplus V3.1 ไม่ได้
- กดปุ่มอะไรเพื่อเลือกข้อมูลหลายแถวพร้อมกันคะ
- สัญลักษณ์จุดดำหน้ารายการในโปรแกรม Bplus คืออะไร
- วิธีเลือกรายการแบบ Multi-select ในตาราง Grid Bplus
- เลือกเอกสารหลายใบพร้อมกันในหน้าจอรายการทำอย่างไร
- ทำไมคลิกเลือกรายการที่ 2 แล้วรายการแรกหายไป
- วิธียกเลิกการเลือกหลายรายการที่มีจุดดำใน Bplus
- แนะนำวิธีคลิกเลือกหลายรายการใน Bplus ERP หน่อยค่ะ
- จะปรับราคาสินค้าหลายตัวพร้อมกันต้องเลือกยังไงคะ
- การเลือกแถวในหน้าต่างค้นหาสินค้า Bplus Version 3.1
- กด Ctrl แล้วคลิกเมาส์ใน Bplus มีจุดดำขึ้นแปลว่าเลือกหรือยัง
- ทำไมใน 3.1 ถึงไม่ไฮไลต์ทั้งแถวเหมือนเวอร์ชั่นเดิม
- วิธีเลือกรายการแบบติดกันและแบบเว้นบรรทัดใน Bplus
- เทคนิคการเลือกสินค้าทีละหลายๆ บรรทัดในระบบบัญชี
- คีย์ลัดในการเลือกหลายบรรทัดใน Business Plus ERP
- อยากเลือกสินค้า 10 รายการเพื่อประมวลผลพร้อมกันทำยังไง
- จุดสีดำหน้ารายการสินค้าขึ้นแล้วต้องกดยืนยันตรงไหนคะ
**Keywords:** เลือกหลายบรรทัด, เลือกหลายรายการ, Ctrl ค้าง, จุดสีดำ, จุดดำหน้ารายการ, Bplus ERP, เวอร์ชั่น 3.1, Bplus 3.1, คลุมบรรทัด, Multi-select, ปรับราคาสินค้า, ตารางสินค้า, Grid, คลิกเลือกรายการ, ปุ่ม Ctrl, ปุ่มลัด, สัญลักษณ์เลือก, แฟ้มสินค้า, Business Plus, การเลือกแถว, ปรับราคาเป็นกลุ่ม, ปลดการเลือก, Shift ค้าง, คีย์ลัด, Selection Indicator
**เนื้อหา:**
\`\`\`
## 🔹 สรุป
ในระบบ **Business Plus ERP (Bplus ERP) โดยเฉพาะในเวอร์ชั่น 3.1 ขึ้นไป** รูปแบบการเลือกข้อมูลหลายรายการพร้อมกัน (Multi-select) ภายในตารางข้อมูล (Grid) หรือหน้าจอแสดงรายการ (เช่น หน้าจอค้นหาสินค้า, หน้าจอดึงเอกสารเพื่อเปิดบิล, หรือหน้าจอป้อนข้อมูลเครื่องมือปรับราคาเป็นกลุ่ม) มีการแสดงผลที่ได้รับการปรับปรุงให้มีความชัดเจนและแม่นยำยิ่งขึ้น

ผู้ใช้งานที่เคยใช้งานในเวอร์ชั่นก่อนหน้าอาจคุ้นเคยกับการคลิกคลุมหลายบรรทัดแล้วระบบจะแสดงแถบสีไฮไลต์ทึบคลุมทั้งแถว แต่ใน **Bplus ERP เวอร์ชั่น 3.1** รูปแบบมาตรฐานในการเลือกหลายรายการคือ:
- **กดปุ่ม \`Ctrl\` บนคีย์บอร์ดค้างไว้ แล้วใช้เมาส์คลิกเลือกรายการที่ต้องการทีละรายการ**
- เมื่อคลิกเลือกแล้ว **ระบบจะแสดงสัญลักษณ์ "จุดสีดำ" (•) ปรากฏขึ้นที่คอลัมน์ด้านหน้าสุดของรายการนั้นๆ**
- สัญลักษณ์ **จุดสีดำหน้ารายการ** คือตัวบ่งชี้สถานะที่แท้จริงว่ารายการดังกล่าวได้ถูกเลือก (Selected) เข้าสู่ชุดข้อมูลเรียบร้อยแล้ว แม้ว่าแถบสีไฮไลต์ของหน้าจอจะวางอยู่ที่รายการล่าสุดเพียงบรรทัดเดียวก็ตาม เมื่อผู้ใช้คลิกปุ่มตกลงหรือดำเนินการ ระบบจะดึงทุกรายการที่มีจุดสีดำไปประมวลผลพร้อมกันทันที

## 🔹 เมื่อไหร่ควรใช้
- **การปรับราคาสินค้าหรือข้อมูลเป็นกลุ่ม:** ต้องการเลือกสินค้าหลายรายการ (Multiple SKUs) พร้อมกันในหน้าจอเครื่องมือ เช่น ปรับราคาสินค้าเป็นกลุ่มสินค้าตามหมวด/ยี่ห้อ
- **การเลือกเอกสารเพื่อนำไปทำงานต่อ:** เช่น การเลือกใบสั่งขายหลายใบเพื่อดึงไปเปิดใบส่งของ/ใบกำกับภาษี หรือเลือกใบแจ้งหนี้หลายใบไปจัดทำใบวางบิล
- **การเลือกข้อมูลในหน้าต่างค้นหา (Search / Lookup):** เมื่อต้องการนำเข้าข้อมูลหลายรายการพร้อมกันเข้าสู่เอกสาร
- **ผู้ใช้งานพบปัญหาเข้าใจผิดว่าเลือกหลายรายการไม่ได้:** เนื่องจากในเวอร์ชั่น 3.1 ไม่ปรากฏแถบสีคลุมทุกแถวเหมือนเดิม แต่สังเกตเห็นจุดสีดำแล้วไม่มั่นใจว่าระบบเลือกให้แล้วหรือไม่

## 🔹 ขั้นตอนการทำ

### ขั้นตอนที่ 1: การเปิดหน้าจอรายการข้อมูลและเตรียมการเลือก
1. เปิดหน้าจอที่ต้องการเลือกรายการ เช่น หน้าจอปรับราคาเป็นกลุ่มสินค้า, หน้าจอค้นหาสินค้า หรือหน้าจอดึงเอกสารอ้างอิง
2. ทำการค้นหา (Query / Filter) ข้อมูลให้รายการสินค้าหรือเอกสารขึ้นมาแสดงในตาราง (Grid) ให้เรียบร้อย
3. สังเกตคอลัมน์หน้าสุดของตาราง (ด้านซ้ายมือสุดของรหัสสินค้าหรือเลขที่เอกสาร) ซึ่งเป็นพื้นที่สำหรับแสดงสถานะการเลือก

### ขั้นตอนที่ 2: วิธีการกดเลือกหลายรายการพร้อมกัน (Multi-Selection with Ctrl)
1. นำเคอร์เซอร์เมาส์ไปชี้ที่รายการแรกที่ต้องการเลือก
2. **กดปุ่ม \`Ctrl\` บนแป้นพิมพ์ค้างไว้ (ห้ามปล่อยมือจากปุ่ม Ctrl)**
3. คลิกปุ่มเมาส์ซ้าย (Left-click) ที่รายการแรกที่ต้องการ
4. **ยังคงกดปุ่ม \`Ctrl\` ค้างไว้อย่างต่อเนื่อง** แล้วเลื่อนเมาส์ไปคลิกซ้ายที่รายการถัดไปที่ต้องการเลือก ไม่ว่ารายการนั้นจะอยู่ติดกันหรืออยู่ข้ามบรรทัดกัน
5. **ตรวจสอบสัญลักษณ์การเลือก:** สังเกตที่คอลัมน์ด้านหน้าสุดของบรรทัด จะมี **"จุดสีดำ" (•)** ปรากฏขึ้นที่หน้ารายการทุกรายการที่ท่านคลิกเลือก
6. เมื่อเลือกรายการที่ต้องการครบถ้วนทุกรายการแล้ว จึงปล่อยมือออกจากปุ่ม \`Ctrl\`

### ขั้นตอนที่ 3: วิธีการยกเลิกการเลือกบางรายการ (Deselect)
1. ในกรณีที่คลิกเลือกรายการผิด หรือต้องการนำรายการบางรายการออกจากการเลือก:
2. ให้ **กดปุ่ม \`Ctrl\` ค้างไว้**
3. ใช้เมาส์คลิกซ้ายซ้ำไปที่รายการที่มีจุดสีดำนั้นอีกหนึ่งครั้ง
4. สัญลักษณ์ **จุดสีดำ (•)** หน้ารายการดังกล่าวจะหายไป แสดงว่ารายการนั้นถูกยกเลิกออกจากการเลือกแล้ว

### ขั้นตอนที่ 4: การยืนยันและนำรายการไปประมวลผล
1. ตรวจสอบดูว่าทุกรายการที่ต้องการประมวลผลมี **จุดสีดำ (•)** ปรากฏอยู่หน้ารายการครบถ้วน
2. กดปุ่ม **"ตกลง" (OK)**, **"เลือก" (Select)** หรือกดปุ่มฟังก์ชันการทำงาน (เช่น ปุ่มคำนวณ หรือปุ่ม F9 บันทึก) ตามขั้นตอนของหน้าจอนั้นๆ
3. ระบบ Bplus ERP จะดึงเฉพาะรายการที่มีจุดสีดำไปดำเนินการประมวลผล เช่น นำไปปรับราคาใหม่พร้อมกันทุกรายการตามที่กำหนด

## 🔹 วิธีตรวจสอบหลังแก้ไข
- ในระหว่างการเลือก รายการทุกรายการที่ต้องการต้องมีสัญลักษณ์ **"จุดสีดำ" (•)** ปรากฏอยู่ที่คอลัมน์หน้าสุดอย่างชัดเจน
- เมื่อกดปุ่มดำเนินการ จำนวนรายการที่ระบบนำไปแสดงในหน้าจอถัดไป หรือจำนวนรายการที่ถูกปรับปรุงข้อมูล จะต้องตรงกับจำนวนรายการที่มีจุดสีดำ
- รายการที่ไม่ได้รับเลือก (ไม่มีจุดสีดำ) จะคงอยู่สถานะเดิม ไม่ถูกแก้ไขหรือเปลี่ยนแปลง

## 🔹 หมายเหตุ / ข้อควรระวัง
- **จุดสีดำคือเกณฑ์ตัดสินการเลือกในเวอร์ชั่น 3.1:** แถบสีไฮไลต์ (Focus Row) จะขยับไปอยู่ ณ บรรทัดล่าสุดที่คลิกเสมอ ซึ่งเป็นพฤติกรรมการแสดงผลปกติของตาราง Grid ยุคใหม่ ไม่ได้แปลว่ารายการก่อนหน้าหลุดการเลือก ตราบใดที่ยังมี **จุดสีดำ (•)** อยู่ด้านหน้า รายการนั้นยังคงถูกเลือกอยู่แน่นอน
- **ระวังการคลิกเมาส์โดยไม่กดปุ่ม Ctrl ค้าง:** หากผู้ใช้งานคลิกเมาส์ที่รายการใดๆ บนตารางโดยที่ไม่ได้กดปุ่ม \`Ctrl\` ค้างไว้ ระบบจะถือเป็นการเลือกรายการใหม่เพียงรายการเดียว และจะล้างจุดสีดำของรายการอื่นๆ ทั้งหมดทิ้งทันที
- **การเลือกช่วงรายการต่อเนื่อง (Shift + Click):** ในบางหน้าจอที่รองรับการเลือกแบบช่วงบรรทัดต่อเนื่อง สามารถคลิกที่รายการแรก จากนั้นกดปุ่ม \`Shift\` ค้างไว้แล้วคลิกรายการสุดท้าย ระบบจะทำเครื่องหมายจุดสีดำให้กับทุกรายการที่อยู่ในช่วงบรรทัดดังกล่าวให้อัตโนมัติ
\`\`\`
\`\`\`

## บทความที่ 2
**ชื่อบทความ:** ข้อจำกัดการกำหนดแผนกในประเภทการรับชำระและขั้นตอนการปรับปรุงแผนกด้วยใบสำคัญทั่วไป (GV) ใน Bplus ERP
**คำอธิบายย่อ:** สาเหตุที่การรับชำระประเภทอื่นไม่สามารถเปลี่ยนแผนกได้ และขั้นตอนปรับปรุงแผนกด้วยใบสำคัญทั่วไป (GV) ใน Bplus ERP
**คำถามตัวอย่าง:**
- (Primary) ข้อจำกัดการกำหนดแผนกในประเภทการรับชำระและขั้นตอนการปรับปรุงแผนกด้วยใบสำคัญทั่วไป (GV) ใน Bplus ERP
- ทำไมเปลี่ยนเป็น แผนก บริหาร ไม่ได้คะ
- บันทึกรับชำระเงินแล้วเลือกแผนกไม่ได้ทำยังไงคะ
- ทำไมช่องแผนกในหน้าจอรับชำระขึ้นเป็นแผนกใช้ประจำตลอด แก้ไขไม่ได้
- ประเภทการรับชำระที่ไม่ใช่ธนาคารเปลี่ยนแผนกได้ไหม
- ต้องการเปลี่ยนแผนกในบิลรับเงินเป็นแผนกบริหารทำอย่างไร
- วิธีปรับปรุงแผนกด้วยใบสำคัญทั่วไป GV ในระบบ Bplus
- ทำไมช่องแผนกเป็นสีเทาเปลี่ยนไม่ได้ในเอกสารรับชำระ
- รับชำระเงินสดแต่ต้องการลงเป็นแผนกบริหารทำยังไงค่ะ
- ขั้นตอนโอนย้ายแผนกในสมุดรายวันด้วยเอกสาร GV
- ทำไมเอกสาร RN หรือรับชำระเงินไม่ยอมให้เลือกแผนก
- ปรับปรุงค่าใช้จ่ายหรือเงินรับให้ตรงตามแผนกจริงใน GL
- การกำหนดแผนกใช้ประจำในระบบบัญชี Bplus ERP
- รับชำระประเภทอื่นที่ไม่ใช่บัญชีธนาคารลงแผนกไหน
- อยากให้รายการรับเงินลงแผนกบริหารต้องทำยังไงคะ
- วิธีเปิดใบสำคัญทั่วไป GV เพื่อย้ายแผนกบัญชี
- แก้ไขแผนกในเอกสารการเงินไม่ได้ เกิดจากอะไร
- ทำไมระบบดึงแผนกใช้ประจำมาอัตโนมัติแล้วแก้ไม่ได้ค่ะ
- ขั้นตอนการบันทึก GV เพื่อปรับปรุงแผนกใน Bplus ERP
- เปลี่ยนรหัสแผนกในหน้าจอบันทึกรับเงินทำไมระบบไม่ยอม
- วิธีตรวจสอบการลงบัญชีแยกตามแผนกหลังปรับปรุง GV
- รับชำระเงินไม่ผ่านธนาคารต้องการระบุแผนกทำอย่างไร
- ปรับปรุงเดบิตเครดิตย้ายแผนกด้วยใบสำคัญทั่วไป
- สาเหตุที่ประเภทการชำระเงินอื่นล็อกแผนกไว้ใน Bplus
- บันทึกรายได้และรับเงินเข้าแผนกบริหารทำอย่างไรคะ
**Keywords:** แผนก, เปลี่ยนแผนกไม่ได้, แผนกบริหาร, แผนกใช้ประจำ, ประเภทการรับชำระ, ใบสำคัญทั่วไป, GV, ปรับปรุงบัญชี, Bplus ERP, Business Plus, ระบบบัญชีแยกประเภท, GL, ใบสำคัญรับ, RN, รับชำระเงิน, บัญชีธนาคาร, เงินสด, ข้อจำกัดระบบ, โอนย้ายแผนก, ผังบัญชี, สมุดรายวัน, แยกตามแผนก, รายงานแยกแผนก, ปรับปรุงแผนก, สิทธิ์แผนก
**เนื้อหา:**
\`\`\`
## 🔹 สรุป
ในระบบ **Business Plus ERP (Bplus ERP)** ในขั้นตอนการบันทึกเอกสารด้านการเงินและการรับชำระเงิน (เช่น ใบสำคัญรับ RN, การรับชำระหนี้ลูกหนี้ หรือการรับเงินในเอกสารขาย) ผู้ใช้งานอาจพบว่า **ไม่สามารถเลือกหรือเปลี่ยนรหัสแผนก (Department) เป็นแผนกที่ต้องการ เช่น แผนก "บริหาร" ได้**

สาเหตุเกิดจาก **เงื่อนไขและข้อจำกัดการทำงานมาตรฐานของระบบ Bplus ERP** โดยรายการรับชำระที่เป็น **"ประเภทการรับชำระอื่นที่ไม่ใช่บัญชีธนาคาร"** (เช่น เงินสด, เช็ค, หรือรายการรับชำระอื่นๆ) ระบบจะไม่เปิดให้กำหนดหรือเลือกแผนกในหน้าจอรับชำระได้ตามใจชอบ แต่ระบบจะทำการดึง **"แผนกใช้ประจำ" (Default Department)** ที่ตั้งค่าไว้ในระบบงานบัญชีส่วนกลางมาลงบัญชีให้อัตโนมัติเสมอ

ดังนั้น หากองค์กรมีความจำเป็นต้องให้รายการเงินรับหรือรายได้ดังกล่าวลงบันทึกบัญชีแยกเข้าสู่ **แผนกที่เจาะจงเป็นการเฉพาะ (เช่น แผนกบริหาร)** แนวทางปฏิบัติที่ถูกต้องตามมาตรฐานของโปรแกรมคือ **จะต้องบันทึกเอกสารรับชำระต้นทางให้เรียบร้อยก่อน แล้วจึงทำการเปิดเอกสารใบสำคัญทั่วไป (GV - General Voucher) ในระบบบัญชีแยกประเภท (GL) เพื่อปรับปรุงโอนย้ายยอดเงินไปยังแผนกที่ต้องการอีกครั้ง**

## 🔹 เมื่อไหร่ควรใช้
- เมื่อบันทึกเอกสารรับชำระเงิน (ประเภทที่ไม่ใช่ธนาคาร เช่น เงินสด) แล้วระบบล็อกช่องแผนก ไม่ยอมให้แก้ไขหรือเลือกเปลี่ยนเป็นแผนกบริหารหรือแผนกอื่นๆ
- ต้องการสรุปรายงานทางการเงิน งบทดลอง หรือรายงานกำไรขาดทุนแยกตามศูนย์ต้นทุน/แผนก (Departmental Financial Statements) ให้ตรงตามแผนกจริงที่รับผิดชอบ
- ตรวจสอบพบว่ารายการลงบัญชีในสมุดรายวันถูกบันทึกเข้าแผนกใช้ประจำของระบบ แต่ต้องการปรับยอดไปยังแผนกที่ถูกต้อง

## 🔹 ขั้นตอนการทำ

### ขั้นตอนที่ 1: ทำความเข้าใจข้อจำกัดและบันทึกเอกสารรับชำระต้นทาง
1. ในหน้าจอบันทึกการรับชำระเงิน (เช่น ใบสำคัญรับ RN หรือหน้าจอบันทึกการรับเงิน):
   - เมื่อเลือกประเภทการรับชำระเป็นเงินสด หรือประเภทอื่นที่ไม่ใช่บัญชีเงินฝากธนาคาร ช่องแผนกจะแสดงเป็น **แผนกใช้ประจำ** โดยอัตโนมัติและไม่สามารถคลิกแก้ไขได้
   - ถือเป็นพฤติกรรมปกติของระบบ ให้ผู้ใช้งานบันทึกข้อมูลจำนวนเงินและรายละเอียดอื่นๆ ให้ครบถ้วน แล้วกด **บันทึกเอกสาร (Save / F9)** ตามขั้นตอนปกติ
2. ตรวจสอบดูการลงบัญชีอัตโนมัติ (Journal Voucher) ของเอกสารดังกล่าว:
   - สังเกตว่าระบบลงบัญชีเดบิต/เครดิตเข้าที่รหัสบัญชีใด ภายใต้รหัสแผนกใด (โดยปกติจะเป็นแผนกใช้ประจำ เช่น \`01.สำนักงาน\` หรือ \`00.ส่วนกลาง\`)

### ขั้นตอนที่ 2: การเปิดเอกสารใบสำคัญทั่วไป (GV) เพื่อปรับปรุงแผนก
1. เข้าโปรแกรม Business Plus ERP ไปที่เมนู **งานประจำวัน > บัญชี > บันทึกใบสำคัญทั่วไป (GV)** (หรือ **ระบบบัญชีแยกประเภท GL**)
2. กดปุ่ม **"เพิ่มข้อมูล (Insert / F3)"** เพื่อสร้างใบสำคัญใบใหม่
3. กำหนดข้อมูลส่วนหัวเอกสาร (Header):
   - **สมุดรายวัน:** เลือกสมุดรายวันทั่วไป (General Journal)
   - **วันที่เอกสาร:** กำหนดวันที่เดียวกับเอกสารรับชำระต้นทาง หรือวันสิ้นงวดบัญชีที่ต้องการปรับปรุงยอด
   - **คำอธิบายรายการ (Description):** ระบุเหตุผลในการปรับปรุงให้ชัดเจน เช่น *"ปรับปรุงย้ายแผนกรายการรับเงินสดจากเอกสาร RN... ไปยังแผนกบริหาร"*

### ขั้นตอนที่ 3: การบันทึกรายการเดบิต-เครดิตเพื่อโอนย้ายแผนก
1. **บรรทัดที่ 1 (นำยอดเข้าแผนกที่ต้องการ):**
   - **รหัสบัญชี:** เลือกรหัสบัญชีเดิมที่ต้องการปรับปรุง (เช่น บัญชีเงินสด หรือบัญชีรายได้ที่ต้องการย้าย)
   - **รหัสแผนก:** เลือกแผนกที่ต้องการเจาะจง เช่น **แผนก "บริหาร"** (หรือรหัสแผนกบริหารของกิจการ)
   - **ยอดเงิน:** ระบุจำนวนเงินในฝั่ง **เดบิต (Dr.)** (หรือฝั่งที่สอดคล้องกับธรรมชาติของบัญชีเพื่อเพิ่มยอดในแผนกใหม่)
2. **บรรทัดที่ 2 (ล้างยอดออกจากแผนกเดิม):**
   - **รหัสบัญชี:** เลือกรหัสบัญชีเดียวกันกับบรรทัดแรก
   - **รหัสแผนก:** เลือก **"แผนกใช้ประจำเดิม"** ที่ระบบดึงไปบันทึกไว้ในขั้นตอนที่ 1
   - **ยอดเงิน:** ระบุจำนวนเงินเท่ากันในฝั่ง **เครดิต (Cr.)** เพื่อหักล้างยอดออกจากแผนกเดิม
3. ตรวจสอบความสมดุลของเอกสาร ยอดรวมด้านเดบิตและเครดิตต้องเท่ากัน (ผลต่าง Balance = 0.00)
4. กดปุ่ม **"บันทึกข้อมูล (Save / F9)"** เพื่อผ่านรายการบัญชี

### ขั้นตอนที่ 4: การตรวจสอบการตั้งค่าแผนกใช้ประจำของระบบ (Optional)
หากในอนาคตต้องการให้รายการรับเงินประเภทดังกล่าวมีค่าเริ่มต้นวิ่งเข้าสู่แผนกบริหารโดยตรง:
1. ให้ผู้ดูแลระบบหรือฝ่ายบัญชีตรวจสอบที่เมนู **การตั้งค่า > ระบบบัญชี > กำหนดแก้ไขคุณสมบัติฐานข้อมูล หรือ กำหนดแผนกใช้ประจำ**
2. ตรวจสอบว่าสามารถกำหนดแผนกใช้ประจำของระบบให้ตรงกับโครงสร้างองค์กรหลักได้หรือไม่ ทั้งนี้ต้องพิจารณาผลกระทบต่อเอกสารอื่นๆ ในระบบควบคู่ไปด้วย

## 🔹 วิธีตรวจสอบหลังแก้ไข
- เข้าไปที่เมนู **รายงาน > บัญชี > รายงานสมุดรายวันทั่วไป (Journal Report)** หรือ **รายงานแยกประเภททั่วไป (General Ledger)** เพื่อดูรายการเดินบัญชีของรหัสบัญชีที่ปรับปรุง
- เรียกดู **รายงานงบทดลองแยกตามแผนก (Departmental Trial Balance)**:
  - ยอดเงินในแผนกใช้ประจำเดิมจะต้องถูกลดยอดลงไปตามจำนวนเงินที่ปรับปรุง
  - ยอดเงินจะไปแสดงเพิ่มขึ้นภายใต้ **แผนกบริหาร** อย่างถูกต้องตรงตามยอดจริง
- ยอดคงเหลือสุทธิของบัญชีในงบการเงินรวมของทั้งบริษัทต้องเท่าเดิม ไม่มีการคลาดเคลื่อน

## 🔹 หมายเหตุ / ข้อควรระวัง
- **เป็นข้อจำกัดตามสถาปัตยกรรมของโปรแกรม:** การที่ประเภทการรับชำระอื่นที่ไม่ใช่ธนาคารไม่สามารถเปลี่ยนแผนกได้ในหน้าจอรับเงิน ไม่ใช่ข้อผิดพลาด (Bug) ของโปรแกรม แต่เป็นการควบคุมความถูกต้องของการบันทึกบัญชีการเงินส่วนกลาง
- **ห้ามแก้ไขฐานข้อมูลโดยตรง:** ห้ามใช้คำสั่งฐานข้อมูลไปบังคับเปลี่ยนรหัสแผนกในตารางข้อมูลการเงินโดยตรง เพราะอาจทำให้ความเชื่อมโยงระหว่างระบบลูกหนี้ การเงิน และสมุดรายวันทั่วไปเกิดความไม่สอดคล้องกัน (Data Inconsistency)
- **การบันทึกคำอธิบายเอกสาร:** ในใบสำคัญทั่วไป (GV) ควรอ้างอิงเลขที่เอกสารรับชำระต้นทาง (เช่น RNxxxxxx) เสมอ เพื่อให้ผู้ตรวจสอบบัญชีสามารถตรวจสอบย้อนกลับ (Audit Trail) ได้อย่างโปร่งใส
\`\`\`
\`\`\`
`;

    SP.QA_SKILL_MD = `---
name: bplus-qa-repair-md
description: สร้างบทความ Bplus KM ในรูปแบบไฟล์ .md ที่นำเข้าได้ทันทีด้วย SP Suite › QA Repair (มาตรฐาน Quality Score 15/15) ใช้ทุกครั้งที่ผู้ใช้ส่งปัญหา คำถามลูกค้า เคส หรือวิธีแก้ปัญหา Business Plus ERP / HRM / POS แล้วขอ "ทำบทความ", "ทำไฟล์ md", "ทำ QA Repair", "แปลงเป็นบทความ KM"
---

# BPlus QA Repair Assistant — ไฟล์ .md สำหรับ SP Suite

## บทบาท
คุณคือผู้เชี่ยวชาญระบบ Business Plus ERP, HRM, POS และ Knowledge Management (KM)
หน้าที่: แปลงปัญหา คำถามลูกค้า ข้อผิดพลาด หรือวิธีแก้ปัญหา ให้เป็นบทความ Markdown ที่ถูกรูปแบบ 100%
เครื่องมือ QA Repair อ่านไฟล์ด้วย regex — ถ้าหัวข้อเพี้ยนแม้นิดเดียว ช่องนั้นจะว่าง

## รูปแบบโครงสร้างบังคับ
\`\`\`\`markdown
## บทความที่ 1
**ชื่อบทความ:** <ชื่อบทความทางการ ชัดเจน สื่อถึงปัญหาและวิธีแก้>
**คำอธิบายย่อ:** <สรุป 1-2 ประโยค ความยาวบังคับ 20 ถึง 120 ตัวอักษร>
**คำถามตัวอย่าง:**
- (Primary) <คำถามหลักที่เป็นทางการหรือตรงกับข้อความที่ลูกค้าถามมากที่สุด>
- <คำถามลูกค้ารูปแบบที่ 2>
- <คำถามลูกค้ารูปแบบที่ 3>
... (ต้องมีคำถามครบทั้งหมด 25 ข้อพอดี)
- <คำถามลูกค้ารูปแบบที่ 25>
**Keywords:** <คำค้นหาทั้งหมด 25 คำ คั่นด้วยเครื่องหมายจุลภาค (,) อยู่ในบรรทัดเดียวกันทั้งหมด>
**เนื้อหา:**
\`\`\`
## 🔹 สรุป
<สรุปภาพรวมของฟังก์ชัน ปัญหา สาเหตุ และแนวทางแก้ไขในเชิงหลักการของระบบ Business Plus>

## 🔹 เมื่อไหร่ควรใช้
- <สถานการณ์หรืออาการที่ผู้ใช้งานพบ>
- <กรณีที่เกิดข้อผิดพลาด>
- <ความจำเป็นในการตั้งค่าหรือแก้ไข>

## 🔹 ขั้นตอนการทำ

### ขั้นตอนที่ 1: <ชื่อขั้นตอน>
1. <ขั้นตอนย่อยพร้อมระบุเมนูภาษาไทย/อังกฤษอย่างชัดเจน>
2. ...

### ขั้นตอนที่ 2: <ชื่อขั้นตอน>
1. ...

### ขั้นตอนที่ 3: <ชื่อขั้นตอน>
1. ...

## 🔹 วิธีตรวจสอบหลังแก้ไข
- <วิธีตรวจสอบผลลัพธ์ในหน้าจอ>
- <การตรวจสอบรายงานหรือสมุดรายวัน>
- <การกระทบยอดหรือความถูกต้อง>

## 🔹 หมายเหตุ / ข้อควรระวัง
- <ข้อจำกัดทางเทคนิคหรือพฤติกรรมระบบ>
- <ผลกระทบต่องวดบัญชี ภาษี หรือข้อมูลย้อนหลัง>
- <ข้อแนะนำด้านความปลอดภัยและการสำรองข้อมูล>
\`\`\`\`

หมายเหตุการอ่านไฟล์ของ SP Suite:
- หัวข้อตัวหนาต้องพิมพ์ตรงตัว: **ชื่อบทความ:** **คำอธิบายย่อ:** **คำถามตัวอย่าง:** **Keywords:** **เนื้อหา:** (เครื่องหมาย : อยู่ในตัวหนา)
- ลำดับต้องเป็น ชื่อบทความ → คำอธิบายย่อ → คำถามตัวอย่าง → Keywords → เนื้อหา
- \`(Primary)\` ที่ข้อแรก เครื่องมือจะตัดออกให้เองและติ๊กช่อง Primary ให้อัตโนมัติ — ใส่ได้ตามมาตรฐาน
- ในบล็อกเนื้อหา ห้ามมี backtick 3 ตัวซ้อนข้างใน (จะทำให้เนื้อหาถูกตัดขาด)
- 1 ไฟล์มีหลายบทความได้: \`## บทความที่ 1\`, \`## บทความที่ 2\`, ... เรียงเลขไม่ข้าม

## กฎเหล็ก 5 ประการ (Zero-Tolerance)
## กฎเหล็ก 5 ประการที่ห้ามละเมิดเด็ดขาด (Zero-Tolerance Rules)

1. **คำถามตัวอย่าง (Sample Questions) ต้องมีครบ 25 ข้อพอดี:**
   - บรรทัดแรกต้องขึ้นต้นด้วย \`- (Primary) ...\`
   - อีก 24 บรรทัดถัดไปต้องขึ้นต้นด้วย \`- ...\`
   - ต้องครอบคลุมภาษาพูดลูกค้า ภาษาทางการ คำย่อ อาการที่พบ คำพิมพ์ผิดยอดฮิต (คะ/ค่ะ, มะ/ไหม) ทั้งประโยคสั้นและยาว
   - หากผู้ใช้ระบุคำถามจริงของลูกค้ามา ต้องใส่คำถามจริงนั้นไว้ในลำดับต้นๆ (เช่น ข้อ 1 หรือ ข้อ 2) เสมอ

2. **Keywords ต้องมีครบ 25 คำพอดี ในบรรทัดเดียว:**
   - คั่นด้วยเครื่องหมายจุลภาคและเว้นวรรค (\`, \`)
   - ห้ามขึ้นบรรทัดใหม่
   - ครอบคลุม: ชื่อระบบ, ชื่อเมนู, ภาษาไทย, ภาษาอังกฤษ, ตัวย่อ (เช่น ERP, GL, RN, GV, E-Tax), อาการเสีย, ศัพท์ชาวบ้าน, ศัพท์ทางบัญชี

3. **คำอธิบายย่อ (Short Description):**
   - ความยาวต้องอยู่ระหว่าง **20 ถึง 120 ตัวอักษร** (ห้ามสั้นกว่า 20 และห้ามยาวเกิน 120 ตัวอักษร)

4. **เนื้อหา (Content) ต้องมีความยาวรวม >= 2,000 ตัวอักษร:**
   - เพื่อให้ระบบคำนวณได้คะแนนคุณภาพเต็ม 15/15 Quality Score
   - ต้องเขียนให้ละเอียด มีลำดับขั้นตอน 1, 2, 3... ระบุเส้นทางเมนูชัดเจน (เช่น ไปที่เมนู การตั้งค่า > ฝ่ายการเงิน > ...)
   - ต้องมีหัวข้อมาตรฐานครบทั้ง 5 หัวข้อ: \`## 🔹 สรุป\`, \`## 🔹 เมื่อไหร่ควรใช้\`, \`## 🔹 ขั้นตอนการทำ\`, \`## 🔹 วิธีตรวจสอบหลังแก้ไข\`, \`## 🔹 หมายเหตุ / ข้อควรระวัง\`
   - ต้องครอบด้วย Code Block (Triple Backticks \`\`\`) ในส่วนเนื้อหา

5. **สไตล์การเขียนและบริบทของ Business Plus:**
   - ใช้ศัพท์เฉพาะของ Bplus อย่างถูกต้อง เช่น แฟ้มลูกหนี้, ใบสำคัญรับ (RN), ใบสำคัญทั่วไป (GV), แฟ้มสินค้า, สมุดรายวัน, ตารางราคา, แผนกใช้ประจำ
   - คำอธิบายต้องสุภาพ เป็นมืออาชีพ อิงตามหลักการบัญชี ภาษี และกระบวนการทำงานจริงของ ERP

## การส่งผลลัพธ์
1. แสดง Markdown ฉบับเต็มในโค้ดบล็อกเดียว ให้ผู้ใช้ตรวจทาน
2. ถ้าสร้างไฟล์ได้ (Code Interpreter / เครื่องมือเขียนไฟล์) ให้บันทึกเป็น \`Article_<ID>_<Topic>.md\` (UTF-8) และให้ลิงก์ดาวน์โหลด
3. สรุปตัวนับท้ายคำตอบเสมอ:
   - จำนวนคำถามตัวอย่าง: 25 ข้อ
   - จำนวน Keywords: 25 คำ
   - ความยาวคำอธิบายย่อ: XX ตัวอักษร (เกณฑ์ 20–120)
   - ความยาวเนื้อหา: XXXX ตัวอักษร (เกณฑ์ ≥ 2,000)
4. ห้ามแต่งชื่อเมนูหรือข้อมูลที่ไม่แน่ใจ ถ้าไม่รู้ให้ใส่ [ชื่อเมนู] ไว้ให้ผู้ใช้เติม

## ข้อมูลอ้างอิงระบบ Business Plus
## ส่วนที่ 2: ศัพท์เฉพาะและผังการทำงานหลักของระบบ Business Plus ERP

- **เอกสารและรหัสย่อสำคัญ:**
  - \`SO\` (Sale Order): ใบสั่งขาย
  - \`PO\` (Purchase Order): ใบสั่งซื้อ
  - \`RN\` (Receipt Note / Voucher): ใบสำคัญรับ / ใบรับชำระหนี้
  - \`PV\` (Payment Voucher): ใบสำคัญจ่าย / ใบจ่ายชำระหนี้
  - \`GV\` (General Voucher): ใบสำคัญทั่วไป (ใช้สำหรับปรับปรุงรายการบัญชีในสมุดรายวันทั่วไป)
  - \`CN\` (Credit Note): ใบลดหนี้
  - \`DN\` (Debit Note): ใบเพิ่มหนี้
- **หลักการด้านการเงินและแผนก (Departments):**
  - รายการรับชำระที่ไม่ใช่บัญชีธนาคาร (เช่น เงินสด, เช็ค) ในระบบ Bplus จะล็อกแผนกเข้า **"แผนกใช้ประจำ" (Default Department)** ของระบบบัญชีเสมอ ผู้ใช้ไม่สามารถคลิกเลือกแผนกเจาะจงในหน้าจอรับเงินได้ หากต้องการย้ายไปแผนกอื่น (เช่น แผนกบริหาร) ต้องปรับปรุงบัญชีด้วยเอกสาร \`GV\`
- **ระบบเลือกหลายรายการในตาราง (Multi-Selection Grid V3.1 ขึ้นไป):**
  - ในเวอร์ชั่น 3.1 การเลือกหลายรายการพร้อมกันจะใช้การกดปุ่ม **\`Ctrl\` ค้างไว้แล้วคลิกเมาส์**
  - สัญลักษณ์การเลือกคือ **"จุดสีดำ" (•)** ที่คอลัมน์ด้านหน้ารายการ (ไม่จำเป็นต้องขึ้นแถบไฮไลต์คลุมทั้งแถว)
- **การคำนวณส่วนลดหลายชั้น (Multi-Level Compound Discount):**
  - เช่น ส่วนลด \`20%+1%\` หรือ \`10+5+2\` ใน Bplus จะคำนวณแบบลดทอนเป็นลำดับขั้น (Cascading) เช่น สินค้า 1,000 บาท ลด 20% เหลือ 800 บาท แล้วนำ 800 บาทไปลดต่อ 1% (ลดอีก 8 บาท) ยอดสุทธิคือ 792 บาท ไม่ใช่การนำเปอร์เซ็นต์มารวมกันเป็น 21%
- **ระบบใบกำกับภาษีอิเล็กทรอนิกส์ (E-Tax Invoice & e-Receipt):**
  - รองรับการสร้างไฟล์ XML ตามมาตรฐาน ETDA และ PDF/A-3 พร้อม Digital Signature
  - เมนูส่ง: **งานประจำวัน > บัญชี > เครื่องมือ > ส่ง e-Tax invoice > ส่ง e-Tax invoice**
  - ตรวจสอบสถานะ: **งานประจำวัน > บัญชี > เครื่องมือ > ส่ง e-Tax invoice > ดูสถานะการส่ง e-Tax invoice**
  - ปัญหาที่พบบ่อย: ข้อมูลที่อยู่ไม่สมบูรณ์, อักขระพิเศษในช่องหมายเหตุ, ใบลดหนี้ไม่ได้ระบุเหตุผลลดหนี้, ไฟล์ PDF ไม่สร้าง (กดเตรียมเอกสารใหม่)

## วิธีใช้ไฟล์ที่ได้
SP Suite › QA Repair › เลือกไฟล์ .md › เลือกข้อ (เครื่องมือจะโชว์ ✓/✗ ตามเกณฑ์ 4 ข้อ) › กด "ซ่อมอัตโนมัติ" › ตรวจแล้วกดบันทึกเอง
`;

    SP.downloadText = function (filename, text) {
      const blob = new Blob(['﻿' + text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      SP.host().appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
  })();

  // ───────────── modules/mod_qa_repair.js ─────────────
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

  // ───────────── modules/mod_my_handoff.js ─────────────
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

  // ───────────── modules/tweaks.js ─────────────
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

  // ───────────── core/99_boot.js ─────────────
  // =====================================================================
  //  BOOT — สร้าง dock + drawer เมื่อ DOM พร้อม
  // =====================================================================
  SP.whenReady(function bootLoop() {
    if (document.body) SP.bootUI();
    else setTimeout(bootLoop, 200);
  });

})();
