// textbook/content.html(本文)から、アプリに同梱する textbook.html を作る。
import { readFileSync, writeFileSync } from 'node:fs';

const content = readFileSync(new URL('../textbook/content.html', import.meta.url), 'utf8');
const backLink =
  '<p class="back-link" style="margin:0 0 8px"><a href="index.html">← Music Creator に戻る</a></p>';
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${content.replace('<div class="page">\n  <header>', `<div class="page">\n  <header>\n    ${backLink}`)}
`.replace('<div class="page">', '</head>\n<body>\n<div class="page">') + '</body>\n</html>\n';
writeFileSync(new URL('../textbook.html', import.meta.url), html);
console.log('textbook.html を書き出しました');
