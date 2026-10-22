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
