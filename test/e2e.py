"""Browser checks. Run a local dev server, then: python test/e2e.py.
Requires Python Playwright and Chromium (installed in the cloud environment).
LAMINA_URL and CHROMIUM_PATH can override the defaults.
"""
import os
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1050},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append('console '+m.text) if m.type=='error' else None)
 page.goto(os.environ.get('LAMINA_URL', 'http://127.0.0.1:5173'),wait_until='networkidle')
 page.screenshot(path='/tmp/lamina-desktop.png',full_page=True)
 print('initial',page.locator('.question-number').inner_text(),page.locator('[role=timer]').inner_text())
 print('overflow desktop',page.evaluate('document.documentElement.scrollWidth>innerWidth'))
 page.locator('#answer').fill('osteocito')
 page.get_by_role('button',name='Comprobar respuesta').click()
 assert page.locator('#answer-feedback').count()==1
 assert page.locator('.official-answer').inner_text()=='Matriz interterritorial'
 assert page.get_by_role('button',name='Siguiente lámina').count()==0
 assert '01' in page.locator('.question-number').inner_text()
 page.get_by_role('button',name='Intentar de nuevo').click()
 assert page.locator('#answer-feedback').count()==0
 assert '01' in page.locator('.question-number').inner_text()
 page.locator('#answer').fill('  matriz interteritorial ')
 page.get_by_role('button',name='Comprobar respuesta').click()
 assert page.locator('.feedback-correct').count()==1
 page.get_by_role('button',name='Siguiente lámina').click()
 assert '02' in page.locator('.question-number').inner_text()
 print('PASS wrong/retry/typo/next')
 page.get_by_role('button',name='Guardar lámina',exact=True).click()
 page.reload(wait_until='networkidle')
 assert '02' in page.locator('.question-number').inner_text()
 assert page.get_by_role('button',name='Quitar de guardadas',exact=True).count()==1
 print('PASS bookmark reload')
 before=json.loads(page.evaluate('localStorage.getItem("lamina.session.v1")'))
 page.wait_for_timeout(1200)
 page.reload(wait_until='networkidle')
 after=json.loads(page.evaluate('localStorage.getItem("lamina.session.v1")'))
 assert before['deadline']==after['deadline']
 page.get_by_role('button',name='Pausar sesión').click()
 assert page.locator('.pause-overlay').is_visible()
 paused=page.locator('[role=timer]').inner_text()
 page.wait_for_timeout(1300)
 assert paused==page.locator('[role=timer]').inner_text()
 page.get_by_role('button',name='Continuar estudiando').click()
 assert not page.locator('.pause-overlay').count()
 print('PASS timer persist/pause/resume')
 page.evaluate('''() => {let s=JSON.parse(localStorage.getItem('lamina.session.v1'));s.deadline=Date.now()-1000;localStorage.setItem('lamina.session.v1',JSON.stringify(s));}''')
 page.reload(wait_until='networkidle')
 assert page.get_by_text('El tiempo terminó',exact=True).count()==1
 assert '02' in page.locator('.question-number').inner_text()
 assert page.locator('.official-answer').inner_text()=='Miofibrillas'
 assert not page.get_by_role('button',name='Siguiente lámina').count()
 page.get_by_role('button',name='Intentar de nuevo').click()
 print('PASS timeout correction no advance')
 page.get_by_role('button',name='Mi colección').click()
 assert page.locator('.library-card').count()==70
 page.get_by_role('textbox',name='Buscar láminas').fill('70')
 assert page.locator('.library-card').count()==1
 page.get_by_role('textbox',name='Buscar láminas').fill('')
 page.get_by_role('combobox',name='Filtrar por tema').select_option('Cartílago')
 count=page.locator('.library-card').count()
 assert 0<count<70
 page.get_by_role('combobox',name='Filtrar por tema').select_option('Todas')
 page.locator('.library-tabs').get_by_role('button',name='Guardadas').click()
 assert page.locator('.library-card').count()==1
 page.get_by_role('button',name='Mi progreso').click()
 assert page.locator('.metric-card').count()==4
 print('PASS library search/filter/bookmarks and progress')
 page.get_by_role('button',name='Estudiar',exact=True).click()
 assert page.locator('.pause-overlay').is_visible()
 page.get_by_role('button',name='Continuar estudiando').click()
 print('console diagnostics', errors)
 assert not errors, errors
 # Reset separate responsive contexts, then screenshot pristine study UI.
 for name,size in [('mobile',{'width':390,'height':844}),('ipad',{'width':820,'height':1180})]:
  ctx=browser.new_context(viewport=size,device_scale_factor=1,is_mobile=True,has_touch=True)
  q=ctx.new_page();q.goto(os.environ.get('LAMINA_URL', 'http://127.0.0.1:5173'),wait_until='networkidle');q.screenshot(path=f'/tmp/lamina-{name}.png',full_page=True)
  print(name,'overflow',q.evaluate('document.documentElement.scrollWidth>innerWidth'),'image',q.locator('.slide-image').bounding_box(),'primary',q.get_by_role('button',name='Comprobar respuesta').bounding_box())
  q.get_by_role('button',name='Abrir menú').click() if q.get_by_role('button',name='Abrir menú').is_visible() else None
  if name=='mobile':
   assert q.locator('.sidebar').is_visible()
   q.get_by_role('button',name='Mi colección').click()
   assert q.locator('.library-card').count()==70
   assert not q.evaluate('document.documentElement.scrollWidth>innerWidth')
  ctx.close()
 browser.close()
