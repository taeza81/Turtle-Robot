"""Verify generated audio and activity behavior with real Chromium Web Audio."""
import argparse
import shutil
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:3000')
parser.add_argument('--browser', default=shutil.which('chromium'))
args = parser.parse_args()

# Observe real oscillators and a real analyser, without replacing audio synthesis.
probe = """
window.audioProbe = {started: [], active: new Set(), analysers: []};
const NativeAudio = window.AudioContext;
window.AudioContext = new Proxy(NativeAudio, {
  construct(Target, args) {
    const context = new Target(...args);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    audioProbe.analysers.push(analyser);
    const createGain = context.createGain.bind(context);
    context.createGain = () => {
      const node = createGain();
      const connect = node.connect.bind(node);
      node.connect = (destination, ...rest) => {
        if (destination === context.destination) connect(analyser);
        return connect(destination, ...rest);
      };
      return node;
    };
    const createOscillator = context.createOscillator.bind(context);
    context.createOscillator = () => {
      const node = createOscillator();
      const start = node.start.bind(node);
      node.start = (...args) => {
        audioProbe.started.push({frequency:node.frequency.value, when:context.currentTime});
        audioProbe.active.add(node);
        node.addEventListener('ended', () => audioProbe.active.delete(node));
        return start(...args);
      };
      return node;
    };
    return context;
  }
});
window.audioRms = () => {
  let maximum = 0;
  for (const analyser of audioProbe.analysers) {
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    maximum = Math.max(maximum, Math.sqrt(samples.reduce((sum,x) => sum+x*x,0) / samples.length));
  }
  return maximum;
};
"""


def settings(page):
    page.locator('#teacher-button').click()


def close_settings(page):
    page.locator('#teacher-dialog form button').click()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser, headless=True)
    context = browser.new_context()
    context.add_init_script(probe)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.base_url)
    page.wait_for_selector('#place')
    assert page.evaluate('audioProbe.started.length') == 0, 'Audio autoplayed'
    settings(page)
    assert page.locator('#sound-enabled').is_checked()
    assert page.locator('#sound-volume').input_value() == '20'
    page.locator('#speed').select_option('160')
    close_settings(page)
    page.locator('#change-letter').click()
    page.locator('.letter').nth(2).click()  # ㄷ includes a transfer with no sound.
    page.locator('#place').click()
    page.wait_for_function('audioProbe.started.length >= 2')
    page.wait_for_function('audioRms() > .00001')
    assert page.locator('button:enabled,input:enabled,select:enabled').count() == 0
    page.wait_for_selector('.transfer', state='attached')
    count = page.evaluate('audioProbe.started.length')
    page.wait_for_timeout(500)
    assert page.evaluate('audioProbe.started.length') == count, 'Sound played during transfer'
    page.wait_for_function('audioRms() < .00001')
    page.locator('#completion').wait_for(state='visible', timeout=15000)
    page.wait_for_function('audioProbe.active.size === 0')
    count = page.evaluate('audioProbe.started.length')
    page.wait_for_timeout(750)
    assert page.evaluate('audioProbe.started.length') == count, 'Sound continued after completion'
    assert page.locator('#place').is_enabled()
    print('PASS: no autoplay; real audio waveform during movement; silence on transfer; completion sound ends')

    settings(page)
    page.locator('#sound-enabled').uncheck()
    page.locator('#sound-volume').evaluate("el => {el.value='35';el.dispatchEvent(new Event('input',{bubbles:true}));}")
    close_settings(page)
    page.reload()
    settings(page)
    assert not page.locator('#sound-enabled').is_checked()
    assert page.locator('#sound-volume').input_value() == '35'
    page.locator('#speed').select_option('reduced')
    close_settings(page)
    page.locator('#place').click()
    page.locator('#completion').wait_for(state='visible')
    assert page.evaluate('audioProbe.started.length') == 0
    print('PASS: mute and volume preferences survive reload; muted playback stays silent')

    settings(page)
    page.locator('#sound-enabled').check()
    page.locator('#sound-volume').evaluate("el => {el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));}")
    close_settings(page)
    page.locator('#place').click()
    page.locator('#completion').wait_for(state='visible')
    assert page.evaluate('audioProbe.started.length') == 0
    print('PASS: zero volume stays silent even when sound is enabled')

    # Hidden pages must cancel active tones, while app controls remain locked.
    settings(page)
    page.locator('#sound-volume').evaluate("el => {el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.locator('#speed').select_option('45')
    close_settings(page)
    page.locator('#place').click()
    page.wait_for_function('audioProbe.started.length > 0')
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));")
    page.wait_for_function('audioProbe.active.size === 0')
    count = page.evaluate('audioProbe.started.length')
    page.wait_for_timeout(700)
    assert page.evaluate('audioProbe.started.length') == count
    assert page.locator('button:enabled,input:enabled,select:enabled').count() == 0
    page.close()
    print('PASS: hidden page stops audio without unlocking student controls')

    mobile = browser.new_context(is_mobile=True, has_touch=True, viewport={'width': 820, 'height': 1180})
    mobile.add_init_script(probe)
    touch = mobile.new_page()
    touch.goto(args.base_url)
    point = touch.locator('#board').evaluate('(svg) => {const p=new DOMPoint(160,140).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};}')
    touch.touchscreen.tap(point['x'], point['y'])
    touch.wait_for_function('audioProbe.started.length > 0')
    assert touch.locator('button:enabled,input:enabled,select:enabled').count() == 0
    mobile.close()
    print('PASS: tablet start-point touch unlocks real audio and locks activity controls')

    unsupported = browser.new_context()
    unsupported.add_init_script('window.AudioContext=undefined;window.webkitAudioContext=undefined;')
    fallback = unsupported.new_page()
    fallback.on('pageerror', lambda e: errors.append(str(e)))
    fallback.goto(args.base_url)
    settings(fallback)
    fallback.locator('#speed').select_option('reduced')
    close_settings(fallback)
    fallback.locator('#place').click()
    fallback.locator('#completion').wait_for(state='visible')
    assert fallback.locator('#place').is_enabled()
    assert not errors, errors
    print('PASS: activity completes with no audio support and no JavaScript errors')
    browser.close()
