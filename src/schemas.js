// AI に返してもらう JSON の形。
// Claude の構造化出力の制約に合わせ、全項目 required + additionalProperties:false にしています。

const str = (description) => ({ type: 'string', description });
const strArr = (description) => ({ type: 'array', items: { type: 'string' }, description });
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const psychNote = obj({
  technique: str('使った手法名(例:サビ冒頭のタイトル反復)'),
  where: str('歌詞のどこで使ったか'),
  why: str('なぜ効くのか。ナレッジのどの知見に基づくか'),
});

const povSchema = obj({
  narrator: str('語り手:誰が歌っているか(年齢・立場など具体的に)'),
  addressee: str('相手:誰に向けた言葉か'),
  time: str('時点:いつの気持ちか'),
  place: str('場所・状況'),
  distance: str('語り手と相手の距離感・関係'),
  pronouns: str('使う一人称/二人称と時制(例:僕/君、過去形中心)'),
  shifts: strArr('意図的に視点・時点を切り替える箇所と理由。なければ空配列'),
});

// 完成した1曲(Suno にそのまま貼れる形)
export const SONG_SCHEMA = obj({
  title: str('曲タイトル'),
  pov: povSchema,
  motifs: strArr('中心モチーフ(テーマを象徴する具体物)。2個以内'),
  concept: str('この曲が聴き手に残すもの。1〜2文'),
  core_message: str('メッセージを一言に圧縮したもの(サビの核)'),
  style: str('Suno の Style 欄に貼る英語タグ。カンマ区切り。アーティスト名は禁止。1000文字以内'),
  exclude_styles: str('Suno の Exclude Styles 欄に貼る英語タグ。カンマ区切り。不要なら空文字'),
  lyrics: str('Suno の Lyrics 欄に貼る歌詞。[Intro][Verse 1][Pre-Chorus][Chorus] などのタグを行頭に置く。5000文字以内'),
  psychology_notes: { type: 'array', items: psychNote, description: '使った音楽心理学の手法' },
  self_review: strArr('出力前セルフレビューで直した点・残るリスク'),
  next_steps: strArr('Suno で生成した後に試すべきこと'),
});

// 歌詞を補強した結果(Gemini)
export const ENHANCE_SCHEMA = obj({
  ...SONG_SCHEMA.properties,
  changes: {
    type: 'array',
    items: obj({
      before: str('元の歌詞(該当部分)'),
      after: str('補強後の歌詞'),
      reason: str('変更理由'),
    }),
    description: '主な変更点',
  },
});
ENHANCE_SCHEMA.required = Object.keys(ENHANCE_SCHEMA.properties);

// Aメロ+サビを大量に作るモード
export const HOOKS_SCHEMA = obj({
  core_message: str('メッセージを一言に圧縮したもの'),
  candidates: {
    type: 'array',
    items: obj({
      label: str('案の名前(例:A案 手紙型)'),
      angle: str('切り口。どんな角度でメッセージを届けるか'),
      pov: str('この案の視点:語り手 → 相手、時点(例:28歳の僕 → 別れた君、別れて1年後の夜)'),
      verse: str('Aメロ(Verse)の歌詞'),
      chorus: str('サビ(Chorus)の歌詞'),
      hook_line: str('一番耳に残したいフレーズ'),
      why: str('この案が刺さる理由(心理学的根拠つき)'),
      score: { type: 'integer', description: 'フックの強さの自己採点(1〜10)' },
    }),
  },
  recommendation: str('どの案を採用すべきか、理由とともに'),
});

// サンプル楽曲の要素抽出(Gemini)
export const ANALYSIS_SCHEMA = obj({
  identified_as: str('曲名・アーティストが分かれば記載。分からなければ「不明」'),
  genre: str('メインジャンル(英語)'),
  subgenres: strArr('サブジャンル(英語)'),
  era_feel: str('年代感(例:2020s J-pop, 80s city pop)'),
  bpm_estimate: str('テンポの推定(例:約128 BPM)。確信度も書く'),
  key_estimate: str('キー/モードの推定(例:A minor)。確信度も書く'),
  time_signature: str('拍子'),
  mood: strArr('ムード(英語の形容詞)'),
  energy_curve: str('曲全体のエネルギーの流れ(イントロ→サビ→ラスト)'),
  instrumentation: strArr('使われている楽器・音色(英語)'),
  vocal: obj({
    gender: str('声の性別・質感'),
    timbre: str('声色(例:breathy, husky, bright)'),
    delivery: str('歌い方(例:rap-like, belting, whisper)'),
    range: str('音域の印象'),
  }),
  production: strArr('ミックス・音作りの特徴(英語)'),
  structure: {
    type: 'array',
    items: obj({ section: str('セクション名'), description: str('内容・長さ・役割') }),
  },
  hook_devices: strArr('フックの仕掛け(例:サビ頭のタイトル反復、ブレイク後の転調)'),
  lyric_themes: strArr('歌詞のテーマ・語り口'),
  syllable_density: str('1音符あたりの言葉の詰め方(言葉数の多さ・リズムの特徴)'),
  psych_highlights: strArr('音楽心理学の観点から見た「刺さる理由」'),
  suno_style: str('この曲の要素を再現する Suno Style タグ(英語・カンマ区切り・アーティスト名禁止・1000文字以内)'),
  exclude_styles: str('避けるべき要素の Exclude Styles タグ'),
  caution: str('推定の限界・著作権上の注意'),
});
