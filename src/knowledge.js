// 音楽心理学ナレッジベース(2026-11-24 時点で調査)。
// confidence の意味:
//   primary   … 一次情報(PubMed・出版社など)の抄録・書誌で確認
//   partial   … 書誌は一次情報で確認、具体的な数値などは報道・引用経由
//   secondary … 報道・二次資料でのみ確認
//   practice  … 学術研究ではない実務家の知識
// ※ 論文本文は直接開けていないため、数値は抄録・報道の範囲です。

export const KNOWLEDGE = [
  // ---- フック・覚えやすさ ----
  {
    area: 'フック',
    claim: 'イヤーワーム(頭から離れない曲)は、旋律の全体の形はありふれているが、途中の動き方に珍しさがある。テンポは速めの傾向。',
    action: 'サビの旋律は「上がって下がる」などの定番の形にし、1か所だけ意外な跳躍を入れる。テンポを遅くしすぎない。',
    cite: 'Jakubowski, Finkel, Stewart & Müllensiefen (2017). Dissecting an earworm. Psychology of Aesthetics, Creativity, and the Arts, 11(2), 122–135.',
    url: 'https://doi.org/10.1037/aca0000090',
    confidence: 'primary',
  },
  {
    area: 'フック',
    claim: '同じ曲の中でも、区間によって「すぐ思い出せる強さ」が大きく違う(多くはサビが最強)。',
    action: '一番強い区間(サビ)を早めに聴かせる。冒頭でサビの一部を予告する構成も有効。',
    cite: 'Burgoyne, Van Balen, Bountouridis & Honing (2013). Hooked: A game for discovering what makes music catchy. ISMIR 2013.',
    url: 'https://research-portal.uu.nl/en/publications/hooked-a-game-for-discovering-what-makes-music-catchy/',
    confidence: 'primary',
  },
  {
    area: 'フック',
    claim: '覚えやすさは「旋律の反復」「定番らしさ」「ボーカルが前に出ていること」で予測される。',
    action: 'Style に vocal-forward mix / prominent lead vocal を入れる。サビの旋律は反復させる。',
    cite: 'Van Balen, Burgoyne, Bountouridis, Müllensiefen & Veltkamp (2015). Corpus analysis tools for computational hook discovery. ISMIR 2015.',
    url: 'https://doi.org/10.5281/zenodo.1415038',
    confidence: 'partial',
  },
  // ---- 期待と驚き ----
  {
    area: '期待と驚き',
    claim: '音楽の快感は「予想→緊張→的中/裏切り→再評価」の流れで生まれる(ITPRA理論)。',
    action: 'Bメロで「溜め」を作り、サビで期待に応える。ときどき小さく裏切る。',
    cite: 'Huron, D. (2006). Sweet Anticipation: Music and the Psychology of Expectation. MIT Press.',
    url: 'https://mitpressbookstore.mit.edu/book/9780262582780',
    confidence: 'primary',
  },
  {
    area: '期待と驚き',
    claim: '快感は「不確実さ × 驚き」で決まる。予測しやすい流れの中の意外な和音、または複雑な流れの後の予想どおりの解決が最も心地よい。',
    action: '安定したコード進行の中に、意外な和音を1つだけ入れる。複雑な展開の後は定番の解決で着地させる。',
    cite: 'Cheung et al. (2019). Uncertainty and surprise jointly predict musical pleasure and amygdala, hippocampus, and auditory cortex activity. Current Biology.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/31708393/',
    confidence: 'primary',
  },
  {
    area: '期待と驚き',
    claim: '予測しやすさと不確実さには「ちょうどいいゾーン」がある。',
    action: '斬新な要素は1曲に1〜2点まで。全部を新しくしない。',
    cite: 'Gold, Pearce, Mas-Herrero, Dagher & Zatorre (2019). Predictability and uncertainty in the pleasure of music. Journal of Neuroscience, 39(47).',
    url: 'https://doi.org/10.1523/JNEUROSCI.0428-19.2019',
    confidence: 'partial',
  },
  {
    area: '期待と驚き',
    claim: '快感物質ドーパミンは「盛り上がりを待っている間」と「ピークの瞬間」に、脳の別々の場所で出る。',
    action: 'サビ前のビルドアップ自体がご褒美になる。Pre-Chorus で十分に溜める。',
    cite: 'Salimpoor et al. (2011). Anatomically distinct dopamine release during anticipation and experience of peak emotion to music. Nature Neuroscience, 14(2), 257–262.',
    url: 'https://doi.org/10.1038/nn.2726',
    confidence: 'primary',
  },
  {
    area: '期待と驚き',
    claim: '鳥肌が立つほどの感動は、脳の報酬系・情動系の活動と連動する。',
    action: '「鳥肌ポイント」を1曲に1〜2か所、意図して設計する。',
    cite: 'Blood & Zatorre (2001). Intensely pleasurable responses to music correlate with activity in brain regions implicated in reward and emotion. PNAS, 98(20).',
    url: 'https://pubmed.ncbi.nlm.nih.gov/11573015/',
    confidence: 'primary',
  },
  // ---- 反復と親しみ ----
  {
    area: '反復',
    claim: '歌詞の反復は「処理しやすさ」を上げ、サビの反復が多い曲ほど全米1位になりやすかった(1958〜2012年のチャート分析)。',
    action: 'フックの1行は、同じメロディ・同じリズムのまま何度も出す。',
    cite: 'Nunes, Ordanini & Valsesia (2015). The power of repetition. Journal of Consumer Psychology, 25, 187–199.',
    url: 'https://www.npr.org/2015/01/11/376496332/',
    confidence: 'partial',
  },
  {
    area: '反復',
    claim: '歌詞は過去50年で、より単純に、より反復的に、より個人的になってきた。',
    action: '難しい言葉より、短く口ずさめる言葉を選ぶ。',
    cite: 'Parada-Cabaleiro et al. (2024). Song lyrics have become simpler and more repetitive over the last five decades. Scientific Reports.',
    url: 'https://doi.org/10.1038/s41598-024-55742-x',
    confidence: 'partial',
  },
  {
    area: '反復',
    claim: '反復は音楽の欠点ではなく、楽しさと興味を生む中心的な特徴。',
    action: '「同じことの繰り返しは退屈」と考えて、サビを毎回変えない。',
    cite: 'Margulis, E. H. (2014). On Repeat: How Music Plays the Mind. Oxford University Press.',
    url: 'https://blog.oup.com/2014/01/music-repetition-neuroscience/',
    confidence: 'partial',
  },
  {
    area: '反復',
    claim: '感情・報酬に関わる脳の反応は「好きかどうか」より「聴き慣れているかどうか」で強くなる。',
    action: 'ジャンルの定番(音色・進行・構成)を土台にして、その上で個性を出す。',
    cite: 'Pereira et al. (2011). Music and emotions in the brain: Familiarity matters. PLoS ONE, 6(11).',
    url: 'https://pubmed.ncbi.nlm.nih.gov/22110619/',
    confidence: 'primary',
  },
  {
    area: '反復',
    claim: '「複雑すぎず単純すぎない」曲が最も好まれる(逆U字)。多くの研究と整合する。',
    action: '要素を足すより引く。ほどよい複雑さを基本にする。',
    cite: 'Chmiel & Schubert (2017). Back to the inverted-U for music preference. Psychology of Music, 45(6).',
    url: 'https://doi.org/10.1177/0305735617697507',
    confidence: 'partial',
  },
  // ---- 構成・スキップ ----
  {
    area: '構成',
    claim: 'ヒット曲ではイントロが短くなり、タイトルが早く出てくるようになった(1986〜2015年のトップ10)。',
    action: 'イントロはごく短く。タイトル(フック語)は冒頭近くで出す。',
    cite: 'Léveillé Gauvin, H. (2018). Drawing listener attention in popular music. Musicae Scientiae, 22(3), 291–304.',
    url: 'https://pure.etsmtl.ca/en/publications/drawing-listener-attention-in-popular-music-testing-five-musical-/',
    confidence: 'partial',
  },
  {
    area: '構成',
    claim: 'ストリーミングでは約4分の1の再生が最初の5秒以内にスキップされる。スキップは曲の区切り目で起きやすい。',
    action: '最初の5秒でボーカルかフックを鳴らす。セクションの変わり目で飽きさせない工夫をする。',
    cite: 'Montecchio, Roy & Pachet (2020). The skipping behavior of users of music streaming services and its relation to musical structure. PLOS ONE, 15(9).',
    url: 'https://arxiv.org/abs/1903.06008',
    confidence: 'primary',
  },
  {
    area: '構成',
    claim: '英国の約50万曲の分析で、全体の明るさは下がる傾向だが、ヒット曲は平均より明るく踊れる傾向があった。',
    action: '暗いテーマでも、リズムや音で前向きなエネルギーを残すと届きやすい。',
    cite: 'Interiano et al. (2018). Musical trends and predictability of success in contemporary songs. Royal Society Open Science.',
    url: 'https://doi.org/10.1098/rsos.171274',
    confidence: 'primary',
  },
  // ---- 感情 ----
  {
    area: '感情',
    claim: '音楽が感情を動かす仕組みは複数ある(反射・条件づけ・感情の伝染・映像イメージ・個人の記憶・期待)。',
    action: '歌詞には「映像が浮かぶ描写」と「聴き手の記憶を呼び起こす具体物」を入れる。',
    cite: 'Juslin & Västfjäll (2008). Emotional responses to music. Behavioral and Brain Sciences, 31(5), 559–575.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/18826699/',
    confidence: 'primary',
  },
  {
    area: '感情',
    claim: 'テンポと調が食い違うと「嬉しいのに切ない」混合感情が生まれる(速い短調、遅い長調)。',
    action: '切ない応援歌なら Style に uptempo, minor key のように指定する。',
    cite: 'Hunter, Schellenberg & Schimmack (2008). Mixed affective responses to music with conflicting cues. Cognition & Emotion.',
    url: 'https://doi.org/10.1080/02699930701438145',
    confidence: 'primary',
  },
  {
    area: '感情',
    claim: '悲しい曲が心地よいのは、現実の危険がなく、美しく、気持ちの整理や共感に役立つとき。',
    action: '悲しい曲は絶望で終わらせず、懐かしさや温かさを混ぜる。',
    cite: 'Sachs, Damasio & Habibi (2015). The pleasures of sad music. Frontiers in Human Neuroscience, 9, 404. / Vuoskoski et al. (2012). Music Perception, 29(3).',
    url: 'https://doi.org/10.3389/fnhum.2015.00404',
    confidence: 'primary',
  },
  {
    area: '感情',
    claim: '歌詞は悲しい曲の感情を強め、明るい曲の感情はむしろ弱めることがある。全体ではメロディの影響が大きい。',
    action: '明るい曲は音に感情を運ばせ、歌詞は軽く。悲しい曲は歌詞の具体性に力を注ぐ。',
    cite: 'Ali & Peynircioğlu (2006). Songs and emotions. Psychology of Music, 34(4). / Brattico et al. (2011). Frontiers in Psychology, 2, 308.',
    url: 'https://doi.org/10.1177/0305735606067168',
    confidence: 'primary',
  },
  {
    area: '感情',
    claim: '涙は「倚音(強拍の非和声音からの解決)」と「反復進行」で、震えは「予想外の和声」で起きやすい。',
    action: '泣かせたい所では解決する旋律と反復進行を、鳥肌を狙う所では転調や借用和音を使う。',
    cite: 'Sloboda (1991). Music structure and emotional response. Psychology of Music, 19(2), 110–120.',
    url: 'https://doi.org/10.1177/0305735691192002',
    confidence: 'primary',
  },
  {
    area: '感情',
    claim: '鳥肌の引き金として、クレッシェンド、急な音量増加、予想外の和声、新しい声や楽器の入りが繰り返し報告されている。',
    action: 'ラストサビで新しい声(ハモリ・クワイア)や楽器を足して音量を上げる。例:[Final Chorus: choir enters, bigger]',
    cite: 'de Fleurian & Pearce (2021). Chills in music: A systematic review. Psychological Bulletin, 147(9), 890–920.',
    url: 'https://doi.org/10.1037/bul0000341',
    confidence: 'partial',
  },
  // ---- 歌詞 ----
  {
    area: '歌詞',
    claim: '二人称(you)が多い曲ほど好まれ、売れる。聴き手が「自分の身近な誰か」を思い浮かべるため。',
    action: '「君/あなた」を使い、固有名を持たない宛先にする(聴き手が自分の大切な人を当てはめられる)。',
    cite: 'Packard & Berger (2020). Thinking of you: How second-person pronouns shape cultural success. Psychological Science, 31, 397–407.',
    url: 'https://doi.org/10.1177/0956797620902380',
    confidence: 'primary',
  },
  {
    area: '歌詞',
    claim: 'ジャンルの典型から外れた歌詞のほうがヒットしやすい。',
    action: '音はジャンルの定番どおりに、歌詞の切り口・語彙で差別化する。',
    cite: 'Berger & Packard (2018). Are atypical things more popular? Psychological Science, 29(7), 1178–1184.',
    url: 'https://doi.org/10.1177/0956797618759465',
    confidence: 'primary',
  },
  {
    area: '歌詞',
    claim: '歌われた歌詞は、話し言葉より聞き取りにくい。',
    action: 'フックは短く、よく使う言葉で、何度も繰り返す。大事な言葉を速いパッセージに詰め込まない。',
    cite: 'Condit-Schultz & Huron (2015). Catching the lyrics: Intelligibility in twelve song genres. Music Perception, 32(5), 470–483.',
    url: 'https://doi.org/10.1525/mp.2015.32.5.470',
    confidence: 'partial',
  },
  // ---- グルーヴ ----
  {
    area: 'グルーヴ',
    claim: '「体が動きたくなる心地よさ(グルーヴ)」は、音楽と体の同期しやすさで決まる。',
    action: 'ノリを重視する曲は、キック・ベースのパターンを明確にする。',
    cite: 'Janata, Tomic & Haberman (2012). Sensorimotor coupling in music and the psychology of the groove. JEP: General, 141, 54–75.',
    url: 'https://zenodo.org/record/997607',
    confidence: 'primary',
  },
  {
    area: 'グルーヴ',
    claim: 'シンコペーション(裏拍の強調)は「中くらい」が最も気持ちよい。和声が複雑すぎるとノリは下がる。',
    action: '踊れる曲は、リズムはやや複雑・コードはシンプルに。',
    cite: 'Witek et al. (2014). PLoS ONE, 9(4), e94446. / Matthews et al. (2019). PLOS ONE, 14(1), e0204539.',
    url: 'https://doi.org/10.1371/journal.pone.0094446',
    confidence: 'primary',
  },
  {
    area: 'グルーヴ',
    claim: 'グルーヴの最適テンポは約100〜120 BPM。日本語の「ノリ」にも最適テンポがある。',
    action: 'ダンス寄りの曲は BPM を100〜120あたりで指定する。',
    cite: 'Etani, Marui, Kawase & Keller (2018). Optimal tempo for groove. Frontiers in Psychology, 9, 462.',
    url: 'https://doi.org/10.3389/fpsyg.2018.00462',
    confidence: 'primary',
  },
  // ---- 日本のポップス ----
  {
    area: '日本語の歌',
    claim: '王道進行(IV–V–iii–vi)は、現代の日本のポップスを特徴づける進行。',
    action: '日本向けの曲は、王道進行を土台候補にする(定番の安心感)。',
    cite: 'Ramage, M. (2023). The Royal Road progression in Japanese popular music. Music Theory Spectrum, 45(2), 238–256.',
    url: 'https://doi.org/10.1093/mts/mtad008',
    confidence: 'partial',
  },
  {
    area: '日本語の歌',
    claim: '日本語の歌は「1音符に1モーラ(拍)」が標準とされてきたが、実際には「1音符に1音節(複数モーラ)」の当て方も広く見られる。',
    action: '「きょう」「せん」などを1音にまとめる当て方も自然な選択肢の1つ。ただし必須ではなく、曲調や参考歌詞の密度に合わせて使い分ける。',
    cite: 'Starr & Shih (2017). The syllable as a prosodic unit in Japanese lexical strata: Evidence from text-setting. Glossa.',
    url: 'https://doaj.org/article/ce5f24694b3f4a97bc2e3b6cfabd8f75',
    confidence: 'primary',
  },
  {
    area: '日本語の歌',
    claim: 'ヒット曲の歌詞では1990年頃を境に、外来語・カタカナが減り、漢語・漢字が増えた。',
    action: '「英語を混ぜれば今っぽい」とは限らない。英語は効果がある所だけに絞る。',
    cite: '小林雄一郎ほか (2017). Journal of the Japanese Association for Digital Humanities, 2(1), 90–107.',
    url: 'https://www.jstage.jst.go.jp/article/jjadh/2/1/2_90/_article/-char/ja',
    confidence: 'primary',
  },
  // ---- 実務家の知識 ----
  {
    area: '実務知識',
    claim: '行数・行の長さ・韻の置き方で「安定/不安定」を作り分けられる(例:ABABは安定、ABBAは不安定)。',
    action: 'Aメロ・Bメロは不安定に、サビは安定させる。',
    cite: 'Pat Pattison(Berklee)『Writing Better Lyrics』ほか',
    url: 'https://online.berklee.edu/takenote/?p=18154',
    confidence: 'practice',
  },
];

export const CONFIDENCE_LABEL = {
  primary: '一次情報で確認',
  partial: '一部は二次情報',
  secondary: '二次情報のみ',
  practice: '実務家の知識(非学術)',
};

// しょーまさんの制作ルール + Suno の注意点(AIへの指示に必ず入れる)
export const CREATOR_RULES = `
# 制作者(しょーまさん)のルール(最優先で守る)
1. 1つの音符に複数の音を入れる(使える技法の1つ。必須ではない):
   - 毎回必ず入れようとしない。曲調・ジャンル・「学習した作詞スタイル」や参考曲の言葉の密度に合うときだけ使う。
     バラードなど、1音1文字で丁寧に歌うほうが合う曲では使わなくてよい。
   (a) 言葉の詰め:「きょう」「きみ」などを1音符にまとめ、リズムと勢いを出す。使う場合は、伸ばす「間」と対比させる。
   (b) 音の重ね:ハモリ・ダブリング・コーラスで厚みを出す。使う場合はサビなど要所に絞る(引き算)。
2. 引き算思考:足すより削る。言葉も、Style のタグも、楽器も、必要なものだけにする。
3. ジャンルの代表曲を土台にする:そのジャンルの定番(音色・構成・テンポ感)を押さえたうえで個性を出す。
4. まずAメロとサビ:曲の価値はAメロとサビで決まる。ここに最も力を注ぐ。
5. 視点を固定する:誰が、誰に、いつ、どこで歌っている言葉かを最初に決め、最後までブレさせない。
6. テーマの関連語を全部盛りしない:テーマを象徴する具体物は1〜2個に絞り、それを育てる。
`;

export function knowledgeForPrompt() {
  const lines = KNOWLEDGE.map(
    (k, i) => `${i + 1}. [${k.area}] ${k.claim} → 使い方:${k.action}(出典:${k.cite}/確度:${CONFIDENCE_LABEL[k.confidence]})`,
  );
  return `# 音楽心理学ナレッジ(研究の「傾向」。絶対の法則ではない)
${lines.join('\n')}`;
}

// Suno の権利に関する注意(公式ヘルプで確認済み)
export const SUNO_RIGHTS_NOTE = {
  text:
    '無料プランで作った曲は、あとから有料プランに加入しても商用利用の権利は付きません(個別に例外対応の可能性はあるが保証なし)。' +
    '商用で使う曲は、必ず有料プランに加入している期間に生成・ダウンロードしてください。',
  url: 'https://help.suno.com/en/articles/2425729',
};
