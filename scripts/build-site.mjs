// 公開用のファイルだけを public/ にまとめる(GitHub Pages・Vercel などの静的ホスティング用)。
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const out = new URL('../public/', import.meta.url);
const files = ['index.html', 'style.css', 'textbook.html', 'dist/app.js', 'dist/claude.js', 'dist/gemini.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

rmSync(out, { recursive: true, force: true });
mkdirSync(new URL('dist/', out), { recursive: true });
mkdirSync(new URL('icons/', out), { recursive: true });
const hash = createHash('sha256');
for (const f of files) {
  cpSync(new URL(f, root), new URL(f, out));
  hash.update(readFileSync(new URL(f, root)));
}
// 中身が変わるたびにサービスワーカーの版も変わり、利用者の画面が新しい版に入れ替わる
const version = hash.digest('hex').slice(0, 12);
writeFileSync(new URL('sw.js', out), readFileSync(new URL('sw.template.js', root), 'utf8').replace('__VERSION__', version));
console.log(`public/ に公開用ファイルをまとめました(版 ${version})`);
