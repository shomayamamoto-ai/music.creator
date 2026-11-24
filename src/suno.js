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
