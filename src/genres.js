// ジャンル別の「定番の型」(2026-11-24 調査)。
// BPM の範囲は多くが統計の裏づけのない実務上の目安です(note に明記)。
// AI への指示では「型の土台」として使い、個性は歌詞と1点の冒険で出させます。

export const GENRES = [
  {
    id: 'jpop',
    label: 'J-POP(王道)',
    tempo: '約120〜150 BPM',
    structure: 'イントロ4〜8小節 → Aメロ → Bメロ → サビ ×2 → 間奏 → Cメロ → 落ちサビ → ラスサビ(半音〜全音上げの転調もある)',
    lyrics: '基本は1音1モーラ。サビはタイトル語を反復する',
    harmony: '王道進行(IV–V–iii–vi)、カノン進行、小室進行',
    sound: 'バンド+シンセ+ストリングスの明るいミックス',
    tags: 'J-pop, upbeat, catchy chorus, bright synths, electric guitar, emotional build-up, key change final chorus',
    note: '王道進行は日本のポップスを特徴づける進行(Ramage 2023, Music Theory Spectrum)。BPM・構成は実務上の目安。',
  },
  {
    id: 'ballad',
    label: 'バラード',
    tempo: '約60〜85 BPM',
    structure: 'ピアノのイントロ → A → B → サビ → 落ちサビ(ピアノのみ)→ ラスサビで壮大に(転調することも)',
    lyrics: '音数は少なめで、長く伸ばす音を多く使う。1音1文字で丁寧に歌う所が多い',
    harmony: '王道進行とその派生、分数コードでベースが下がっていく進行',
    sound: 'ピアノ中心、ストリングス、控えめなドラム',
    tags: 'Japanese ballad, slow tempo, emotional piano, lush strings, heartfelt vocals, soft drums, cinematic build, intimate',
    note: 'BPM・構成は実務上の目安(統計の出典なし)。',
  },
  {
    id: 'vocaloid',
    label: 'ボカロ系(高速ロック/エレクトロ)',
    tempo: '約150〜200 BPM(倍テンで感じる曲も多い)',
    structure: '短いイントロ → 言葉を詰めたA・B → 高速サビ。ブレイクやキメが多い',
    lyrics: '音数が多い早口。16分音符単位で言葉を詰める(「1音符に複数の音」が最も合うジャンル)',
    harmony: '王道進行、マイナー調のロック進行',
    sound: '歪んだギター、グリッチ系シンセ、硬いドラム',
    tags: 'vocaloid-style, fast J-rock, electro rock, high-pitched synthetic female vocals, rapid-fire lyrics, distorted guitar, glitchy synths',
    note: '人気ボカロ曲1,900曲の分析でテンポがわずかに上昇傾向という報告あり(情報処理学会の抄録)。BPM範囲は実務上の目安。',
  },
  {
    id: 'citypop',
    label: 'シティポップ',
    tempo: '約90〜120 BPM',
    structure: 'グルーヴ重視。イントロでリフを聴かせ、Aメロ → サビを繰り返す',
    lyrics: '都会の夜・ドライブなどの情景。言葉は詰めすぎず、リズムに乗せる',
    harmony: 'メジャー7th・9th、ツーファイブ、丸サ進行(Just The Two of Us 進行)',
    sound: 'エレピ、スラップベース、裏拍のギターカッティング、サックス',
    tags: 'Japanese city pop, 80s, AOR, funky bass, glossy electric piano, rhythm guitar cutting, smooth vocals, saxophone, nostalgic night drive',
    note: 'Suno 公式のジャンルページの例はエレピ・スラップベース・ギターカッティング。BPM範囲は実務上の目安。',
  },
  {
    id: 'hiphop',
    label: '日本語ヒップホップ',
    tempo: 'ブーンバップ約90/トラップ約95〜110(ハーフタイム感)/ドリル約110〜145 BPM',
    structure: 'イントロ → Verse(16小節)→ Hook(8小節)の繰り返し',
    lyrics: '言葉の密度が高い。脚韻・母音韻を重視する(分析ビューの「語尾の母音」が役立つ)',
    harmony: 'ループ中心。コード進行より、ビートとサンプルの質感',
    sound: '808ベース、ハイハットの連打、ローファイなサンプル',
    tags: 'Japanese hip hop, boom bap, trap beat, 808 bass, hi-hat rolls, rap vocals, rhythmic flow, lo-fi sample',
    note: 'テンポは音楽制作サイトの解説による。構成は実務上の目安。',
  },
  {
    id: 'anison',
    label: 'アニソン',
    tempo: '約150〜180 BPM',
    structure: 'TVサイズは約90秒が慣習。セクション間の転調が多く、Bメロ(プレサビ)が転調の橋渡しになる',
    lyrics: '作品世界の言葉を1〜2個だけ使い、サビで一気に解放する',
    harmony: '王道進行、短3度などの半音階的な転調',
    sound: '高速ドラム、明るいブラス、厚いギター、伸びる女性ボーカル',
    tags: 'anime opening, J-rock, high energy, soaring female vocals, fast drums, bright brass hits, dramatic key change, anthemic chorus',
    note: '転調の特徴は Li (2026, Music Theory Online) の抄録による。BPM・TVサイズは実務上の目安。',
  },
];

export function genreById(id) {
  return GENRES.find((g) => g.id === id) || null;
}

export function genreToText(g) {
  if (!g) return '';
  return [
    `ジャンル:${g.label}`,
    `テンポの目安:${g.tempo}`,
    `構成の型:${g.structure}`,
    `歌詞の密度:${g.lyrics}`,
    `和声:${g.harmony}`,
    `音:${g.sound}`,
    `Style タグの例:${g.tags}`,
    `(根拠と確度:${g.note})`,
  ].join('\n');
}
