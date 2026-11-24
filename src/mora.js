// 歌詞の1行ごとの「音数(モーラ)」と「語尾の母音」を数える(ブラウザ内で計算)。
// かなは正確に数えられますが、漢字は読みが分からないため1字=約2音で概算します。
// 英単語は母音のまとまりで音節を概算します。そのため漢字・英語を含む行は「約」と表示します。

const TAG = /^\s*\[[^\]]+\]\s*$/;
const SMALL = /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]/; // 直前の文字と合わせて1音
const KANA = /[ぁ-ゖァ-ヺー]/;
const KANJI = /[一-鿿々]/;
const VOWEL_ROWS = {
  a: 'あかさたなはまやらわがざだばぱゃぁアカサタナハマヤラワガザダバパャァ',
  i: 'いきしちにひみりぎじぢびぴぃイキシチニヒミリギジヂビピィ',
  u: 'うくすつぬふむゆるぐずづぶぷゅぅウクスツヌフムユルグズヅブプュゥヴ',
  e: 'えけせてねへめれげぜでべぺぇエケセテネヘメレゲゼデベペェ',
  o: 'おこそとのほもよろをごぞどぼぽょぉオコソトノホモヨロヲゴゾドボポョォ',
};

function vowelOfKana(ch) {
  if (ch === 'ん' || ch === 'ン') return 'n';
  for (const [v, row] of Object.entries(VOWEL_ROWS)) if (row.includes(ch)) return v;
  return null;
}

function englishSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function countMora(line) {
  const text = line.replace(/[((][^))]*[))]/g, ''); // 合いの手( )は数えない
  let mora = 0;
  let approx = false;
  const words = text.match(/[A-Za-z']+/g) || [];
  for (const w of words) mora += englishSyllables(w);
  if (words.length) approx = true;
  for (const ch of text.replace(/[A-Za-z']+/g, '')) {
    if (SMALL.test(ch)) continue;
    if (KANA.test(ch)) mora += 1;
    else if (KANJI.test(ch)) {
      mora += 2;
      approx = true;
    }
  }
  return { mora, approx };
}

export function lastVowel(line) {
  const text = line.replace(/[((][^))]*[))]/g, '').replace(/[\s、。,.!?!?…「」『』]+$/u, '');
  const last = text[text.length - 1];
  if (!last) return null;
  if (/[A-Za-z]/.test(last)) {
    const m = text.match(/[aeiou](?=[^aeiou]*$)/i);
    return m ? m[0].toLowerCase() : null;
  }
  if (last === 'ー') {
    const prev = text.replace(/ー+$/, '').slice(-1);
    return vowelOfKana(prev);
  }
  return KANA.test(last) ? vowelOfKana(last) : null; // 漢字で終わる行は読みが分からない
}

const kindOf = (tag) =>
  /pre/i.test(tag) ? 'pre' : /chorus|hook/i.test(tag) ? 'chorus' : /verse/i.test(tag) ? 'verse' : /bridge/i.test(tag) ? 'bridge' : 'other';

// 歌詞全体を行ごとに分析する
export function analyzeLyrics(lyrics) {
  const lines = [];
  let section = '(タグなし)';
  String(lyrics || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((raw, index) => {
      if (TAG.test(raw)) {
        section = raw.trim();
        return;
      }
      if (!raw.trim()) return;
      const { mora, approx } = countMora(raw);
      lines.push({ index, section, kind: kindOf(section), text: raw.trim(), mora, approx, vowel: lastVowel(raw) });
    });
  // 前後の行の情報(書き直し時の文脈に使う)
  lines.forEach((l, i) => {
    l.prev = lines[i - 1]?.section === l.section ? lines[i - 1].text : '';
    l.next = lines[i + 1]?.section === l.section ? lines[i + 1].text : '';
    l.prevVowel = l.prev ? lines[i - 1].vowel : null;
    l.nextVowel = l.next ? lines[i + 1].vowel : null;
  });
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
  const byKind = {};
  for (const l of lines) (byKind[l.kind] ||= []).push(l.mora);
  const summary = Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, avg(v)]));
  // セクション内で語尾の母音が揃っている割合(韻の目安)
  const sections = {};
  for (const l of lines) (sections[l.section] ||= []).push(l.vowel);
  let pairs = 0;
  let rhymes = 0;
  for (const vs of Object.values(sections)) {
    for (let i = 1; i < vs.length; i++) {
      if (vs[i] && vs[i - 1]) {
        pairs += 1;
        if (vs[i] === vs[i - 1]) rhymes += 1;
      }
    }
  }
  return { lines, summary, rhymeRate: pairs ? Math.round((rhymes / pairs) * 100) : null };
}
