// 公開用のファイルだけを public/ にまとめる(Vercel などの静的ホスティング用)。
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('../public/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(new URL('dist/', out), { recursive: true });
for (const f of ['index.html', 'style.css', 'textbook.html', 'dist/app.js']) {
  cpSync(new URL(f, root), new URL(f, out));
}
console.log('public/ に公開用ファイルをまとめました');
