// 初めての人向けのサンプル曲(このアプリのために書いたオリジナル)。
// APIキーがなくても、STEP 4 以降の機能(分析ビュー・評価・比較など)を試せるようにするためのもの。
export const SAMPLE_SONG = {
  title: '一歩でいい',
  project: 'サンプル',
  concept: 'サンプル曲:面接に落ちた後輩に、3つ上の先輩が帰り道でかける言葉',
  core_message: '昨日より一歩進めたなら、それで十分',
  pov: {
    narrator: '就活を乗り越えた、3つ上の先輩(僕)',
    addressee: '面接に落ちたばかりの後輩(君)',
    time: '落ちた面接の帰り道の夜',
    place: '駅の改札とその帰り道',
    distance: '近いが、説教はしない',
    pronouns: '僕/君、現在形中心(3年前の回想だけ過去形)',
    shifts: [],
  },
  motifs: ['改札'],
  style:
    'J-pop, emotional pop ballad, warm, hopeful, male vocal, husky, gentle verses, belting chorus, piano, clean electric guitar, live drums, strings in final chorus, 84 BPM, wide stereo, warm mix',
  exclude_styles: 'EDM drop, autotune, heavy distortion',
  lyrics: `[Intro: soft piano, short]

[Verse 1]
改札を抜けた君の
肩が少しだけ下を向く
「また駄目だった」って笑う
その声を僕は知ってる

[Pre-Chorus]
三年前の僕も
同じ改札で止まってた
ピッと鳴るあの音が
責めてるみたいに聞こえたんだ

[Chorus]
一歩でいい 昨日より
一歩でいい それでいい
数えなくていい 遠回りでいい
君が進んだ 一歩でいい

[Verse 2]
コンビニの温かい缶を
黙って君の手に渡す
うまい言葉は持ってない
ただ帰り道を並んで歩く

[Pre-Chorus]
落ちた数なんて
誰も覚えちゃいないよ
覚えているのは きっと
今夜 ここで顔を上げた君

[Chorus]
一歩でいい 昨日より
一歩でいい それでいい
数えなくていい 遠回りでいい
君が進んだ 一歩でいい

[Bridge: sparse, whisper]
改札の音は いつか
「おかえり」に聞こえる
その日まで 僕が
隣で鳴らしてやる

[Final Chorus: full band, choir enters, bigger]
一歩でいい 昨日より
一歩でいい それでいい
数えなくていい 遠回りでいい
君が進んだ 一歩でいい
(一歩でいい)

[Outro]
改札の向こうで 待ってる`,
  psychology_notes: [
    {
      technique: 'タイトルをサビ頭で反復',
      where: '各サビの1・2行目「一歩でいい」',
      why: 'サビの反復が多い曲ほどヒットしやすく、反復は処理しやすさを高める(Nunes ほか 2015)。',
    },
    {
      technique: '二人称「君」への語りかけ',
      where: '全編',
      why: '二人称が多い曲は好まれやすい。聴き手が自分の身近な誰かを思い浮かべるため(Packard & Berger 2020)。',
    },
    {
      technique: '中心モチーフを1つに絞って育てる',
      where: '「改札」が Verse 1 → Pre-Chorus → Bridge → Outro で意味を変える',
      why: '映像イメージと個人の記憶を呼び起こす具体物は、感情を動かす仕組みの1つ(Juslin & Västfjäll 2008)。',
    },
    {
      technique: 'Bridge で引いてラストで新しい声を足す',
      where: '[Bridge: whisper] → [Final Chorus: choir enters]',
      why: '新しい声部の入りや急な音量増加は鳥肌の引き金として繰り返し報告されている(de Fleurian & Pearce 2021)。',
    },
  ],
  critique: [
    { criterion: 'サビの即効性', score: 9, issue: 'なし', fix: '変更なし' },
    { criterion: '視点の一貫性', score: 9, issue: 'なし(回想は「三年前の僕」として現在から語っている)', fix: '変更なし' },
    { criterion: 'モチーフの絞り込み', score: 9, issue: 'なし', fix: '変更なし' },
    { criterion: '具体性', score: 8, issue: 'Verse 2 の「うまい言葉は持ってない」がやや説明的', fix: '「温かい缶」という行動の描写を前に置いて補った' },
  ],
  verdict: 'サンプル用の採点です。実際の推敲では10項目すべてが採点されます。',
  self_review: ['一人称「僕」・二人称「君」で統一', 'テーマ「就活」の関連語(エントリーシート、内定など)をあえて入れず、改札だけで表現'],
  next_steps: ['「Style を3案出して聴き比べる」で音の方向を比べる', 'Suno で2〜4回生成して、良い版に★を付ける'],
};
