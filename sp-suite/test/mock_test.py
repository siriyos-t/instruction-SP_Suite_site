# ทดสอบ suite บนหน้าจำลองของ cloudbplusai (header + คิวซ้าย) พร้อม API ปลอม
import json, os, sys, asyncio
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = open(os.path.join(ROOT, 'dist', 'Bplus_SP_Suite.user.js'), encoding='utf-8').read()
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'test', 'shots')
os.makedirs(OUT, exist_ok=True)

PAGE = '''<!doctype html><html><head><meta charset="utf-8"><title>Bplus AI</title>
<style>body{margin:0;font-family:system-ui;background:#f8fafc}
.side{position:fixed;left:0;top:0;bottom:0;width:234px;background:#0b1a33;color:#fff;padding:16px}
.main{margin-left:234px}
header{display:flex;align-items:center;gap:16px;height:56px;padding:0 16px;background:#fff;border-bottom:1px solid #e2e8f0;justify-content:space-between}
.grid{display:grid;grid-template-columns:2fr 3fr;gap:16px;padding:16px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px}
</style></head><body>
<div class="side"><b>Bplus AI</b><div style="opacity:.7;font-size:12px">Knowledge Center</div></div>
<div class="main">
<header><div style="display:flex;gap:8px;align-items:center"><button>☰</button>
<div style="display:flex;border:1px solid #e2e8f0;border-radius:8px;padding:4px 8px;width:440px"><input placeholder="ค้นหา article, ลูกค้า, action item..." style="border:0;flex:1"><button>ค้นหา</button></div></div>
<div style="display:flex;gap:16px;align-items:center"><span>🔔</span><span>ศิริยศ (SP ERP)</span></div></header>
<h1 style="margin:16px">Handoff Queue</h1>
<div class="grid">
 <div class="card lg:col-span-2">
   <div class="flex" style="display:flex;gap:6px"><button>คิวรอ (Reactive)</button><button>เข้ารับช่วงเอง</button></div>
   <div id="list">
    <button class="text-left" style="display:block;width:100%;text-align:left;margin-top:8px;padding:8px;border:1px solid #eee;background:#fff"><span>S1785812787926</span><div>ในส่วนนี้ไม่มีแนวทางอื่นเลยใช่มั้ยครับ</div><div>15/10/2569 15:20</div></button>
    <button class="text-left" style="display:block;width:100%;text-align:left;margin-top:8px;padding:8px;border:1px solid #eee;background:#fff"><span>S1790671153904</span><div>แอป BplusVansales เครื่อง Van3</div><div>21/10/2569 17:04</div></button>
   </div>
 </div>
 <div class="card lg:col-span-3"><span>S1785722858733</span><div class="overflow-y-auto" style="height:200px;overflow:auto"><div style="height:600px">chat</div></div></div>
</div></div>
<script>
 // จำลอง React render ลง <body>: ล้าง body แล้วใส่เนื้อหาใหม่หลังโหลด
 const __saved = document.body.innerHTML;
 setTimeout(()=>{ [...document.documentElement.attributes].forEach(x=>document.documentElement.removeAttribute(x.name)); document.documentElement.setAttribute('lang','th'); document.body.textContent=''; document.body.innerHTML = __saved.replace(/<script[\s\S]*?<\/script>/g,''); }, 1200);
 setTimeout(()=>fetch('/api/chatbot/handoff/queue?mode=active&limit=20&productId=all',{headers:{Authorization:'Bearer TESTTOKEN.eyJ1c2VySWQiOjM2fQ.x'}}),300);
</script>
</body></html>'''

def api(path):
    if path.startswith('/api/auth/me'): return {'data': {'id': 36, 'fullName': 'ทดสอบ ผู้ใช้ (SP ERP)', 'username': 'test'}}
    if path.startswith('/api/products'): return {'success': True, 'data': [{'id': 1, 'name': 'Bplus ERP'}, {'id': 2, 'name': 'Bplus POS'}, {'id': 3, 'name': 'Bplus HRM'}]}
    if path.startswith('/api/action-items?overdue'):
        return {'data': [
            {'id': 11, 'title': 'แก้บทความ VAT', 'assignee_name': 'สมชาย (SP ERP)', 'assigned_to': 5, 'due_date': '2026-10-10'},
            {'id': 12, 'title': 'อัปเดตคู่มือ', 'assignee_name': 'สมชาย (SP ERP)', 'assigned_to': 5, 'due_date': '2026-10-19'},
            {'id': 13, 'title': 'POS ใบกำกับ', 'assignee_name': 'มานี (SP SE)', 'assigned_to': 6, 'due_date': '2026-10-15'},
            {'id': 14, 'title': 'HR ลาพักร้อน', 'assignee_name': 'สุดา (SP HRM)', 'assigned_to': 7, 'due_date': '2026-10-01'}]}
    if path.startswith('/api/action-items'): return {'data': [{'id': 1, 'action_code': 'AI-001', 'title': 'งานของฉัน', 'status': 'Open'}]}
    if path.startswith('/api/chatbot/handoff/queue'):
        return {'data': [{'session_code': 'S1785812787926', 'external_user_id': 'line:U1', 'handoff_mode': 'waiting', 'product_name': 'Bplus ERP', 'lastCustomerMessage': 'ทดสอบ', 'handoff_at': '2026-10-21T08:00:00Z'},
                         {'session_code': 'S1790671153904', 'external_user_id': 'line:U2', 'handoff_mode': 'human', 'assigned_agent_id': 36, 'product_name': 'Bplus ERP', 'lastCustomerMessage': 'Van3 เด้งออก', 'handoff_at': '2026-10-21T10:00:00Z'}]}
    if path.startswith('/api/chatbot/monitor/sessions'): return {'data': [{'session_code': 'S1', 'product_name': 'Bplus ERP', 'handoff_mode': 'bot', 'lastCustomerMessage': 'hi', 'started_at': '2026-10-21T02:00:00Z'}]}
    return {'data': []}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if False else None)
        ctx = await b.new_context(viewport={'width': 1600, 'height': 900})
        seen = []
        async def handle(route):
            url = route.request.url
            path = url.split('bplus.co.th', 1)[1]
            if path.startswith('/api/'):
                seen.append(path)
                await route.fulfill(status=200, content_type='application/json', body=json.dumps(api(path)))
            elif 'fonts.g' in url:
                await route.abort()
            else:
                await route.fulfill(status=200, content_type='text/html', body=PAGE)
        await ctx.route('https://cloudbplusai.bplus.co.th/**', handle)
        await ctx.route('https://fonts.googleapis.com/**', lambda r: r.abort())
        await ctx.add_init_script(script="localStorage.setItem('bplus_ai_token','TESTTOKEN.eyJ1c2VySWQiOjM2fQ.x');" + SCRIPT)
        page = await ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
        await page.goto('https://cloudbplusai.bplus.co.th/handoff-queue')
        await page.wait_for_timeout(3500)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}/01_first_run.png')
        # เลือกแผนก ERP
        await page.click('.sp-drawer [data-dept="ERP"]')
        await page.wait_for_timeout(500)
        await page.screenshot(path=f'{OUT}/02_settings.png')
        await page.click('.sp-dock [data-open="overdue"]')
        await page.wait_for_timeout(800)
        await page.screenshot(path=f'{OUT}/03_overdue.png')
        await page.click('.sp-dock [data-open="bot"]')
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f'{OUT}/04_bot.png')
        await page.click('.sp-dock [data-open="sla"]')
        await page.click('#hub-fetch-btn')
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f'{OUT}/05_sla.png')
        await page.click('.sp-dock [data-open="qa"]')
        await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/06_qa.png')
        await page.screenshot(path=f'{OUT}/06b_qa_bottom.png')
        await page.click('.sp-dock [data-open="settings"]')
        await page.click('[data-remind-test]')
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}/06c_notice.png')
        await page.click('.sp-dock [data-open="home"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/07_home.png')
        await page.keyboard.press('Escape')
        await page.click('#sp-fetch-profiles-btn')
        await page.wait_for_timeout(1200)
        await page.screenshot(path=f'{OUT}/08_queue_inject.png', clip={'x': 234, 'y': 0, 'width': 1366, 'height': 520})
        # HRM + light theme
        await page.click('.sp-dock [data-open="settings"]')
        await page.click('.sp-drawer [data-dept="HRM"]')
        await page.click('.sp-drawer [data-base="light"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/09_hrm_light.png')
        info = await page.evaluate("""() => ({
          dockSlot: document.querySelector('.sp-dock').dataset.slot,
          slaProduct: document.getElementById('hub-product-select').value,
          botProduct: document.getElementById('bplus-filter-product').value,
          ovdTab: document.querySelector('#sp-pane-overdue [data-dept-tab].sp-on').dataset.deptTab,
          ids: ['repair-run-btn','bplus-execute-btn','hub-fetch-btn','bplus-assignee-list'].map(i=>!!document.getElementById(i))
        })""")
        print('INFO', info)
        print('API', sorted(set(x.split('?')[0] for x in seen)))
        print('QUEUE_REQ', [x for x in seen if 'handoff/queue' in x][:4])
        print('ERRORS', errs)
        await b.close()

asyncio.run(main())
