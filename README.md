# Music Creator

伝えたいメッセージから、Suno にそのまま貼れる楽曲(タイトル・Style・歌詞)を作る制作システムです。

- **Claude**:メッセージから、ゼロで歌詞を書く(Aメロ+サビの量産 → フル尺)
- **Gemini**:できた歌詞の補強と、Suno 用 Style プロンプトの作成
- **Gemini**:参考曲(音声ファイル / YouTube / 曲名)の要素抽出
- **音楽心理学ナレッジ**:検証した32項目を、毎回 AI への指示に組み込み

使い方は [textbook.html](textbook.html)(AI作曲の教科書)に、手順どおりにまとめています。

## 使い方(3分)

1. このフォルダの `index.html` をブラウザ(Chrome 推奨)で開く。
2. 「設定」タブで Claude と Gemini の APIキーを入れて「保存」。
   - キーがなくても、各画面の「キーなし」ボタンで claude.ai / Gemini アプリにコピペして使えます。
3. 「① メッセージから作る」に伝えたいことを書いて、「Aメロ+サビを量産」。
4. 気に入った案の「この案をフル尺に仕上げる」→「② Gemini で補強」。
5. 「④ Suno に貼る」の各欄をコピーして、Suno の Custom モードに貼る。

> **商用利用の注意**:Suno の無料プランで作った曲は、あとから有料プランに加入しても商用利用できません。
> 商用で使う曲は、有料プランの期間中に生成してください。
> (出典:[Suno Help](https://help.suno.com/en/articles/2425729))

## AI に必ず守らせているルール

- 視点の固定:誰が・誰に・いつ・どこで歌う言葉かを決め、最後までブレさせない
- テーマ用語の全部盛り禁止:中心モチーフは1〜2個に絞る
- 1音符に複数の音を入れる/引き算思考/ジャンルの定番を土台に/まずAメロとサビ
- Suno の書式(Style は英語タグ・アーティスト名禁止、歌詞はタグ+歌う言葉だけ、サビは省略しない)

指示文の本体は `src/prompts.js`、知識は `src/knowledge.js` です。
出典の一覧は [docs/music-psychology.md](docs/music-psychology.md) にあります。

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
| `textbook/content.html` | 教科書の本文(`textbook.html` の元) |
