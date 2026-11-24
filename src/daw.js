// Suno で作った曲を仕上げる DAW(音楽制作ソフト)の情報(2026-11-24 調査)。
// label:公式=Apple / Suno 自身のページ、二次=報道・解説サイト、未確認=報道のみで公式未確認
// 価格は変わるため、画面では必ず「App Store で確認」を添える。

export const DAWS = [
  {
    id: 'garageband',
    name: 'GarageBand',
    price: '無料(Mac・iPhone・iPad)',
    who: 'はじめての人・スマホで手軽に直したい人',
    facts: [
      { label: '公式', text: 'Mac・iPhone・iPad のどれも App Store で無料。', url: 'https://apps.apple.com/jp/app/garageband/id408709785' },
      { label: '公式', text: '付属のループ(Apple Loops)は、自作の曲の中でならロイヤリティフリーで商用利用できる(ループ単体を素材として売るのは不可)。', url: 'https://support.apple.com/en-us/102034' },
      { label: '公式', text: 'GarageBand のプロジェクトは、そのまま Logic Pro(Mac)で開ける。逆に Logic Pro のプロジェクトは GarageBand では開けない。', url: 'https://support.apple.com/guide/logicpro/lgcpa8854ca7/mac' },
      { label: '二次', text: '同じループを使った他人の曲があると、YouTube などで自動の著作権判定に引っかかることがある(ライセンス上の問題とは別)。', url: 'https://discussions.apple.com/thread/253858195' },
    ],
    canDo: [
      'Suno の WAV やステムを読み込み、曲の長さを切る・つなぐ・音量をそろえる',
      '自分の歌やハモリ、楽器を上から録音して重ねる',
      'Apple Loops や Drummer で、足りない音を少し足す',
    ],
    cannotDo: ['ボーカルと伴奏の分離(ステム分離)は Logic Pro の機能', '本格的なマスタリング補助は Logic Pro の Mastering Assistant'],
  },
  {
    id: 'logic',
    name: 'Logic Pro',
    price: 'Mac:買い切り ¥30,000(日本の App Store 表示)/または Apple Creator Studio(サブスク)',
    who: '配信・販売まで仕上げたい人・Suno の音を分解して作り直したい人',
    facts: [
      { label: '公式', text: 'Mac 版は App Store で買い切り。日本の App Store の表示は ¥30,000(macOS 26.1 以降が必要)。', url: 'https://apps.apple.com/jp/app/logic-pro/id634148309?mt=12' },
      { label: '二次', text: '2026年1月から Apple Creator Studio(Final Cut Pro・Logic Pro・Pixelmator Pro など6本のサブスク。米国 $12.99/月・$129/年、日本は月額1,780円・年額17,800円との報道)でも使える。iPad 版はサブスクのみ。', url: 'https://techcrunch.com/2026/01/13/apple-launches-creator-studio-bundle-of-apps-for-12-99-per-month' },
      { label: '二次', text: '学生・教職員向けの「Pro App バンドル」(Logic Pro を含む5本)が ¥24,000 との情報あり。', url: 'https://ameblo.jp/okaimono-hack/entry-12966839960.html' },
      { label: '公式', text: 'Stem Splitter:ステレオの音源を、ボーカル・ドラム・ベース・その他に分ける(11.x でギター・ピアノにも対応)。Apple シリコン(M1 以降)が必要。', url: 'https://www.apple.com/jp/newsroom/2024/05/logic-pro-takes-music-making-to-the-next-level-with-new-ai-features/' },
      { label: '公式', text: 'Session Players:AI のドラマー・ベーシスト・キーボーディストが、コードトラックの進行に合わせて演奏する。', url: 'https://www.apple.com/jp/newsroom/2024/05/logic-pro-takes-music-making-to-the-next-level-with-new-ai-features/' },
      { label: '公式', text: 'Mastering Assistant:完成した2ミックスを解析し、音量・音質・ダイナミクスを整えて、どの再生環境でも聴きやすくする。', url: 'https://support.apple.com/108294' },
      { label: '公式', text: 'Flashback Capture:録音ボタンを押していなくても、直前の演奏を取り戻せる。', url: 'https://support.apple.com/126835' },
      { label: '未確認', text: 'Logic Pro 13 で、DAW を直接操作する AI アシスタントや Stem Splitter の強化が報じられている(公開時期は Apple の公式情報で確認が必要)。', url: 'https://sleepfreaks-dtm.com/en/for-advance-logic/logic-pro-13/' },
    ],
    canDo: [
      'Suno の曲を Stem Splitter でボーカルと伴奏に分け、伴奏だけ差し替える・ボーカルだけ整える',
      'Session Players でドラムやベースを人間らしく作り直す',
      'Mastering Assistant で配信向けの音量・音質に仕上げる',
      'GarageBand で始めた作業を、そのまま引き継いで仕上げる',
    ],
    cannotDo: ['Windows では使えない(Mac・iPad のみ)'],
  },
];

// Suno 側の書き出し(2026-11 時点)
export const SUNO_EXPORT_FACTS = [
  { label: '公式', text: 'ステム(パートごとの音)の書き出しは Pro・Premier の機能。最大12本の、頭がそろった WAV を書き出せ、Logic などの DAW にそのまま並べられる。', url: 'https://help.suno.com/en/articles/13925185' },
  { label: '二次', text: 'WAV のダウンロードは Pro・Premier。スマホアプリからは MP3 になりやすいので、WAV はパソコンのブラウザから。', url: 'https://help.suno.com/en/articles/13926081' },
  { label: '公式', text: 'DAW で手を加えても、Suno の商用利用の条件(有料プラン加入中に作ってダウンロードした曲)は変わらない。', url: 'https://about.suno.com/blog/suno-updates-tos' },
];

export function dawById(id) {
  return DAWS.find((d) => d.id === id) || null;
}

// AI への指示に入れる短い説明
export function dawToText(d) {
  if (!d) return '';
  return [
    `作り手が仕上げに使う DAW:${d.name}`,
    `できること:${d.canDo.join(' / ')}`,
    `できないこと:${d.cannotDo.join(' / ')}`,
    `主な機能:${d.facts.filter((f) => f.label === '公式').map((f) => f.text).join(' / ')}`,
  ].join('\n');
}
