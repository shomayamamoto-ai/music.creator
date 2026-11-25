// 歌詞と BPM から「どこが何小節目・何秒目か」の目安を計算する(4/4拍子を前提)。
// Suno の生成結果は小節数が前後するため、あくまで作業の目安です。
import { countMora } from './mora.js';

const TAG = /^\s*\[([^\]]+)\]\s*$/;

// Style の文字やジャンルの型から BPM を読み取る(なければ null)
export function parseBpm(...texts) {
  for (const t of texts) {
    const m = String(t || '').match(/(\d{2,3})\s*(?:-|〜|~|to)?\s*(?:\d{2,3})?\s*BPM/i);
    if (m) {
      const n = Number(m[1]);
      if (n >= 40 && n <= 240) return n;
    }
  }
  return null;
}

const kindOf = (tag) =>
  /pre/i.test(tag) ? 'pre' : /chorus|hook/i.test(tag) ? 'chorus' : /verse/i.test(tag) ? 'verse' : /bridge/i.test(tag) ? 'bridge' : /intro/i.test(tag) ? 'intro' : /outro|end/i.test(tag) ? 'outro' : /instrumental|break|solo|interlude/i.test(tag) ? 'inst' : 'other';

// 歌詞のないセクションの小節数の目安
const EMPTY_BARS = { intro: 4, inst: 8, outro: 4, other: 4 };

export function sectionPlan(lyrics, { bpm = 100, barsPerLine = 2 } = {}) {
  const sections = [];
  let cur = null;
  for (const raw of String(lyrics || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = raw.match(TAG);
    if (m) {
      const [name, ...desc] = m[1].split(':');
      cur = { tag: raw.trim(), name: name.trim(), note: desc.join(':').trim(), kind: kindOf(name), lines: [] };
      sections.push(cur);
    } else if (raw.trim()) {
      if (!cur) {
        cur = { tag: '(タグなし)', name: '(タグなし)', note: '', kind: 'other', lines: [] };
        sections.push(cur);
      }
      cur.lines.push(raw.trim());
    }
  }
  const secPerBar = (60 / bpm) * 4;
  // 1行に入る音の数の目安:1小節に8分音符8つ × 行あたりの小節数
  const capacity = 8 * barsPerLine;
  let bar = 1;
  return sections.map((s) => {
    const lengthBars = s.lines.length ? s.lines.length * barsPerLine : EMPTY_BARS[s.kind] || 4;
    const lines = s.lines.map((text, i) => {
      const { mora, approx } = countMora(text);
      const adlib = /^[((].*[))]$/.test(text);
      const fit = adlib ? 'adlib' : mora > capacity ? 'tight' : mora < capacity * 0.35 ? 'loose' : 'ok';
      return { text, mora, approx, fit, startBar: bar + i * barsPerLine, startSec: (bar - 1 + i * barsPerLine) * secPerBar };
    });
    const out = { ...s, startBar: bar, startSec: (bar - 1) * secPerBar, lengthBars, lengthSec: lengthBars * secPerBar, lines };
    bar += lengthBars;
    return out;
  });
}

export function totalLength(plan) {
  const last = plan[plan.length - 1];
  return last ? last.startSec + last.lengthSec : 0;
}

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
