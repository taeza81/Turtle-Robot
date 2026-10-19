// Educational routes for virtual line following. These are not robot firmware codes.
const circle = (cx, cy, radius) => Array.from({ length: 81 }, (_, i) => {
  const a = -Math.PI / 2 - i * Math.PI * 2 / 80;
  return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
});
export const letters = [
  { char: 'ㄱ', name: '기역', word: '가방', strokes: [[[160, 140], [400, 140], [400, 390]]] },
  { char: 'ㄴ', name: '니은', word: '나무', strokes: [[[160, 140], [160, 390], [400, 390]]] },
  { char: 'ㄷ', name: '디귿', word: '다리', strokes: [[[160, 140], [400, 140]], [[160, 140], [160, 390], [400, 390]]] },
  { char: 'ㄹ', name: '리을', word: '로봇', strokes: [[[160, 140], [400, 140], [400, 265]], [[160, 265], [400, 265]], [[160, 265], [160, 390], [400, 390]]] },
  { char: 'ㅁ', name: '미음', word: '모자', strokes: [[[160, 140], [160, 390]], [[160, 140], [400, 140], [400, 390]], [[160, 390], [400, 390]]] },
  { char: 'ㅂ', name: '비읍', word: '바다', strokes: [[[160, 140], [160, 390]], [[400, 140], [400, 390]], [[160, 265], [400, 265]], [[160, 390], [400, 390]]] },
  { char: 'ㅅ', name: '시옷', word: '사과', strokes: [[[280, 140], [150, 390]], [[280, 140], [410, 390]]] },
  { char: 'ㅇ', name: '이응', word: '오리', strokes: [circle(280, 265, 125)] },
  { char: 'ㅈ', name: '지읒', word: '자동차', strokes: [[[155, 145], [405, 145], [155, 390]], [[280, 267.5], [405, 390]]] },
  { char: 'ㅊ', name: '치읓', word: '치마', strokes: [[[280, 95], [280, 125]], [[160, 175], [400, 175], [160, 400]], [[280, 287.5], [400, 400]]] },
  { char: 'ㅋ', name: '키읔', word: '코끼리', strokes: [[[160, 140], [400, 140], [400, 390]], [[160, 265], [400, 265]]] },
  { char: 'ㅌ', name: '티읕', word: '토끼', strokes: [[[160, 140], [400, 140]], [[160, 265], [400, 265]], [[160, 140], [160, 390], [400, 390]]] },
  { char: 'ㅍ', name: '피읖', word: '포도', strokes: [[[145, 140], [415, 140]], [[200, 140], [200, 390]], [[360, 140], [360, 390]], [[145, 390], [415, 390]]] },
  { char: 'ㅎ', name: '히읗', word: '하늘', strokes: [[[280, 90], [280, 120]], [[160, 160], [400, 160]], circle(280, 315, 100)] },
];

export function sampleStroke(points, spacing = 6) {
  const out = [{ x: points[0][0], y: points[0][1], distance: 0 }];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const length = Math.hypot(bx - ax, by - ay);
    const count = Math.max(1, Math.ceil(length / spacing));
    for (let j = 1; j <= count; j++) out.push({ x: ax + (bx - ax) * j / count, y: ay + (by - ay) * j / count, distance: total + length * j / count });
    total += length;
  }
  return { points: out, length: total };
}
