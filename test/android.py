"""Tablet Android browser/portable checks and optional APK integrity checks.
Run after npm run build (and optional scripts/build-android.py): python test/android.py.
Uses desktop Chromium touch/Android-UA emulation, not an Android device emulator.
The portable is served by a temporary HTTP server because the runner blocks file://.
"""
import functools
import json
import re
from pathlib import Path
import tempfile
import sys
import threading
import zipfile
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
CARDS = {card['id']: card for card in json.loads((ROOT / 'public/data/cards.json').read_text())}
NATIVE_SOURCE = (ROOT / 'android/src/cl/lamina/study/MainActivity.java').read_text()
CSP = re.search(r'headers.put\("Content-Security-Policy", "([^"]+)"\)', NATIVE_SOURCE).group(1)
USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'


class Quiet(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, *args):
        pass


def stored(page, key='lamina.session.v1'):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)


def start(page, size):
    page.get_by_role('heading', name='Tu sesión, a tu medida.').wait_for()
    page.get_by_role('radio', name=f'{size} láminas', exact=True).check()
    page.get_by_role('button', name='Comenzar sesión', exact=True).click()
    page.locator('#answer').wait_for()
    session = stored(page)
    assert len(session['queue']) == len(set(session['queue'])) == size
    if size == 70:
        assert set(session['queue']) == set(CARDS)
    assert session['remaining'] == 120
    assert 0 < session['deadline'] - page.evaluate('Date.now()') <= 120000
    return session


def check_apk():
    apk = ROOT / 'releases/Lamina-Android.apk'
    if not apk.exists():
        return {'apk': 'not built; package checks unrun'}
    with zipfile.ZipFile(apk) as archive:
        assert archive.testzip() is None
        required = {'AndroidManifest.xml', 'classes.dex', 'assets/Lamina.html', 'assets/pauta.pdf'}
        assert required <= set(archive.namelist()), sorted(required - set(archive.namelist()))
        manifest = archive.read('AndroidManifest.xml')
        assert manifest[:4] == b'\x03\x00\x08\x00', 'Manifest must be compiled binary XML.'
        dex = archive.read('classes.dex')
        assert dex[:4] == b'dex\n' and len(dex) > 1000
        html = archive.read('assets/Lamina.html').decode('utf-8')
        assert 'window.__LAMINA_CARDS__=' in html and 'Comenzar sesión' in html
        assert archive.read('assets/pauta.pdf').startswith(b'%PDF-')
    return {'apk': 'structure and ZIP integrity passed', 'bytes': apk.stat().st_size, 'real_android_runtime': 'not tested'}


if '--apk-only' in sys.argv:
    result = check_apk()
    assert result['apk'] == 'structure and ZIP integrity passed', result
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(0)


portable = ROOT / 'releases/Lamina-Android.zip'
if not portable.exists():
    portable = ROOT / 'releases/Lamina-Mac.zip'
with tempfile.TemporaryDirectory() as directory:
    with zipfile.ZipFile(portable) as archive:
        archive.extractall(directory)
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=directory))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/Lamina.html'
    results = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            for orientation, viewport, size in [
                ('portrait', {'width': 800, 'height': 1280}, 10),
                ('landscape', {'width': 1280, 'height': 800}, 70),
            ]:
                context = browser.new_context(viewport=viewport, user_agent=USER_AGENT, is_mobile=True, has_touch=True)
                page = context.new_page()
                errors, requests = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                page.on('request', lambda request: requests.append(request.url))
                page.clock.install()
                page.goto(url, wait_until='networkidle')
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                session = start(page, size)
                first_id = session['queue'][0]
                first = CARDS[first_id]
                page.wait_for_function('document.querySelector(".slide-image")?.complete && document.querySelector(".slide-image").naturalWidth > 0')
                page.screenshot(path=f'/tmp/lamina-android-{orientation}.png', full_page=True)
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')

                # Touch controls and details remain usable at tablet sizes.
                page.get_by_role('button', name='Ampliar imagen', exact=True).click()
                expect(page.get_by_role('dialog')).to_be_visible()
                assert page.locator('.zoom-image').evaluate('img => img.complete && img.naturalWidth > 0')
                page.get_by_role('button', name='Cerrar', exact=True).click()
                page.get_by_role('button', name='Pausar sesión', exact=True).click()
                expect(page.locator('.pause-overlay')).to_be_visible()
                paused = page.locator('[role=timer]').inner_text()
                page.clock.fast_forward(130000)
                assert page.locator('[role=timer]').inner_text() == paused
                page.get_by_role('button', name='Continuar estudiando', exact=True).click()

                # A mistaken answer cannot advance; correction uses the original key.
                page.locator('#answer').fill('respuesta incorrecta para esta imagen')
                page.get_by_role('button', name='Comprobar respuesta', exact=True).click()
                expect(page.locator('.official-answer')).to_have_text(first['answer'])
                assert stored(page)['index'] == 0
                assert not page.get_by_role('button', name='Siguiente lámina', exact=True).count()
                page.get_by_role('button', name='Intentar de nuevo', exact=True).click()
                assert stored(page)['queue'][0] == first_id
                page.locator('#answer').fill(first['answer'])
                page.get_by_role('button', name='Comprobar respuesta', exact=True).click()
                expect(page.locator('.feedback-correct')).to_be_visible()
                page.get_by_role('button', name='Siguiente lámina', exact=True).click()
                assert stored(page)['index'] == 1
                assert stored(page, 'lamina.progress.v1')['cards'][first_id]['correct'] == 1

                # Resize (orientation change) does not reset an in-memory session.
                original_queue = stored(page)['queue']
                rotated = {'width': viewport['height'], 'height': viewport['width']}
                page.set_viewport_size(rotated)
                assert stored(page)['queue'] == original_queue and stored(page)['index'] == 1
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                page.get_by_role('button', name='Guardar lámina', exact=True).click()
                progress_before = stored(page, 'lamina.progress.v1')
                bookmarks_before = stored(page, 'lamina.bookmarks.v1')
                page.reload(wait_until='networkidle')
                page.get_by_role('heading', name='Tu sesión, a tu medida.').wait_for()
                assert stored(page, 'lamina.progress.v1') == progress_before
                assert stored(page, 'lamina.bookmarks.v1') == bookmarks_before

                subrequests = [request for request in requests if request.startswith(('http://', 'https://')) and request != url]
                assert not subrequests, subrequests
                assert not errors, errors
                results.append({'orientation': orientation, 'random_session': size, 'errors': errors, 'additional_http_requests': subrequests})
                context.close()
            browser.close()
        results.append(check_apk())
        print(json.dumps(results, ensure_ascii=False))
    finally:
        server.shutdown()
