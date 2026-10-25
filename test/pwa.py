"""Production/offline checks. Run npm run build, then python test/pwa.py.
Requires Python Playwright and Chromium (available in the cloud environment).
Portable HTML is served locally because this runner blocks file:// URLs.
"""
import functools
import json
from pathlib import Path
import tempfile
import threading
import zipfile
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
CARDS = {card['id']: card for card in json.loads((ROOT / 'public/data/cards.json').read_text())}


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start_and_answer(page, size=10):
    page.get_by_role('heading', name='Tu sesión, a tu medida.').wait_for()
    page.get_by_role('radio', name=f'{size} láminas', exact=True).check()
    page.get_by_role('button', name='Comenzar sesión', exact=True).click()
    page.locator('#answer').wait_for()
    session = page.evaluate('JSON.parse(localStorage.getItem("lamina.session.v1"))')
    assert len(session['queue']) == size == len(set(session['queue']))
    card = CARDS[session['queue'][0]]
    expect(page.locator('.slide-image')).to_be_visible()
    page.wait_for_function('document.querySelector(".slide-image")?.complete && document.querySelector(".slide-image").naturalWidth > 0')
    page.get_by_label('Tu respuesta', exact=True).fill(card['answer'])
    page.get_by_role('button', name='Comprobar respuesta', exact=True).click()
    page.get_by_text('¡Bien recordado!', exact=True).wait_for()
    page.get_by_role('button', name='Siguiente lámina', exact=True).click()
    page.wait_for_function('JSON.parse(localStorage.getItem("lamina.session.v1")).index === 1')
    assert ''.join(page.locator('.question-number').inner_text().split()) == f'Pregunta02/{size}'


with tempfile.TemporaryDirectory() as directory:
    target = Path(directory)
    (target / 'codexxxxx').symlink_to(ROOT / 'dist', target_is_directory=True)
    for entry in (ROOT / 'dist').iterdir():
        (target / entry.name).symlink_to(entry, target_is_directory=entry.is_dir())
    with zipfile.ZipFile(ROOT / 'releases/Lamina-Mac.zip') as archive:
        archive.extractall(target / 'portable')
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=directory))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    results = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            for prefix in ['', 'codexxxxx']:
                context = browser.new_context()
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(base + '/' + (prefix + '/' if prefix else ''))
                page.get_by_role('heading', name='Tu sesión, a tu medida.').wait_for()
                page.wait_for_function('!!navigator.serviceWorker.controller', timeout=30000)
                count = page.evaluate('(async () => { const key=(await caches.keys())[0]; return (await (await caches.open(key)).keys()).length; })()')
                assert count >= 80, count
                context.set_offline(True)
                page.reload()
                page.get_by_role('heading', name='Tu sesión, a tu medida.').wait_for()
                image_count = page.evaluate(r'''(async () => { const cards = await (await fetch('./data/cards.json')).json(); for (const card of cards) { const response = await fetch(new URL(card.image.replace(/^\//, ''), document.baseURI)); if (!response.ok) throw new Error(card.id); } return cards.length; })()''')
                assert image_count == 70
                start_and_answer(page, 15)
                assert not errors, errors
                results.append({'edition': prefix or 'domain-root', 'cached_assets': count, 'offline_images': image_count, 'random_session': 15, 'errors': errors})
                context.close()
            context = browser.new_context()
            page = context.new_page()
            errors, requests = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: requests.append(request.url))
            page.goto(f'{base}/portable/Lamina.html')
            start_and_answer(page, 10)
            subrequests = [url for url in requests if url.startswith(('https://', 'http://')) and not url.endswith('/portable/Lamina.html')]
            assert not errors, errors
            assert not subrequests, subrequests
            results.append({'edition': 'portable', 'random_session': 10, 'http_subresources': subrequests, 'errors': errors})
            browser.close()
        print(json.dumps(results, ensure_ascii=False))
    finally:
        server.shutdown()
