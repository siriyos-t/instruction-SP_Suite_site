#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build: รวมไฟล์ใน src/ เป็น dist/Bplus_SP_Suite.user.js ไฟล์เดียว
ใช้งาน:  python build.py          (หรือดับเบิลคลิก build.bat)
แก้เวอร์ชันได้ที่ตัวแปร VERSION ด้านล่าง
"""
import io, os, re, shutil, sys

VERSION = '2.1.1'

# ใส่ลิงก์ GitHub Pages ของ repo (ไม่มี / ท้าย) เพื่อให้ Tampermonkey เช็คอัปเดตเองอัตโนมัติ
# ตัวอย่าง: PAGES_URL = 'https://siriyos.github.io/sp-suite'
PAGES_URL = ''
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')

# ลำดับสำคัญ: core ก่อน → เครื่องมือ (ลำดับปุ่มบนแถบ) → ตัวช่วย → boot
ORDER = [
    'core/01_core.js',
    'core/02_theme.js',
    'core/03_ui.js',
    'modules/mod_sla.js',
    'modules/mod_overdue.js',
    'modules/mod_bot_return.js',
    'modules/qa_templates.js',
    'modules/mod_qa_repair.js',
    'modules/mod_my_handoff.js',
    'modules/tweaks.js',
    'core/99_boot.js',
]

def read(p):
    with io.open(os.path.join(SRC, p), encoding='utf-8') as f:
        return f.read()

def main():
    header = read('header.txt').replace('__VERSION__', VERSION).rstrip() + '\n'
    if PAGES_URL:
        u = PAGES_URL.rstrip('/') + '/Bplus_SP_Suite.user.js'
        header = header.replace('// ==/UserScript==', f'// @updateURL    {u}\n// @downloadURL  {u}\n// ==/UserScript==')
    parts = [header, '\n(function () {\n  \'use strict\';\n']
    for p in ORDER:
        parts.append(f'\n  // ───────────── {p} ─────────────\n')
        parts.append(read(p).replace('__VERSION__', VERSION))
    parts.append('\n})();\n')
    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, 'Bplus_SP_Suite.user.js')
    with io.open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(parts))
    lines = sum(1 for _ in io.open(out, encoding='utf-8'))
    print(f'✔ Build สำเร็จ → {out}  ({lines:,} บรรทัด, v{VERSION})')

    # อัปเดตเว็บคู่มือ (site/) ให้มีสคริปต์ล่าสุดและเลขเวอร์ชันตรงกัน
    site = os.path.join(ROOT, 'docs')   # GitHub Pages: Settings › Pages › main / docs
    idx = os.path.join(site, 'index.html')
    if os.path.exists(idx):
        shutil.copyfile(out, os.path.join(site, 'Bplus_SP_Suite.user.js'))
        html = io.open(idx, encoding='utf-8').read()
        html = re.sub(r'(<span class="ver">)[^<]*(</span>)', r'\g<1>' + VERSION + r'\g<2>', html)
        io.open(idx, 'w', encoding='utf-8', newline='\n').write(html)
        print(f'✔ อัปเดต docs/ (สคริปต์ + เลขเวอร์ชัน v{VERSION})')

if __name__ == '__main__':
    main()
