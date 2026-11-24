// 取り込んだ歌詞の機械的な集計(ブラウザ内で計算。外部には送らない)。
// AI の印象ではなく数値を根拠に「書き方の傾向」を学習させるために使います。

const TAG = /^\s*\[[^\]]+\]\s*$/;
const SMALL_KANA = /[ゃゅょャュョぁぃぅぇぉァィゥェォ]/g; // 拗音など:1音符にまとめやすい
const LONG_MARK = /[ーっッん]/g; // 長音・促音・撥音:1音符にまとめやすい
const PRONOUNS = {
  first: ['僕', 'ぼく', '俺', 'おれ', '私', 'わたし', 'あたし'],
  second: ['君', 'きみ', 'あなた', 'お前', 'おまえ'],
};

// ひらがな・カタカナ1文字 → 母音
const VOWEL_ROWS = {
  a: 'あかさたなはまやらわがざだばぱぁゃアカサタナハマヤラワガザダバパァャ',
  i: 'いきしちにひみりぎじぢびぴぃイキシチニヒミリギジヂビピィ',
  u: 'うくすつぬふむゆるぐずづぶぷぅゅウクスツヌフムユルグズヅブプゥュヴ',
  e: 'えけせてねへめれげぜでべぺぇエケセテネヘメレゲゼデベペェ',
  o: 'おこそとのほもよろをごぞどぼぽぉょオコソトノホモヨロヲゴゾドボポォョ',
};
function vowelOf(ch) {
  if (ch === 'ん' || ch === 'ン') return 'n';
  for (const [v, row] of Object.entries(VOWEL_ROWS)) if (row.includes(ch)) return v;
  return null;
}

function parse(lyrics) {
  const secs = [];
  let cur = { tag: '(タグなし)', lines: [] };
  secs.push(cur);
  for (const raw of String(lyrics || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (TAG.test(raw)) {
      cur = { tag: raw.trim().toLowerCase(), lines: [] };
      secs.push(cur);
    } else if (raw.trim()) {
      cur.lines.push(raw.trim().replace(/[((][^))]*[))]/g, '').trim());
    }
  }
  return secs.filter((s) => s.lines.length);
}

const len = (line) => line.replace(/[\s、。,.!?!?「」『』…・]/g, '').length;
const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

function kindOf(tag) {
  if (/pre/.test(tag)) return 'pre_chorus';
  if (/chorus|hook|サビ/.test(tag)) return 'chorus';
  if (/verse|aメロ|a メロ/.test(tag)) return 'verse';
  if (/bridge|cメロ/.test(tag)) return 'bridge';
  return 'other';
}

export function lyricStats(lyrics) {
  const secs = parse(lyrics);
  const lines = secs.flatMap((s) => s.lines).filter(Boolean);
  const text = lines.join('');
  const chars = text.replace(/\s/g, '');
  const counts = {
    hiragana: (chars.match(/[ぁ-ゟ]/g) || []).length,
    katakana: (chars.match(/[゠-ヿ]/g) || []).length,
    kanji: (chars.match(/[一-鿿]/g) || []).length,
    latin: (chars.match(/[A-Za-z]/g) || []).length,
  };
  const byKind = {};
  for (const s of secs) {
    const k = kindOf(s.tag);
    (byKind[k] ||= []).push(...s.lines.map(len));
  }
  const endVowels = {};
  for (const l of lines) {
    const kana = l.replace(/[^ぁ-ヿ]/g, '');
    const v = kana && vowelOf(kana[kana.length - 1]);
    if (v) endVowels[v] = (endVowels[v] || 0) + 1;
  }
  const unique = new Set(lines);
  const firstPerson = PRONOUNS.first.filter((w) => text.includes(w));
  const secondPerson = PRONOUNS.second.filter((w) => text.includes(w));
  const englishWords = (text.match(/[A-Za-z][A-Za-z']+/g) || []).length;
  return {
    sections: secs.length,
    lines: lines.length,
    avg_chars_per_line: avg(lines.map(len)),
    avg_chars_by_section: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, avg(v)])),
    script_ratio_percent: {
      hiragana: pct(counts.hiragana, chars.length),
      katakana: pct(counts.katakana, chars.length),
      kanji: pct(counts.kanji, chars.length),
      latin: pct(counts.latin, chars.length),
    },
    english_words: englishWords,
    // 1音符にまとめやすい文字(拗音・長音・促音・撥音)の割合。多いほど「詰め」が起きやすい書き方
    packable_kana_percent: pct((text.match(SMALL_KANA) || []).length + (text.match(LONG_MARK) || []).length, chars.length),
    repeated_line_percent: pct(lines.length - unique.size, lines.length),
    line_end_vowels: endVowels,
    first_person: firstPerson,
    second_person: secondPerson,
    adlib_parentheses: (String(lyrics).match(/[((][^))]+[))]/g) || []).length,
  };
}

// 複数曲の集計をまとめる
export function aggregateStats(items) {
  const each = items.map((it) => ({ label: it.label, ...lyricStats(it.lyrics) }));
  const mean = (key) => avg(each.map((e) => e[key]).filter((v) => v != null));
  return {
    songs: each.length,
    mean_chars_per_line: mean('avg_chars_per_line'),
    mean_packable_kana_percent: mean('packable_kana_percent'),
    mean_repeated_line_percent: mean('repeated_line_percent'),
    per_song: each,
  };
}
