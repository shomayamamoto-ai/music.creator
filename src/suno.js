// Suno に貼る直前のチェックと整形。

// v4.5 以降のモデルでの目安(公式ドキュメントでの明記は確認できず、
// 複数の解説サイトの記載に基づく値。超えると末尾が黙って切られるとの報告あり)。
export const LIMITS = { style: 1000, lyrics: 5000, title: 80 };

const SECTION_TAG = /^\s*\[[^\]]+\]\s*$/;

export function normalizeLyrics(lyrics) {
  return String(lyrics || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeStyle(style) {
  return String(style || '')
    .replace(/\s*\n\s*/g, ', ')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
    .join(', ');
}

// 貼り付け前の警告(エラーではなく注意喚起)
export function lintSong({ title, style, lyrics }) {
  const warnings = [];
  if ((style || '').length > 400 && (style || '').length <= LIMITS.style) {
    warnings.push(`Style が ${style.length} 文字です。上限内ですが、200〜400字程度に絞ると意図が伝わりやすいとされています(引き算)。`);
  }
  if ((style || '').length > LIMITS.style) {
    warnings.push(`Style が ${style.length} 文字です。${LIMITS.style} 文字を超えると末尾が切れる恐れがあります。`);
  }
  if ((lyrics || '').length > LIMITS.lyrics) {
    warnings.push(`歌詞が ${lyrics.length} 文字です。${LIMITS.lyrics} 文字を超えると末尾が切れる恐れがあります。`);
  }
  if ((title || '').length > LIMITS.title) {
    warnings.push('タイトルが長すぎます。短くすると覚えてもらいやすくなります。');
  }
  const lines = (lyrics || '').split('\n');
  if (lyrics && !lines.some((l) => SECTION_TAG.test(l))) {
    warnings.push('歌詞に [Verse] [Chorus] などのセクションタグがありません。構成が崩れやすくなります。');
  }
  if (lyrics && !/\[\s*chorus/i.test(lyrics)) {
    warnings.push('[Chorus](サビ)タグが見つかりません。');
  }
  // 歌詞欄に演出の指示文を書くと、そのまま歌われてしまうことがある(実務上の注意)
  const proseInBrackets = lines.filter((l) => /^\s*\(.{25,}\)\s*$/.test(l));
  if (proseInBrackets.length) {
    warnings.push('( ) 内の長い文が歌詞にあります。歌われてしまう可能性があるので確認してください。');
  }
  return warnings.concat(lintLyricsQuality({ title, lyrics }));
}

// ---- 歌詞の機械チェック(AIの推敲にも渡す) ----
const FIRST_PERSON = ['僕', 'ぼく', '俺', 'おれ', 'オレ', '私', 'わたし', 'あたし', 'ウチ'];
const SECOND_PERSON = ['君', 'きみ', 'キミ', 'あなた', '貴方', 'お前', 'おまえ', 'アンタ', 'あんた'];
// AI 作詞で多用されがちな決まり文句(多いと抽象的・ありきたりになりやすい)
const CLICHES = ['頑張ろう', 'がんばろう', '大切なもの', '奇跡', '永遠', '輝く', '輝いて', '翼', '未来へ', '明日へ', '夢を', '絆', '信じて', '負けないで', '光の中', '扉を開け', '一人じゃない', 'ひとりじゃない', '笑顔', '想い', '軌跡'];

function sections(lyrics) {
  const out = [];
  let cur = null;
  for (const raw of normalizeLyrics(lyrics).split('\n')) {
    if (SECTION_TAG.test(raw)) {
      cur = { tag: raw.trim(), lines: [] };
      out.push(cur);
    } else if (raw.trim() && cur) {
      cur.lines.push(raw.trim());
    }
  }
  return out;
}

const stripAdlibs = (line) => line.replace(/[((][^))]*[))]/g, '').trim();
const countOf = (text, word) => text.split(word).length - 1;

export function lintLyricsQuality({ title, lyrics }) {
  const warnings = [];
  if (!lyrics) return warnings;
  const secs = sections(lyrics);
  const sung = secs.flatMap((s) => s.lines.map(stripAdlibs)).join('\n');

  const usedFirst = FIRST_PERSON.filter((w) => sung.includes(w));
  const usedSecond = SECOND_PERSON.filter((w) => sung.includes(w));
  const firstKinds = new Set(usedFirst.map((w) => ({ ぼく: '僕', おれ: '俺', オレ: '俺', わたし: '私' })[w] || w));
  const secondKinds = new Set(usedSecond.map((w) => ({ きみ: '君', キミ: '君', 貴方: 'あなた', おまえ: 'お前', アンタ: 'あんた' })[w] || w));
  if (firstKinds.size > 1) warnings.push(`視点チェック:一人称が混ざっています(${usedFirst.join('・')})。意図した切り替えでなければ揃えてください。`);
  if (secondKinds.size > 1) warnings.push(`視点チェック:二人称が混ざっています(${usedSecond.join('・')})。意図した切り替えでなければ揃えてください。`);

  const choruses = secs.filter((s) => /chorus/i.test(s.tag) && !/pre/i.test(s.tag));
  const titleKey = String(title || '').replace(/[\s「」『』!?!?、。]/g, '');
  if (titleKey && choruses.length) {
    const inChorus = choruses.some((c) => c.lines.join('').replace(/\s/g, '').includes(titleKey));
    if (!inChorus) warnings.push('フックチェック:タイトルの言葉がサビに入っていません。覚えてもらいにくくなる恐れがあります。');
  }
  const regular = choruses.filter((c) => !/final|last/i.test(c.tag));
  if (regular.length > 1 && new Set(regular.map((c) => c.lines[0])).size > 1) {
    warnings.push('フックチェック:サビの1行目が回ごとに違います。フックは同じ形で繰り返すほうが記憶に残りやすくなります。');
  }

  const hits = CLICHES.map((w) => [w, countOf(sung, w)]).filter(([, n]) => n > 0);
  const total = hits.reduce((a, [, n]) => a + n, 0);
  if (total >= 3) warnings.push(`具体性チェック:決まり文句が ${total} 回あります(${hits.map(([w, n]) => `${w}×${n}`).join('、')})。具体的な場面や物に置き換えると刺さりやすくなります。`);

  const longLines = secs.flatMap((s) => s.lines).filter((l) => stripAdlibs(l).replace(/\s/g, '').length > 26);
  if (longLines.length) warnings.push(`歌いやすさチェック:長すぎる行が ${longLines.length} 行あります(例:「${longLines[0].slice(0, 20)}…」)。息継ぎの位置で分けてください。`);

  const intro = secs.find((s) => /intro/i.test(s.tag));
  if (intro && intro.lines.length > 2) warnings.push('構成チェック:[Intro] に歌詞が多めです。最初の5秒で離脱されやすいので、イントロは短くしましょう。');
  if (secs.length && !/intro/i.test(secs[0].tag) && !/verse|chorus|hook/i.test(secs[0].tag)) {
    warnings.push(`構成チェック:最初のセクションが ${secs[0].tag} です。意図どおりか確認してください。`);
  }
  return warnings;
}

export function sectionStats(lyrics) {
  const stats = [];
  let current = null;
  for (const line of normalizeLyrics(lyrics).split('\n')) {
    if (SECTION_TAG.test(line)) {
      current = { tag: line.trim(), lines: 0, chars: 0 };
      stats.push(current);
    } else if (line.trim() && current) {
      current.lines += 1;
      current.chars += line.replace(/\s/g, '').length;
    }
  }
  return stats;
}

// Suno の「Custom」モードの3欄にそのまま貼れるテキスト
export function toCopyBlock({ title, style, exclude_styles, lyrics }) {
  return [
    '■ Title',
    title,
    '',
    '■ Style of Music',
    style,
    '',
    '■ Exclude Styles',
    exclude_styles || '(なし)',
    '',
    '■ Lyrics',
    lyrics,
  ].join('\n');
}
