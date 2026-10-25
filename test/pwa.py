"""Production/offline smoke test. Run after npm run build: python test/pwa.py.
Requires Python Playwright and Chromium (available in the cloud environment).
The portable HTML is served locally because this runner blocks file:// URLs.
"""
import json, pathlib, tempfile, zipfile, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass
with tempfile.TemporaryDirectory() as td:
 target=pathlib.Path(td)
 (target/'codexxxxx').symlink_to(root/'dist',target_is_directory=True)
 for entry in (root/'dist').iterdir(): (target/entry.name).symlink_to(entry,target_is_directory=entry.is_dir())
 with zipfile.ZipFile(root/'releases/Lamina-Mac.zip') as z: z.extractall(target/'portable')
 server=ThreadingHTTPServer(('127.0.0.1',0), functools.partial(Quiet,directory=td))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 base=f'http://127.0.0.1:{server.server_port}'
 results=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for prefix in ['', 'codexxxxx']:
   context=browser.new_context()
   page=context.new_page();errors=[]
   page.on('pageerror',lambda error: errors.append(str(error)))
   page.goto(base + '/' + (prefix + '/' if prefix else ''))
   page.get_by_role('heading',name='Una lámina a la vez.').wait_for()
   page.wait_for_function('!!navigator.serviceWorker.controller',timeout=30000)
   count=page.evaluate('(async () => { const key=(await caches.keys())[0]; return (await (await caches.open(key)).keys()).length; })()')
   assert count>=80, count
   context.set_offline(True)
   page.reload()
   page.get_by_role('heading',name='Una lámina a la vez.').wait_for()
   assert page.locator('.slide-image').evaluate('(img) => img.complete && img.naturalWidth>0')
   image_count=page.evaluate(r'(async () => { let c=await(await fetch("./data/cards.json")).json(); for(let x of c) {const r=await fetch(new URL(x.image.replace(/^\//, ""), document.baseURI)); if(!r.ok) throw new Error(x.id);} return c.length; })()')
   page.get_by_label('Tu respuesta',exact=True).fill('matriz interterritorial')
   page.get_by_role('button',name='Comprobar respuesta',exact=True).click()
   page.get_by_text('¡Bien recordado!',exact=True).wait_for()
   results.append({'edition':prefix or 'domain-root','cached_assets':count,'offline_images':image_count,'errors':errors})
   assert not errors
   context.close()
  context=browser.new_context();page=context.new_page();errors=[];requests=[]
  page.on('pageerror',lambda error: errors.append(str(error)))
  page.on('request',lambda request: requests.append(request.url))
  page.goto(f'{base}/portable/Lamina.html')
  page.get_by_role('heading',name='Una lámina a la vez.').wait_for()
  page.get_by_label('Tu respuesta',exact=True).fill('matriz interterritorial')
  page.get_by_role('button',name='Comprobar respuesta',exact=True).click()
  page.get_by_text('¡Bien recordado!',exact=True).wait_for()
  page.get_by_role('button',name='Siguiente lámina',exact=True).click()
  page.get_by_role('heading',name='Identifique el componente de la célula en A',exact=True).wait_for()
  subrequests=[u for u in requests if u.startswith(('https://','http://')) and not u.endswith('/portable/Lamina.html')]
  results.append({'edition':'portable','http_subresources':subrequests,'errors':errors})
  assert not errors
  assert not subrequests
  browser.close()
 print(json.dumps(results,ensure_ascii=False))
 server.shutdown()
