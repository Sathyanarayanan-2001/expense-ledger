// Draws the app icons into public/. Run with `node scripts/make-icons.mjs` after changing the design.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const font = readFileSync(join(root, 'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-600-normal.woff2')).toString('base64');
mkdirSync(join(root, 'public'), { recursive: true });

// scale: how much of the square the artwork uses (maskable icons keep to the middle 80%); round: corner radius as a share of the size
const html = (size, scale, round) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:P;font-weight:600;src:url(data:font/woff2;base64,${font}) format("woff2")}
html,body{margin:0;background:transparent}
.i{width:${size}px;height:${size}px;border-radius:${round * size}px;background:#0b0b0b;position:relative;overflow:hidden}
.g{position:absolute;inset:0;display:grid;place-items:center;transform:scale(${scale})}
.g b{font:600 ${size * 0.62}px/1 P,system-ui,sans-serif;color:#f9f9f7;margin-top:-${size * 0.06}px}
.g i{position:absolute;left:30%;right:30%;bottom:21%;height:${size * 0.055}px;border-radius:${size}px;background:#1baf7a}
</style><div class="i"><div class="g"><b>₹</b><i></i></div></div>`;

const jobs = [
  ['icon-192.png', 192, 1, 0.22, true],
  ['icon-512.png', 512, 1, 0.22, true],
  ['icon-maskable-512.png', 512, 0.8, 0, false],
  ['apple-touch-icon.png', 180, 1, 0, false],
];
const browser = await chromium.launch();
for (const [name, size, scale, round, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size, scale, round));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, 'public', name), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log('Icons written to public/');
