"""Check deployed Pages assets against an older unversioned browser cache."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.parse import urlsplit
import shutil
from playwright.sync_api import sync_playwright

with TemporaryDirectory(prefix='turtle-pages-cache-') as temporary:
    shutil.copytree('docs', Path(temporary) / 'Turtle-Robot')

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=temporary))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True)
            page = browser.new_page(viewport={'width': 820, 'height': 1180}, has_touch=True)
            old_hits, resources, errors = [], [], []

            def stale_cache(route):
                parsed = urlsplit(route.request.url)
                if not parsed.query and parsed.path.endswith(('/app.js', '/style.css')):
                    old_hits.append(parsed.path)
                    # Old app versions had the dialog, but no sound/slider handlers.
                    if parsed.path.endswith('/app.js'):
                        route.fulfill(content_type='text/javascript', body="document.getElementById('teacher-button').onclick=()=>document.getElementById('teacher-dialog').showModal();")
                    else:
                        route.fulfill(content_type='text/css', body='body{font-family:sans-serif}')
                else:
                    route.continue_()

            page.route('**/*', stale_cache)
            page.on('request', lambda req: resources.append(req.url))
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script("""
                window.noteCount=0;
                const Native=window.AudioContext;
                window.AudioContext=new Proxy(Native,{construct(Type,args){
                  const ctx=new Type(...args);
                  const make=ctx.createOscillator.bind(ctx);
                  ctx.createOscillator=()=>{const osc=make();const start=osc.start.bind(osc);
                    osc.start=(...args)=>{window.noteCount++;return start(...args);};return osc;};
                  return ctx;
                }});
            """)
            page.goto(f'http://127.0.0.1:{server.server_port}/Turtle-Robot/')
            page.wait_for_selector('.letter', state='attached')
            assert page.locator('.letter').count() == 14
            page.get_by_role('button', name='교사 설정', exact=True).tap()
            slider = page.locator('#sound-volume')
            slider.focus()
            page.keyboard.press('End')
            assert page.locator('#sound-volume-value').inner_text() == '100%'
            page.keyboard.press('Home')
            for _ in range(4):
                page.keyboard.press('ArrowRight')
            assert page.locator('#sound-volume-value').inner_text() == '20%'
            page.locator('#preview-sound').tap()
            page.wait_for_function('window.noteCount === 3')
            assert '재생' in page.locator('#sound-status').inner_text()
            assert not old_hits, old_hits
            for asset in ['app.js', 'style.css', 'letters.js', 'sound.js']:
                assert any(urlsplit(url).path.endswith('/' + asset) and urlsplit(url).query for url in resources), asset
            assert not errors, errors
            browser.close()
            print('PASS: Pages ignores stale unversioned assets; slider percentage and touch audio preview work')
    finally:
        server.shutdown()
        server.server_close()
