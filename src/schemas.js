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

// 推敲ループ:厳しく採点し、弱い所だけを書き直した結果
export const REVIEW_SCHEMA = obj({
  critique: {
    type: 'array',
    description: '採点表。基準ごとに厳しく採点する',
    items: obj({
      criterion: str('採点基準の名前'),
      score: { type: 'integer', description: '1〜10。8以上は「プロとしてそのまま出せる」水準のときだけ' },
      issue: str('問題点(具体的な行を引用)。問題がなければ「なし」'),
      fix: str('どう直したか。直していなければ「変更なし」'),
    }),
  },
  verdict: str('総評。改稿前と比べて何が良くなったか'),
  ...SONG_SCHEMA.properties,
});
REVIEW_SCHEMA.required = Object.keys(REVIEW_SCHEMA.properties);

// 参考曲ライブラリから「ジャンルの定番」を抽出した結果
export const PROFILE_SCHEMA = obj({
  summary: str('参考曲群をひとことで言うと'),
  common_traits: strArr('すべて(または大半)の参考曲に共通する要素。これがジャンルの「定番」'),
  distinctive_choices: strArr('各曲だけが持つ個性的な選択(曲名を付けて)'),
  tempo_range: str('テンポの範囲'),
  structure_template: str('共通する構成の型(例:Intro短→Verse→Pre→Chorus→…)'),
  hook_patterns: strArr('共通するフックの作り方'),
  vocal_direction: str('ボーカルの方向性'),
  blended_style: str('定番を押さえつつ個性を1点だけ足した Suno Style(英語・カンマ区切り・アーティスト名禁止・1000文字以内)'),
  exclude_styles: str('避ける要素の Exclude Styles'),
  caution: str('推定の限界・注意'),
});

// Suno で生成した後の改善サイクル
export const FEEDBACK_SCHEMA = obj({
  heard: str('音声がある場合:実際に聴き取れたこと(冒頭5秒・最初のサビ・全体)。音声がない場合は「音声なし」'),
  diagnosis: {
    type: 'array',
    items: obj({
      symptom: str('症状'),
      cause: str('考えられる原因(Style・タグ・歌詞のどこか)'),
      fix: str('具体的な直し方'),
    }),
  },
  title: str('タイトル(変更不要ならそのまま)'),
  style: str('直した Style(英語・カンマ区切り・1000文字以内)'),
  exclude_styles: str('直した Exclude Styles'),
  lyrics: str('直した歌詞(Suno のタグ付き。歌詞以外の問題なら元のまま)'),
  try_next: strArr('次の生成で試すこと(優先順)'),
  keep: strArr('今回うまくいっていて、変えてはいけない点'),
});

// 取り込んだ歌詞から学習した「書き方の傾向」
export const LYRIC_STYLE_SCHEMA = obj({
  summary: str('書き方の傾向をひとことで'),
  line_length: str('1行の長さの傾向(セクション別。例:Aメロ12〜16字、サビ8〜12字)'),
  packing: str('1音符に複数の音を詰める書き方の多さと使い所(多い/少ない/使い分け)。少ないなら「無理に詰めない」'),
  layering: str('ハモリ・コーラス・合いの手( )の使い方の傾向'),
  repetition: str('繰り返し(フックの反復、同じ語の反復)の傾向'),
  rhyme: str('韻・語尾の母音・リズムの揃え方'),
  vocabulary: str('語彙の傾向(漢語/和語/カタカナ/英語の比率、口語か文語か)'),
  pov: str('人称・視点・時制の置き方の傾向'),
  imagery: str('描写の傾向(具体物の多さ、比喩の種類)'),
  do_list: strArr('新しい歌詞で守るべき書き方(5〜8項目)'),
  dont_list: strArr('避けるべき書き方(3〜6項目)'),
});

// 1行だけの書き直し案
export const LINE_SCHEMA = obj({
  options: {
    type: 'array',
    description: '書き直し案を3つ。方向性を変える',
    items: obj({
      text: str('書き直した1行(歌詞のみ。タグや説明を含めない)'),
      why: str('この案の狙い(短く)'),
    }),
  },
});

// 同じ歌詞に対する Style の3案
export const STYLE_VARIANTS_SCHEMA = obj({
  variants: {
    type: 'array',
    description: '王道・少し冒険・引き算 の3案をこの順で',
    items: obj({
      name: str('案の名前(王道/少し冒険/引き算)'),
      intent: str('この案の狙い'),
      style: str('Suno Style(英語・カンマ区切り・アーティスト名禁止・1000文字以内)'),
      exclude_styles: str('Exclude Styles'),
      listen_for: str('Suno で聴き比べるときに注目する点'),
    }),
  },
});

// 評価(★)から学習した好み
export const PREFERENCE_SCHEMA = obj({
  summary: str('この作り手の好みをひとことで'),
  liked_patterns: strArr('高評価の曲に共通する特徴(歌詞・構成・音)'),
  disliked_patterns: strArr('低評価の曲に共通する特徴'),
  style_preferences: str('Style(音)の好みの傾向'),
  lyric_preferences: str('歌詞の好みの傾向'),
  do_list: strArr('次の曲で優先すること(5項目以内)'),
  avoid_list: strArr('次の曲で避けること(5項目以内)'),
  confidence: str('評価の数が少ない場合などの、確からしさの注意'),
});
