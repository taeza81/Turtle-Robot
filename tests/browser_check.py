"""Real-browser workflow checks. Start `npm start` before running this script."""
import argparse
import json
import shutil
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:3000')
parser.add_argument('--browser', default=shutil.which('chromium'))
parser.add_argument('--artifacts', default=str(Path(tempfile.gettempdir()) / 'turtle-hangul-check'))
args = parser.parse_args()
artifacts = Path(args.artifacts)
artifacts.mkdir(parents=True, exist_ok=True)
characters = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'
counts = [1, 1, 2, 3, 3, 4, 2, 1, 2, 3, 2, 3, 4, 3]
errors = []


def prepare(context):
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.clock.install(time=0)
    page.clock.pause_at(1000)
    page.goto(args.base_url)
    page.wait_for_selector('.letter', state='attached')
    return page


def choose(page, index):
    page.locator('#change-letter').click()
    page.locator('.letter').nth(index).click()


def set_speed(page, value):
    page.locator('#teacher-button').click()
    page.locator('#speed').select_option(value)
    page.locator('#teacher-dialog form button').click()


def assert_locked(page):
    assert page.locator('body').evaluate('(el) => el.classList.contains("is-running")')
    assert page.locator('button:enabled, input:enabled, select:enabled').count() == 0
    assert page.locator('#interaction-shield').is_visible()
    assert page.locator('#lock-notice').is_visible()
    assert page.locator('details').evaluate_all('(els) => els.every(el => el.inert)')


def finish(page):
    for _ in range(35):
        if page.locator('#completion').is_visible():
            break
        assert_locked(page)
        page.clock.run_for(1000)
    assert page.locator('#completion').is_visible(), 'Animation did not complete'
    assert page.locator('.letter:enabled').count() == 14
    assert page.locator('#interaction-shield').is_hidden()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=args.browser)
    context = browser.new_context(viewport={'width': 1280, 'height': 1050})
    page = prepare(context)
    assert page.locator('.letter').count() == 14
    set_speed(page, '160')

    for i, char in enumerate(characters):
        choose(page, i)
        assert page.locator('#big-letter').inner_text() == char
        assert page.locator('#routes .route').count() == counts[i]
        page.locator('#place').focus()
        page.keyboard.press('Enter')
        assert_locked(page)
        # Native controls, capture guard, keyboard and SVG must not change state.
        page.locator('.letter').nth((i + 1) % 14).evaluate('(el) => el.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))')
        page.locator('#place').evaluate('(el) => el.click()')
        page.locator('#change-letter').evaluate('(el) => el.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))')
        page.locator('#help-button').evaluate('(el) => el.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))')
        page.keyboard.press('Space')
        page.keyboard.press('Tab')
        page.keyboard.press('Enter')
        box = page.locator('#board').bounding_box()
        page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        assert page.locator('#big-letter').inner_text() == char
        assert page.locator('dialog[open]').count() == 0
        assert_locked(page)
        page.clock.run_for(200)
        assert float(page.locator('.painted-route').first.get_attribute('stroke-dasharray').split()[0]) > 0
        if char == 'ㄷ':
            page.clock.run_for(1500)
            assert page.locator('.transfer').count() == 1
            assert page.locator('.painted-route').nth(1).get_attribute('visibility') == 'hidden'
            assert_locked(page)
            before = page.locator('.painted-route').first.get_attribute('stroke-dasharray')
            page.clock.run_for(300)
            assert page.locator('.painted-route').first.get_attribute('stroke-dasharray') == before
            assert page.locator('.painted-route').nth(1).get_attribute('visibility') == 'hidden'
        finish(page)
        assert page.locator('#paint-progress').get_attribute('value') == str(counts[i])
        assert page.locator('.transfer').count() == 0
        for route in page.locator('.painted-route').all():
            painted, length_plus_one = map(float, route.get_attribute('stroke-dasharray').split())
            assert abs(painted - (length_plus_one - 1)) < .01
    saved = json.loads(page.evaluate('localStorage.getItem("turtle-hangul-seen-v1")'))
    assert set(saved) == set(characters)
    page.reload()
    assert '14개 중 14개' in page.locator('#collection').inner_text()
    # Replay must lock again and return controls when it ends.
    page.locator('#place').click()
    assert_locked(page)
    finish(page)
    page.locator('#place').click()
    assert_locked(page)
    finish(page)
    page.locator('#teacher-button').click()
    page.locator('#teacher-dialog summary').click()
    page.locator('#reset-progress').click()
    assert '14개 중 14개' in page.locator('#collection').inner_text()
    page.locator('#reset-progress').click()
    assert '14개 중 0개' in page.locator('#collection').inner_text()
    page.locator('#teacher-dialog form button').click()
    page.locator('#teacher-button').click()
    page.locator('#help-button').click()
    page.keyboard.press('Escape')
    assert page.locator('#help-dialog').is_hidden()
    page.locator('#teacher-dialog form button').click()
    print('PASS: all 14 consonants, full animation, stroke order/count, completion and replay')
    print('PASS: all controls locked during drawing and transfer; click/key/SVG attempts blocked')
    print('PASS: letter picker, saved progress, two-step deletion, help dialog keyboard close')

    for width, height, label in [(1180, 820, 'tablet-landscape'), (820, 1180, 'tablet-portrait')]:
        page.set_viewport_size({'width': width, 'height': height})
        area = page.locator('.canvas-area').bounding_box()
        assert area['width'] * area['height'] > width * height * .5
        assert page.locator('button:visible').count() == 4
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 2')
        gear = page.locator('#teacher-button').bounding_box()
        assert gear['width'] >= 64 and gear['height'] >= 64
        assert width - (gear['x'] + gear['width']) <= 24
        assert height - (gear['y'] + gear['height']) <= 24
        assert page.get_by_role('button', name='교사 설정', exact=True).count() == 1
        page.screenshot(path=str(artifacts / f'{label}.png'), full_page=True)
    print('PASS: tablet portrait/landscape canvas, no scrolling, large bottom-right settings gear, four initial controls')

    reduced = browser.new_context(reduced_motion='reduce', viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    mobile = prepare(reduced)
    choose(mobile, 13)
    assert mobile.locator('#speed').input_value() == 'reduced'
    mobile.locator('#place').tap()
    assert mobile.locator('#paint-progress').get_attribute('value') == '0'
    assert_locked(mobile)
    for count in range(1, 4):
        mobile.clock.run_for(1300)
        assert mobile.locator('#paint-progress').get_attribute('value') == str(count)
    assert mobile.locator('#completion').is_visible()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.screenshot(path=str(artifacts / 'app-mobile.png'), full_page=True)
    # Touch the enlarged SVG start target; no drag is required.
    choose(mobile, 0)
    set_speed(mobile, '160')
    mobile.locator('#board').scroll_into_view_if_needed()
    point = mobile.locator('#board').evaluate('(svg) => { const p = new DOMPoint(160, 140).matrixTransform(svg.getScreenCTM()); return {x:p.x,y:p.y}; }')
    mobile.touchscreen.tap(point['x'], point['y'])
    assert_locked(mobile)
    finish(mobile)
    print('PASS: mobile touch start, reduced-motion automatic strokes and input lock, no horizontal overflow')

    private = browser.new_context()
    private.add_init_script("Object.defineProperty(window, 'localStorage', {get() {throw new DOMException('Blocked', 'SecurityError')}})")
    no_storage = prepare(private)
    assert '저장되지 않아요' in no_storage.locator('#storage-note').inner_text()
    no_storage.locator('#place').click()
    finish(no_storage)
    assert not errors, errors
    print('PASS: storage denied fallback; no browser JavaScript errors')
    browser.close()
