# Music Creator

伝えたいメッセージから、Suno にそのまま貼れる楽曲(タイトル・Style・歌詞)を作る制作システムです。

| STEP | 担当 | できること |
|---|---|---|
| 1 参考曲・歌詞の学習 | Gemini | 参考曲(音声 / YouTube / 曲名)の要素抽出、複数曲の「定番」抽出、手持ちの歌詞から「書き方の傾向」を学習 |
| 2 メッセージから作る | Claude | 全自動で1曲/Aメロ+サビの量産→フル尺/いきなり1曲。仕上げに10項目の厳しい推敲 |
| 3 歌詞を補強 | Gemini | 書いた歌詞を磨き、Suno 用 Style を作成 |
| 4 Suno に貼る | — | 4欄コピー、文字数・書式・視点ブレ・決まり文句などの機械チェック、版の管理 |
| 5 聴いて直す | Gemini | Suno で生成した曲(音声も可)から原因を特定し、修正版を作成 |
| 6 公開の準備 | Claude | 紹介文・SNS 投稿文・ハッシュタグ・切り抜き箇所・ジャケット画像プロンプト |

ほかに、★評価からの好みの学習、歌詞の分析ビュー(行ごとの音数・語尾の母音・1行の書き直し)、
Style 3案の聴き比べ、プロジェクト別の整理・版の比較・バックアップがあります。

音楽心理学の知見(検証した32項目)を、毎回 AI への指示に組み込んでいます。

使い方は、アプリ上部の「ツール/教科書」の切り替えで読めます(各 STEP の「この手順の説明」からも開けます)。本文は [textbook.html](textbook.html) です。

## 使い方(3分)

1. このフォルダの `index.html` をブラウザ(Chrome 推奨)で開く。
2. 「設定」タブで Claude と Gemini の APIキーを入れて「保存」。
   - キーがなくても、各画面の「APIキーなしで使う」から claude.ai / Gemini アプリにコピペして使えます。
3. (任意)「STEP 1」で参考曲を分析し、自分の歌詞を取り込んで書き方を学習させる。
4. 「STEP 2」に伝えたいことを書いて、「全自動で作る」か「量産する」。
5. 「STEP 4」の各欄をコピーして Suno の Custom モードに貼り、生成したら「STEP 5」で直す。

> **商用利用の注意**:Suno の無料プランで作った曲は、あとから有料プランに加入しても商用利用できません。
> 商用で使う曲は、有料プランの期間中に生成してください。
> (出典:[Suno Help](https://help.suno.com/en/articles/2425729))

## AI に必ず守らせているルール

- 視点の固定:誰が・誰に・いつ・どこで歌う言葉かを決め、最後までブレさせない
- テーマ用語の全部盛り禁止:中心モチーフは1〜2個に絞る
- 1音符に複数の音(言葉の詰め・音の重ね)は、曲調や学習した歌詞に合うときだけ使う(必須にしない)
- 引き算思考/ジャンルの定番を土台に/まずAメロとサビ
- Suno の書式(Style は英語タグ・アーティスト名禁止、歌詞はタグ+歌う言葉だけ、サビは省略しない)

指示文の本体は `src/prompts.js`、知識は `src/knowledge.js` です。
出典の一覧は [docs/music-psychology.md](docs/music-psychology.md) にあります。

## ネットに公開する(スマホから使う)

GitHub Pages の場合(初回だけ設定が必要):

1. GitHub のリポジトリ画面 → Settings → Pages を開く。
2. 「Build and deployment」の Source を「GitHub Actions」にする。
3. 以後は push するたびに `.github/workflows/pages.yml` が自動で公開します。

Vercel の場合は `vercel.json` の設定で、そのまま公開できます。

## 開発者向け

```bash
npm install
```

```bash
npm run build
```

- `src/` を書き換えたら `npm run build` で `dist/app.js` と `textbook.html` を作り直します。
- `dist/app.js` は、ダブルクリックで開けるようビルド済みのものをコミットしています。
- 使用 SDK:`@anthropic-ai/sdk`(Claude)、`@google/genai`(Gemini)。ブラウザから直接 API を呼びます。
- 既定モデル:Claude `claude-opus-5-5`、Gemini `gemini-3.1-pro-preview`(「設定」タブで変更可)。

| ファイル | 役割 |
|---|---|
| `index.html` / `style.css` | 画面 |
| `src/main.js` | 画面の動き |
| `src/llm.js` | Claude / Gemini の呼び出し |
| `src/prompts.js` | AI への指示文(このシステムの頭脳) |
| `src/schemas.js` | AI に返させる JSON の形 |
| `src/knowledge.js` | 音楽心理学ナレッジ・制作ルール |
| `src/suno.js` | Suno 用の整形と文字数チェック |
| `src/audio.js` | ブラウザ内のテンポ・キー推定 |
| `src/lyricstats.js` | 取り込んだ歌詞の集計(行の長さ・繰り返し・人称・語尾の母音など) |
| `textbook/content.html` | 教科書の本文(`textbook.html` の元) |
