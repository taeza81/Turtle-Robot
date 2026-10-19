import { letters, sampleStroke } from './letters.js?v=cde7938a6d6b4680';
import { TurtleSounds } from './sound.js?v=4f173dfe0f7706d6';

const $ = (id) => document.getElementById(id);
const ns = 'http://www.w3.org/2000/svg';
const storageKey = 'turtle-hangul-seen-v1';
const dock = { x: 110, y: 425 };
let seen = new Set();
let storageAvailable = true;
let soundSettings = { enabled: true, volume: 20 };
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) seen = new Set(saved.filter((v) => letters.some((l) => l.char === v)));
} catch { storageAvailable = false; }
try {
  const saved = JSON.parse(localStorage.getItem('turtle-hangul-sound-v1') || 'null');
  if (saved && typeof saved.enabled === 'boolean' && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 100) soundSettings = { enabled: saved.enabled, volume: saved.volume };
} catch { /* Keep usable defaults if storage is blocked. */ }
const sounds = new TurtleSounds({ ...soundSettings, onStatus: (state) => {
  const messages = {
    ready: '효과음을 재생해요. 들리지 않으면 기기 음량을 확인해 주세요.',
    disabled: '효과음 켜기를 선택한 뒤 다시 확인해 주세요.',
    silent: '효과음 크기가 0%예요. 음량을 올린 뒤 다시 확인해 주세요.',
    unsupported: '이 브라우저에서는 효과음을 지원하지 않아요. 다른 브라우저에서 확인해 주세요.',
    blocked: '소리를 시작하지 못했어요. 기기 음량을 확인하고 ‘소리 확인’을 다시 눌러 주세요.',
  };
  $('sound-status').textContent = messages[state] || '';
} });
$('sound-enabled').checked = soundSettings.enabled;
$('sound-volume').value = soundSettings.volume;
$('sound-volume-value').textContent = `${soundSettings.volume}%`;
let selected = 0, geometry = [], inkPaths = [], stroke = 0, distance = 0;
let phase = 'draw', status = 'idle', placed = false, frame = 0, lastTime = null;
let completedStrokes = 0, dragging = false, pressedStart = false, interactionLocked = false;
let color = document.querySelector('input[name=color]:checked').value;
if (matchMedia('(prefers-reduced-motion: reduce)').matches) $('speed').value = 'reduced';

function svg(tag, attributes) {
  const node = document.createElementNS(ns, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}
function letter() { return letters[selected]; }
function tell(text) { $('message').textContent = text; }
function cancelMotion() {
  cancelAnimationFrame(frame);
  lastTime = null;
}
function saveSeen() {
  try { localStorage.setItem(storageKey, JSON.stringify([...seen])); }
  catch { storageAvailable = false; }
  updateCollection();
}
function updateCollection() {
  $('collection').textContent = `14개 중 ${seen.size}개를 만났어요`;
  document.querySelectorAll('.letter').forEach((button, i) => {
    button.setAttribute('aria-pressed', String(i === selected));
    button.setAttribute('aria-label', `${letters[i].char} ${letters[i].name}${seen.has(letters[i].char) ? ', 함께 본 글자' : ''}`);
    button.querySelector('.completed-dot').textContent = seen.has(letters[i].char) ? '✓' : '';
  });
  $('storage-note').textContent = storageAvailable ? '함께 본 글자는 이 브라우저에 저장돼요.' : '이 브라우저에서는 기록이 저장되지 않아요. 놀이는 계속할 수 있어요.';
}
function position(point, angle = 0) {
  $('turtle').setAttribute('transform', `translate(${point.x} ${point.y})`);
  $('turtle-body').setAttribute('transform', `rotate(${angle})`);
}
function at(g, d) {
  const points = g.points;
  const end = points.findIndex((p) => p.distance >= d);
  const b = points[end < 0 ? points.length - 1 : Math.max(1, end)];
  const a = points[end < 0 ? points.length - 2 : Math.max(0, end - 1)];
  const fraction = Math.max(0, Math.min(1, (d - a.distance) / (b.distance - a.distance || 1)));
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90 };
}
function updateMarker() {
  $('markers').replaceChildren();
  if (status === 'complete') return;
  const p = geometry[stroke].points[0];
  const idle = !placed;
  const group = svg('g', { class: 'start-marker', 'pointer-events': 'none' });
  group.append(svg('circle', { cx: p.x, cy: p.y, r: idle ? 37 : 18, fill: idle ? '#fff4c9' : '#254f40', stroke: idle ? '#8a6314' : '#fff', 'stroke-width': 3 }));
  const text = svg('text', { x: p.x, y: p.y, class: 'start-label', style: idle ? 'fill:#59430f;font-size:18px' : '' });
  text.textContent = idle ? '시작' : String(stroke + 1);
  group.append(text);
  $('markers').append(group);
}
function updateControls() {
  const moving = status === 'running';
  setInteractionLock(moving);
  $('place').disabled = moving || status === 'paused' || (placed && status !== 'complete');
  $('place').textContent = moving ? '색칠하는 중이에요' : status === 'complete' ? '한 번 더 보기' : '터틀 놓기';
  $('paint-progress').max = geometry.length;
  $('paint-progress').value = completedStrokes;
  $('paint-count').textContent = `${completedStrokes} / ${geometry.length}`;
  $('stroke-list').replaceChildren(...geometry.map((_, i) => {
    const item = document.createElement('li');
    item.className = i < completedStrokes ? 'done' : i === stroke && placed ? 'current' : '';
    item.textContent = `${i + 1}획${i < completedStrokes ? ' ✓' : ''}`;
    if (i === stroke && placed && status !== 'complete') item.setAttribute('aria-current', 'step');
    return item;
  }));
  updateMarker();
}
function setInteractionLock(locked) {
  if (interactionLocked === locked) return;
  interactionLocked = locked;
  document.body.classList.toggle('is-running', locked);
  $('interaction-shield').hidden = !locked;
  $('lock-notice').hidden = !locked;
  document.querySelectorAll('button, input, select').forEach((control) => { control.disabled = locked; });
  document.querySelectorAll('details').forEach((details) => { details.inert = locked; });
  if (locked) {
    speechSynthesisSafeCancel();
    $('message').focus({ preventScroll: true });
  }
}
// Capture actions as well as disabling native controls. The transparent shield
// also absorbs pointer input, including taps on the SVG and open settings.
document.addEventListener('click', (event) => {
  if (interactionLocked) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
document.addEventListener('keydown', (event) => {
  if (interactionLocked && ['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
}, true);
function reset() {
  cancelMotion();
  sounds.stop();
  speechSynthesisSafeCancel();
  stroke = 0; distance = 0; phase = 'draw'; status = 'idle'; placed = false; dragging = false; pressedStart = false; completedStrokes = 0;
  $('ink').replaceChildren(); $('trail').replaceChildren(); $('completion').hidden = true;
  $('turtle').style.opacity = '1';
  inkPaths = geometry.map((g) => {
    const path = svg('path', { d: g.d, class: 'painted-route', stroke: color, visibility: 'hidden', 'stroke-dasharray': `0 ${g.length + 1}` });
    $('ink').append(path);
    return path;
  });
  position(dock);
  tell('시작점에 터틀을 놓아요.');
  updateControls();
}
function choose(index) {
  selected = index;
  geometry = letter().strokes.map((points) => ({ ...sampleStroke(points), d: points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ') }));
  $('routes').replaceChildren();
  geometry.forEach((g) => {
    $('routes').append(svg('path', { d: g.d, class: 'route' }), svg('path', { d: g.d, class: 'route-guide' }));
  });
  $('board-title').textContent = `${letter().char} ${letter().name} 획순 길`;
  $('big-letter').textContent = letter().char;
  $('character-name').textContent = letter().name;
  reset(); updateCollection();
}
function paint(d) {
  inkPaths[stroke].setAttribute('visibility', 'visible');
  inkPaths[stroke].setAttribute('stroke-dasharray', `${d} ${geometry[stroke].length + 1}`);
  const p = at(geometry[stroke], d);
  if ($('speed').value !== 'reduced') position(p, p.angle);
}
function complete() {
  cancelMotion(); status = 'complete'; completedStrokes = geometry.length;
  sounds.finish();
  $('trail').replaceChildren(); $('turtle').style.opacity = '1';
  seen.add(letter().char); saveSeen();
  tell(`‘${letter().char}’ ${letter().name} 완성! 터틀이 만든 글자를 함께 보아요.`);
  $('completion').hidden = false;
  updateControls();
}
function beginTransfer() {
  phase = 'transfer'; distance = 0;
  sounds.quiet();
  const a = geometry[stroke].points.at(-1), b = geometry[stroke + 1].points[0];
  $('trail').replaceChildren(svg('path', { d: `M${a.x},${a.y}L${b.x},${b.y}`, class: 'transfer' }));
  $('turtle').style.opacity = '.55';
  tell(`${stroke + 1}획 완성. 색칠을 멈추고 ${stroke + 2}획 시작점으로 옮겨요.`);
}
function finishTransfer() {
  stroke++; distance = 0; phase = 'draw';
  $('trail').replaceChildren(); $('turtle').style.opacity = '1';
  const p = at(geometry[stroke], 0); position(p, p.angle);
  tell(`${stroke + 1}획을 따라 색칠해요.`);
  updateControls();
}
function finishStroke() {
  completedStrokes = stroke + 1;
  if (completedStrokes === geometry.length) { complete(); return; }
  beginTransfer();
  updateControls();
}
function tick(time) {
  if (status !== 'running') return;
  const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, .08);
  lastTime = time;
  if ($('speed').value === 'reduced') {
    distance += dt;
    if (distance >= 1.25) {
      sounds.step();
      paint(geometry[stroke].length);
      completedStrokes = stroke + 1;
      if (completedStrokes === geometry.length) { complete(); return; }
      stroke++; distance = 0;
      tell(`${completedStrokes}획 완성. 다음은 ${stroke + 1}획이에요.`);
      updateControls();
    }
    frame = requestAnimationFrame(tick);
    return;
  }
  const speed = Number($('speed').value);
  if (phase === 'draw') {
    sounds.move();
    distance = Math.min(geometry[stroke].length, distance + speed * dt);
    paint(distance);
    if (distance >= geometry[stroke].length) finishStroke();
  } else {
    const a = geometry[stroke].points.at(-1), b = geometry[stroke + 1].points[0];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    distance = Math.min(length, distance + Math.max(90, speed) * dt);
    const fraction = length ? distance / length : 1;
    position({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction }, Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90);
    if (distance >= length) finishTransfer();
  }
  if (status === 'running') frame = requestAnimationFrame(tick);
}
function run() {
  if (!placed || status === 'running') return;
  if (status === 'complete') { place(); return; }
  status = 'running'; lastTime = null;
  tell(phase === 'draw' ? `${stroke + 1}획을 따라 색칠해요.` : `${stroke + 2}획 시작점으로 옮겨요. 지금은 색칠하지 않아요.`);
  updateControls(); frame = requestAnimationFrame(tick);
}
function place() {
  reset(); placed = true; status = 'ready';
  const p = at(geometry[0], 0); position(p, p.angle);
  tell('시작점에 놓았어요. 터틀과 함께 글자를 보아요.');
  updateControls();
  run();
  sounds.start({ continuous: $('speed').value !== 'reduced' });
}
function pause(message = '터틀이 기다리고 있어요. 준비되면 ‘계속 보기’를 눌러요.') {
  if (status !== 'running') return;
  cancelMotion(); status = 'paused'; tell(message); updateControls();
  sounds.stop();
}
function speechSynthesisSafeCancel() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }

letters.forEach((l, i) => {
  const button = document.createElement('button');
  button.className = 'letter';
  const glyph = document.createElement('span'); glyph.textContent = l.char;
  const check = document.createElement('span'); check.className = 'completed-dot'; check.setAttribute('aria-hidden', 'true');
  button.append(glyph, check);
  button.addEventListener('click', () => { choose(i); $('letter-dialog').close(); $('place').focus(); });
  $('letters').append(button);
});
$('place').addEventListener('click', place);
$('change-letter').addEventListener('click', () => $('letter-dialog').showModal());
$('next-letter').addEventListener('click', () => { choose((selected + 1) % letters.length); $('place').focus(); });
$('speed').addEventListener('change', () => {
  pause('속도를 바꿨어요. 준비되면 다시 시작해요.');
  updateControls();
});
document.querySelectorAll('input[name=color]').forEach((input) => input.addEventListener('change', () => {
  color = input.value;
  inkPaths.forEach((path) => path.setAttribute('stroke', color));
}));
document.addEventListener('visibilitychange', () => {
  lastTime = null;
  if (document.hidden) sounds.quiet();
});
window.addEventListener('pagehide', () => sounds.stop());
function updateSoundSettings() {
  soundSettings = { enabled: $('sound-enabled').checked, volume: Number($('sound-volume').value) };
  $('sound-volume-value').textContent = `${soundSettings.volume}%`;
  sounds.configure(soundSettings);
  try { localStorage.setItem('turtle-hangul-sound-v1', JSON.stringify(soundSettings)); }
  catch { /* The activity still works without saved preferences. */ }
}
$('sound-enabled').addEventListener('change', updateSoundSettings);
$('sound-volume').addEventListener('input', updateSoundSettings);
$('sound-volume').addEventListener('change', updateSoundSettings);
$('preview-sound').addEventListener('click', () => sounds.preview());

function boardPoint(event) {
  const matrix = $('board').getScreenCTM();
  if (!matrix) return dock;
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}
$('board').addEventListener('pointerdown', (event) => {
  if (status !== 'idle') return;
  const p = boardPoint(event), start = geometry[0].points[0];
  if (Math.hypot(p.x - start.x, p.y - start.y) <= 58) {
    pressedStart = true; $('board').setPointerCapture(event.pointerId); return;
  }
  if (Math.hypot(p.x - dock.x, p.y - dock.y) <= 58) {
    dragging = true; $('board').setPointerCapture(event.pointerId); position(p);
  }
});
$('board').addEventListener('pointermove', (event) => { if (dragging) position(boardPoint(event)); });
$('board').addEventListener('pointerup', (event) => {
  if (pressedStart) {
    pressedStart = false;
    const p = boardPoint(event), start = geometry[0].points[0];
    // Start audio on touch release, when tablet browsers grant user activation.
    if (Math.hypot(p.x - start.x, p.y - start.y) <= 68) place();
    return;
  }
  if (!dragging) return;
  dragging = false;
  const p = boardPoint(event), start = geometry[0].points[0];
  if (Math.hypot(p.x - start.x, p.y - start.y) <= 68) place();
  else { position(dock); tell('터틀이 돌아왔어요. 큰 ‘터틀 놓기’ 버튼을 눌러도 돼요.'); }
});
$('board').addEventListener('pointercancel', () => { pressedStart = false; if (dragging) { dragging = false; position(dock); } });

for (const [button, dialog] of [['help-button', 'help-dialog'], ['teacher-button', 'teacher-dialog']]) {
  $(button).addEventListener('click', () => { pause(); sounds.stop(); $(dialog).showModal(); });
}
$('speak').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) { tell('이 기기에서는 음성 안내를 쓸 수 없어요. 화면 안내를 함께 읽어 주세요.'); return; }
  pause(); sounds.stop(); speechSynthesisSafeCancel();
  const utterance = new SpeechSynthesisUtterance(`${letter().char}, ${letter().name}. ${$('message').textContent}`);
  utterance.lang = 'ko-KR'; utterance.rate = .8;
  utterance.onerror = (event) => {
    if (!interactionLocked && !['canceled', 'interrupted'].includes(event.error)) tell('음성 안내를 재생하지 못했어요. 화면 안내를 함께 읽어 주세요.');
  };
  speechSynthesis.speak(utterance);
});
let resetArmed = false;
$('reset-progress').addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true; $('reset-status').textContent = '함께 본 글자 기록을 모두 지울까요? 지우려면 한 번 더 눌러 주세요.'; return;
  }
  seen.clear(); saveSeen(); reset(); resetArmed = false;
  $('reset-status').textContent = '함께 본 글자 기록을 지웠어요.';
});
$('teacher-dialog').addEventListener('close', () => { sounds.stop(); resetArmed = false; $('reset-status').textContent = ''; });
choose(0);
