"""Browser checks for randomized sessions. Start Vite, then python test/e2e.py.
Requires Python Playwright and Chromium (installed in the cloud environment).
LAMINA_URL and CHROMIUM_PATH may override the defaults.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('LAMINA_URL', 'http://127.0.0.1:5173')
ROOT = Path(__file__).resolve().parents[1]
CARDS = {c['id']: c for c in json.loads((ROOT / 'public/data/cards.json').read_text())}
SIZES = [10, 15, 30, 40, 70]


def stored_session(page):
    return page.evaluate('JSON.parse(localStorage.getItem("lamina.session.v1"))')


def current_card(page):
    session = stored_session(page)
    return CARDS[session['queue'][session['index']]]


def open_picker(page):
    page.get_by_role('heading', name='Tu sesión, a tu medida.').wait_for()
    assert not page.locator('#answer').count(), 'The picker must not show a timed question.'
    assert not page.locator('[role=timer]').count(), 'Time must start only after choosing a session.'


def start(page, size):
    page.get_by_role('radio', name=f'{size} láminas', exact=True).check()
    page.get_by_role('button', name='Comenzar sesión', exact=True).click()
    page.locator('#answer').wait_for()
    page.wait_for_function('(n) => {const s=JSON.parse(localStorage.getItem("lamina.session.v1")); return s?.queue.length===n && s.index===0;}', arg=size)
    session = stored_session(page)
    assert len(session['queue']) == size
    assert len(set(session['queue'])) == size, 'A session must not repeat a slide.'
    assert set(session['queue']) <= set(CARDS)
    assert session['remaining'] == 120
    assert 0 < session['deadline'] - page.evaluate('Date.now()') <= 120000
    assert ''.join(page.locator('.question-number').inner_text().split()) == f'Pregunta01/{size}'
    return session


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
        headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append('console ' + message.text) if message.type == 'error' else None)
    page.clock.install()
    page.goto(URL, wait_until='networkidle')
    open_picker(page)
    expect(page.get_by_role('radio', name='10 láminas', exact=True)).to_be_checked()
    page.screenshot(path='/tmp/lamina-sessions-desktop.png', full_page=True)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.clock.fast_forward(180000)
    assert not page.locator('#answer-feedback').count()
    open_picker(page)
    print('PASS entry picker, sizes, and no timer before starting')

    # Exercise every supported size in the actual UI, including the full bank.
    for size in SIZES:
        if size != SIZES[0]:
            page.get_by_role('button', name='Nueva sesión', exact=True).click()
            open_picker(page)
        session = start(page, size)
        if size == 70:
            assert set(session['queue']) == set(CARDS)
    print('PASS all five session sizes and unique random queues')

    # A real scientific error cannot advance; retry retains the exact original.
    first = current_card(page)
    first_id = first['id']
    page.locator('#answer').fill('respuesta totalmente equivocada')
    page.get_by_role('button', name='Comprobar respuesta', exact=True).click()
    expect(page.locator('.official-answer')).to_have_text(first['answer'])
    assert not page.get_by_role('button', name='Siguiente lámina', exact=True).count()
    assert stored_session(page)['index'] == 0
    page.get_by_role('button', name='Intentar de nuevo', exact=True).click()
    assert current_card(page)['id'] == first_id
    page.locator('#answer').fill('  ' + first['answer'].upper() + '  ')
    page.get_by_role('button', name='Comprobar respuesta', exact=True).click()
    expect(page.locator('.feedback-correct')).to_be_visible()
    frozen = page.locator('[role=timer]').inner_text()
    page.clock.fast_forward(2000)
    assert page.locator('[role=timer]').inner_text() == frozen
    page.get_by_role('button', name='Siguiente lámina', exact=True).click()
    page.wait_for_function('JSON.parse(localStorage.getItem("lamina.session.v1")).index === 1')
    assert ''.join(page.locator('.question-number').inner_text().split()) == 'Pregunta02/70'
    print('PASS incorrect/retry/correct/next and frozen reviewed timer')

    # Pause hides content; timeout corrects but keeps the current slide.
    second = current_card(page)
    page.get_by_role('button', name='Guardar lámina', exact=True).click()
    page.get_by_role('button', name='Pausar sesión', exact=True).click()
    expect(page.locator('.pause-overlay')).to_be_visible()
    paused_time = page.locator('[role=timer]').inner_text()
    page.clock.fast_forward(180000)
    assert page.locator('[role=timer]').inner_text() == paused_time
    page.get_by_role('button', name='Continuar estudiando', exact=True).click()
    assert not page.locator('.pause-overlay').count()
    page.clock.fast_forward(121000)
    page.get_by_text('El tiempo terminó', exact=True).wait_for()
    expect(page.locator('.official-answer')).to_have_text(second['answer'])
    assert current_card(page)['id'] == second['id']
    assert stored_session(page)['index'] == 1
    assert not page.get_by_role('button', name='Siguiente lámina', exact=True).count()
    page.get_by_role('button', name='Intentar de nuevo', exact=True).click()
    print('PASS pause/resume and timeout without skipping a slide')

    # Re-entering asks for a NEW session but retains cumulative progress/favorites.
    progress_before = page.evaluate('localStorage.getItem("lamina.progress.v1")')
    page.reload(wait_until='networkidle')
    open_picker(page)
    assert page.evaluate('localStorage.getItem("lamina.progress.v1")') == progress_before
    assert second['id'] in page.evaluate('JSON.parse(localStorage.getItem("lamina.bookmarks.v1"))')
    assert not stored_session(page)['queue']
    print('PASS reload returns to picker and retains progress and bookmarks')

    # Existing collection, filtering and favorites must still work.
    page.get_by_role('button', name='Mi colección').click()
    assert page.locator('.library-card').count() == 70
    page.get_by_role('textbox', name='Buscar láminas').fill('70')
    assert page.locator('.library-card').count() == 1
    page.get_by_role('textbox', name='Buscar láminas').fill('')
    page.get_by_role('combobox', name='Filtrar por tema').select_option('Cartílago')
    assert 0 < page.locator('.library-card').count() < 70
    page.get_by_role('combobox', name='Filtrar por tema').select_option('Todas')
    page.locator('.library-tabs').get_by_role('button', name='Guardadas').click()
    assert page.locator('.library-card').count() == 1
    page.get_by_role('button', name='Mi progreso').click()
    assert page.locator('.metric-card').count() == 4
    print('PASS collection search/filter/favorites and progress')

    # Finish an entire short session: completion occurs after exactly 10 successes.
    page.reload(wait_until='networkidle')
    open_picker(page)
    start(page, 10)
    ids = []
    for index in range(10):
        card = current_card(page)
        ids.append(card['id'])
        page.locator('#answer').fill(card['answer'])
        page.get_by_role('button', name='Comprobar respuesta', exact=True).click()
        expect(page.locator('.feedback-correct')).to_be_visible()
        page.get_by_role('button', name='Siguiente lámina', exact=True).click()
        page.wait_for_function('(i) => JSON.parse(localStorage.getItem("lamina.session.v1")).index === i', arg=index + 1)
    assert len(set(ids)) == 10
    expect(page.locator('.completion-card')).to_be_visible()
    assert '10 láminas' in page.locator('.completion-card').inner_text()
    assert not page.locator('#answer').count()
    page.get_by_role('button', name='Elegir otra sesión', exact=True).click()
    open_picker(page)
    print('PASS exact completion at 10 slides and fresh-session entry')
    assert not errors, errors
    print('console diagnostics', errors)

    for name, size in [('mobile', {'width': 390, 'height': 844}), ('ipad', {'width': 820, 'height': 1180})]:
        context = browser.new_context(viewport=size, device_scale_factor=1, is_mobile=True, has_touch=True)
        responsive = context.new_page()
        responsive.goto(URL, wait_until='networkidle')
        open_picker(responsive)
        assert not responsive.evaluate('document.documentElement.scrollWidth > innerWidth')
        responsive.screenshot(path=f'/tmp/lamina-sessions-{name}.png', full_page=True)
        start(responsive, 15)
        assert not responsive.evaluate('document.documentElement.scrollWidth > innerWidth')
        responsive.screenshot(path=f'/tmp/lamina-{name}.png', full_page=True)
        print(name, 'PASS picker and study without horizontal overflow')
        context.close()
    browser.close()
