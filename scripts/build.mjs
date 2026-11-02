// Builds one self-contained page into dist/, so the app works offline with no CDN.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const { version } = JSON.parse(read('package.json'));

// IBM Plex Sans, embedded. "latin" covers text and digits; "latin-ext" adds the rupee sign.
const RANGES = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};
const fonts = Object.entries(RANGES).flatMap(([subset, range]) => [400, 500, 600].map((w) => {
  const file = join(root, 'node_modules/@fontsource/ibm-plex-sans/files', `ibm-plex-sans-${subset}-${w}-normal.woff2`);
  const b64 = readFileSync(file).toString('base64');
  return `@font-face{font-family:"IBM Plex Sans";font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range}}`;
})).join('');

// Order matters: each file may use the ones before it.
const ORDER = ['core.js', 'xlsx.js', 'ioformat.js', 'model.js', 'util.js', 'store.js', 'sync.js', 'charts.js', 'app-common.js', 'page-dash.js', 'page-entry.js', 'page-records.js', 'page-import.js', 'page-budget.js', 'page-setup.js', 'main.js'];
const app = ORDER.map((f) => read('src', f)).join('\n');
if (app.includes('</script')) throw new Error('A source file contains "</script", which would end the page script early.');

// Function replacers stop "$" sequences in the code being read as patterns.
const html = read('src/index.html')
  .replace('/*{{fonts}}*/', () => fonts)
  .replace('/*{{css}}*/', () => read('src/app.css'))
  .replace('/*{{app}}*/', () => app);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
writeFileSync(join(dist, 'index.html'), html);
writeFileSync(join(dist, 'sw.js'), read('src/sw.js').replace('__VERSION__', version));
cpSync(join(root, 'src/manifest.webmanifest'), join(dist, 'manifest.webmanifest'));
cpSync(join(root, 'public'), dist, { recursive: true });
console.log(`Built v${version}: ${(html.length / 1048576).toFixed(2)} MB`);
