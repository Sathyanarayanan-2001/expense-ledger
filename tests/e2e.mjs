// End-to-end checks in a real browser, using the built page. Run with: npm test
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const URL = 'http://localhost:8123/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const server = await serve();
const browser = await chromium.launch();
const errors = [];
const failures = [];
let passed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; return; }
  failures.push(name);
  console.log(`FAIL ${name}${detail ? '\n     ' + detail : ''}`);
};
const section = (name) => console.log(`-- ${name}`);

// A new device: its own browser storage, as if it were another phone or laptop.
async function device(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Kolkata', locale: 'en-IN', colorScheme: 'light', acceptDownloads: true, ...opts });
  const page = await context.newPage();
  const watch = (p, tag) => {
    p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${tag}: ${m.text()}`));
  };
  watch(page, opts.tag || 'page');
  return { context, page };
}
const ready = async (page, path = '') => { await page.goto(URL + path); await page.waitForFunction(() => typeof Store !== 'undefined' && Store.state.mode === 'local'); await page.waitForSelector('#view h1'); };
const tab = async (page, name) => { await page.locator('.tabs .tab', { hasText: name }).first().click(); await page.waitForTimeout(150); };
const txt = (page, sel) => page.locator(sel).first().innerText();
const kpi = (page, label) => page.locator('.kpi').filter({ has: page.locator('.lab', { hasText: label }) }).first().locator('.val').innerText();
const toast = async (page) => ((await page.locator('.toast').count()) ? page.locator('.toast').last().innerText() : '');

// ============================================================================
section('first visit, install files and privacy');
const A = await device({ tag: 'laptop' });
const pg = A.page;
const requests = [];
pg.on('request', (r) => requests.push(r.url()));
await pg.clock.install({ time: new Date('2026-10-26T09:51:00+05:30') });
await ready(pg);
check('first visit lands on the Start guide', (await txt(pg, '#view h1')) === 'Daily Expense Ledger' && (await txt(pg, '.tab[aria-current="page"]')) === 'Start');
check('chip says this device only before any sync folder is chosen', (await txt(pg, '.chip')).includes('This device only'));
check('device setup steps are open on a new device', (await pg.locator('details.fold[open]').count()) === 1 && (await txt(pg, 'details.fold')).includes('OneDrive'));
{
  const t = await txt(pg, 'details.fold');
  check('guide names the three setups', ['Laptops', 'Android phone', 'Moving an existing ledger across', 'Restore from backup', 'Choose sync folder'].every((w) => t.includes(w)), t.slice(0, 200));
}
check('start date in the guide follows the settings', (await txt(pg, '.steps')).includes('1 Oct 2026'));
check('page makes no requests beyond itself', requests.every((u) => u.startsWith(URL)), JSON.stringify(requests.filter((u) => !u.startsWith(URL))));
check('a Content-Security-Policy limits the page to itself', (await pg.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).includes("default-src 'none'"));
check('IBM Plex Sans is embedded and loads', await pg.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 14px "IBM Plex Sans"') && [...document.fonts].some((f) => f.family.includes('IBM Plex') && f.status === 'loaded'); }));
{
  const m = await pg.evaluate(async () => { const r = await fetch('manifest.webmanifest'); const j = await r.json(); const sizes = []; for (const i of j.icons) { const x = await fetch(i.src); sizes.push([i.src, x.status, i.purpose]); } return { j, sizes }; });
  check('manifest installs as a standalone app', m.j.display === 'standalone' && m.j.start_url === './' && m.j.scope === './' && m.j.name === 'Daily Expense Ledger');
  check('every icon in the manifest exists, including a maskable one', m.sizes.length === 3 && m.sizes.every((s) => s[1] === 200) && m.sizes.some((s) => s[2] === 'maskable'), JSON.stringify(m.sizes));
  check('home-screen icon for iPhone exists', await pg.evaluate(async () => (await fetch(document.querySelector('link[rel=apple-touch-icon]').href)).status === 200));
}
check('service worker registers', await pg.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((f) => setTimeout(f, 6000))]); return !!(r && r.active); }));

// ============================================================================
section('setup, entries and dashboard figures');
await tab(pg, 'Setup');
await pg.locator('#acc-open-a_hdfc').fill('10000'); await pg.locator('#acc-open-a_hdfc').press('Tab'); await pg.waitForTimeout(150);
await pg.locator('#acc-open-a_cash').fill('500'); await pg.locator('#acc-open-a_cash').press('Tab'); await pg.waitForTimeout(150);
await pg.locator('#acc-new-name').fill('HDFC Card'); await pg.locator('#acc-new-kind').selectOption('card'); await pg.locator('#acc-new-open').fill('2000');
await pg.locator('form:has(#acc-new-name) button[type=submit]').click(); await pg.waitForTimeout(250);
check('card account added', (await pg.locator('input[id^="acc-name-"]').evaluateAll((els) => els.map((e) => e.value))).filter((v) => v === 'HDFC Card').length === 1);
check('Setup shows the sync, data and device cards', (await pg.locator('section[aria-label="Sync between devices"]').count()) === 1 && (await pg.locator('section[aria-label="Your data"]').count()) === 1 && (await pg.locator('section[aria-label="This device"]').count()) === 1);
check('Setup offers Choose sync folder', (await pg.getByRole('button', { name: 'Choose sync folder' }).count()) === 1);
check('nothing refers to the shared database any more', !(await txt(pg, '#view')).toLowerCase().includes('claude') && !(await txt(pg, '#view')).includes('shared database'));

await tab(pg, 'Add');
const row = (i = 0) => pg.locator('.draft').nth(i);
const setDate = async (d) => { await pg.locator('#e-date').fill(d); await pg.locator('#e-date').dispatchEvent('change'); await pg.waitForTimeout(120); };
const pickSlot = (label) => pg.locator('.slot', { hasText: label }).first().click();
const typePick = (i, short) => row(i).locator('.seg button', { hasText: short }).first().click();
async function fillRow(i, amt, o = {}) {
  const r = row(i);
  if (o.acct) await r.locator('select[id$="-acct"]').selectOption({ label: o.acct });
  await r.locator('input[id$="-amt"]').fill(amt);
  if (o.cat) await r.locator('select[id$="-cat"]').selectOption({ label: o.cat });
  if (o.to) await r.locator('select[id$="-to"]').selectOption({ label: o.to });
  if (o.desc) await r.locator('input[id$="-desc"]').fill(o.desc);
  if (o.mode) await r.locator('select[id$="-mode"]').selectOption({ label: o.mode });
}
const save = async () => { await pg.locator('#saveAll').click(); await pg.waitForTimeout(250); };

check('default day is today and the slot follows the clock', (await pg.locator('#e-date').inputValue()) === '2026-10-26' && (await txt(pg, '.slot[aria-pressed="true"]')).startsWith('Morning'));
await save(); check('empty save is refused', (await toast(pg)).includes('Type an amount'));
await fillRow(0, '500'); await save();
check('missing category shows an inline error', (await pg.locator('.draft .err-text').count()) > 0 && (await txt(pg, '.draft .err-text')).toLowerCase().includes('category'));
await row(0).locator('input[id$="-amt"]').fill('');
await setDate('2026-10-01'); await pickSlot('Morning'); await typePick(0, 'Income'); await fillRow(0, '50000', { cat: 'Salary', desc: 'Salary credit' }); await save();
check('saved toast names the day', (await toast(pg)).includes('Saved 1 entry') && (await toast(pg)).includes('1 Oct'), await toast(pg));
await setDate('2026-10-02'); await fillRow(0, '12,000', { cat: 'Rent', desc: 'House rent' }); await save();
await setDate('2026-10-03'); await pickSlot('Afternoon'); await fillRow(0, '1500', { cat: 'Dining and takeaway', desc: 'Dinner', acct: 'HDFC Card (card)' });
check('card account switches mode to Credit card', (await row(0).locator('select[id$="-mode"]').inputValue()) === 'Credit card'); await save();
await setDate('2026-10-04'); await pickSlot('Evening'); await typePick(0, 'Invest'); await fillRow(0, '5000', { cat: 'Mutual funds and SIP', desc: 'SIP', acct: 'HDFC' }); await save();
await setDate('2026-10-05'); await pickSlot('Night'); await typePick(0, 'Sent out'); await fillRow(0, '3000', { cat: 'Family support', desc: 'To parents', acct: 'HDFC' }); await save();
await setDate('2026-10-06'); await pickSlot('Morning'); await typePick(0, 'Own transfer'); await fillRow(0, '2000', { desc: 'Cash withdrawal', acct: 'HDFC', to: 'Cash wallet' }); await save();
await setDate('2026-10-07'); await pickSlot('Evening'); await typePick(0, 'Own transfer'); await fillRow(0, '1500', { desc: 'Card bill', acct: 'HDFC', to: 'HDFC Card (card)' }); await save();
await setDate('2026-10-08'); await pickSlot('Afternoon'); await fillRow(0, '120+80', { cat: 'Groceries and vegetables', desc: 'Vegetables', acct: 'Cash wallet', mode: 'Cash' }); await save();
check('sum entry accepted', (await toast(pg)).includes('Saved'));
await setDate('2026-10-09'); await pickSlot('Morning');
await fillRow(0, '60', { cat: 'Dining and takeaway', desc: 'Tea', acct: 'HDFC' });
await pg.getByRole('button', { name: 'Add another row' }).click(); await pg.waitForTimeout(100);
await fillRow(1, '250', { cat: 'Dining and takeaway', desc: 'Lunch', acct: 'HDFC' });
await row(1).getByRole('button', { name: /change/ }).click(); await row(1).locator('select[id$="-slot"]').selectOption({ label: 'Afternoon' });
await pg.getByRole('button', { name: 'Add another row' }).click(); await pg.waitForTimeout(100);
await fillRow(2, '90', { cat: 'Fuel and commute', desc: 'Auto', acct: 'HDFC' });
await row(2).getByRole('button', { name: /change/ }).click(); await row(2).locator('select[id$="-slot"]').selectOption({ label: 'Evening' });
check('save button counts rows', (await pg.locator('#saveAll').innerText()) === 'Save 3 entries');
await save();
check('multi-row save toast', (await toast(pg)).includes('Saved 3 entries'), await toast(pg));
check('day slots now show 3 covered', (await pg.locator('.slot .st', { hasText: '1 entry' }).count()) === 3);
await setDate('2026-10-12'); await pickSlot('Night'); await fillRow(0, '300', { cat: 'Dining and takeaway', desc: 'Dinner', acct: 'HDFC' }); await save();
await pg.locator('.seg button', { hasText: 'Since start' }).click(); await pg.waitForTimeout(150);
check('catch-up counts days since start', (await txt(pg, 'section[aria-label="Catch up on missed days"]')).includes('25 days need attention'));
await pg.locator('.gap', { hasText: 'Mon 12 Oct' }).getByRole('button', { name: 'No spend' }).click(); await pg.waitForTimeout(200);
check('marking no spend removes that day from the list', (await pg.locator('.gap', { hasText: 'Mon 12 Oct' }).count()) === 0 && (await txt(pg, 'section[aria-label="Catch up on missed days"]')).includes('24 days need attention'));

await tab(pg, 'Dashboard'); await pg.waitForTimeout(200);
const needs = 12000 + 200 + 90 + 3000, wants = 1500 + 60 + 250 + 300;
check('Income tile', (await kpi(pg, 'Income')) === '₹50,000');
check('Expense tile', (await kpi(pg, 'Expense')) === '₹14,400');
check('Savings rate tile', (await kpi(pg, 'Savings rate')) === (((50000 - needs - wants) / 50000) * 100).toFixed(1).replace('.0', '') + '%', await kpi(pg, 'Savings rate'));
check('Closing balance tile', Number((await kpi(pg, 'Closing balance')).replace(/[₹,]/g, '')) === 10000 + 500 - 2000 + 50000 - 14400 - 5000 - 3000);
check('Savings and investments tile', (await kpi(pg, 'Savings and investments')) === '₹5,000');
check('Transfers out tile', (await kpi(pg, 'Transfers out')) === '₹3,000');
check('Average daily tile', (await kpi(pg, 'Average daily')) === '₹' + Math.round(14400 / 26).toLocaleString('en-IN'));
{
  const ft = pg.locator('section[aria-label="50/30/20 check"] tbody tr');
  check('50/30/20 has three rows with the right amounts', (await ft.count()) === 3 && (await ft.nth(0).innerText()).includes('₹' + needs.toLocaleString('en-IN')) && (await ft.nth(1).innerText()).includes('₹' + wants.toLocaleString('en-IN')) && (await ft.nth(2).innerText()).includes('₹' + (50000 - needs - wants).toLocaleString('en-IN')));
  const top = pg.locator('section[aria-label="Top spending categories"] tbody tr');
  check('top categories are sorted by amount', (await top.nth(0).innerText()).startsWith('Rent') && (await top.nth(1).innerText()).startsWith('Dining'));
}
await pg.locator('#pper').selectOption('FY'); await pg.waitForTimeout(250);
check('full FY shows the same expense and a 12-month chart', (await kpi(pg, 'Expense')) === '₹14,400' && (await txt(pg, '.cols .chart')).includes('Apr') && (await txt(pg, '.cols .chart')).includes('Mar'));
await pg.locator('#pper').selectOption('2026-09'); await pg.waitForTimeout(250);
check('September is before the tracking start', (await kpi(pg, 'Expense')) === '₹0' && (await txt(pg, '.kpi:has-text("Closing balance")')).includes('before the tracking start'));
await pg.getByRole('button', { name: 'This month' }).click(); await pg.waitForTimeout(250);
const recon = async (acct, bal) => {
  await pg.locator('#rc-acct').selectOption({ label: acct }); await pg.locator('#rc-date').fill('2026-10-08'); await pg.locator('#rc-date').dispatchEvent('change'); await pg.waitForTimeout(100);
  await pg.locator('#rc-bal').fill(bal); await pg.getByRole('button', { name: 'Record balance' }).click(); await pg.waitForTimeout(250);
  return pg.locator('#recon tbody tr', { hasText: acct }).first().innerText();
};
await pg.getByRole('button', { name: 'Record bank balance' }).click(); await pg.waitForTimeout(150);
await pg.locator('#rc-acct').selectOption({ label: 'HDFC' }); await pg.locator('#rc-date').fill('2026-10-08'); await pg.locator('#rc-date').dispatchEvent('change'); await pg.waitForTimeout(100);
check('form previews the tracker balance', (await txt(pg, '#recon')).includes('₹36,500'));
{
  let r = await recon('HDFC', '36500'); check('HDFC reconciled', r.includes('Reconciled') && r.includes('₹36,500'), r);
  r = await recon('Cash wallet', '2299'); check('cash mismatch of ₹1', r.includes('Mismatch') && r.includes('−₹1'), r);
  r = await recon('HDFC Card', '2000'); check('card amount due reconciles', r.includes('Reconciled') && r.includes('₹2,000 due'), r);
}

section('records: filter, edit, move, delete');
await tab(pg, 'Records'); await pg.waitForTimeout(250);
check('records summary line', /1[234] entries/.test(await txt(pg, '#recResults p')));
await pg.locator('#rec-acct').selectOption({ label: 'Cash wallet' }); await pg.waitForTimeout(200);
check('bank filter shows both legs touching cash', (await pg.locator('#recResults tbody tr').count()) === 2);
await pg.locator('#rec-acct').selectOption({ label: 'All banks' }); await pg.locator('#rec-q').fill('card bill'); await pg.waitForTimeout(400);
check('search finds the card-bill transfer (two legs)', (await pg.locator('#recResults tbody tr').count()) === 2);
await pg.locator('#rec-q').fill('Vegetables'); await pg.waitForTimeout(400);
await pg.locator('#recResults tbody tr').first().getByRole('button', { name: /Edit entry/ }).click(); await pg.waitForSelector('.modal');
await pg.locator('.modal input[id$="-amt"]').fill('260'); await pg.getByRole('button', { name: 'Save changes' }).click(); await pg.waitForTimeout(300);
check('edit saved', (await txt(pg, '#recResults tbody tr')).includes('₹260'));
await pg.locator('#recResults tbody tr').first().getByRole('button', { name: /Edit entry/ }).click(); await pg.waitForSelector('.modal');
await pg.locator('.modal input[id$="-date"]').fill('2026-09-15'); await pg.locator('.modal input[id$="-date"]').dispatchEvent('change'); await pg.getByRole('button', { name: 'Save changes' }).click(); await pg.waitForTimeout(300);
check('entry moved out of the October view', (await pg.locator('#recResults tbody tr').count()) === 0);
await pg.locator('#rec-q').fill(''); await pg.getByRole('button', { name: 'All', exact: true }).click(); await pg.waitForTimeout(300);
await pg.locator('#rec-q').fill('Vegetables'); await pg.waitForTimeout(400);
check('moved entry is found under All with its September date', (await txt(pg, '#recResults tbody tr')).includes('15-09-2026'));
check('moving an entry to another month leaves exactly one copy', await pg.evaluate(() => Core.liveTxns(Store.getData().txns).filter((t) => t.desc === 'Vegetables').length === 1));
await pg.locator('#recResults tbody tr').first().getByRole('button', { name: /Edit entry/ }).click(); await pg.waitForSelector('.modal');
await pg.getByRole('button', { name: 'Delete entry' }).click(); await pg.getByRole('button', { name: 'Click again to delete' }).click(); await pg.waitForTimeout(300);
check('delete works after two-step confirm', (await pg.locator('#recResults tbody tr').count()) === 0);
check('a deleted entry stays behind as a marker so other devices can delete it too', await pg.evaluate(() => Object.values(Store.getData().txns).filter((t) => t.d).length === 1));
await pg.locator('#rec-q').fill('');
for (const [label, want] of [['Monthly', 'Oct 2026'], ['Weekly', 'CW41'], ['Daily', 'Fri 9 Oct']]) {
  await pg.locator('.seg button', { hasText: label }).click(); await pg.waitForTimeout(250);
  check(`${label} view lists ${want}`, (await txt(pg, '#recResults')).includes(want));
}

section('budget and theme');
await tab(pg, 'Budget'); await pg.waitForTimeout(250);
await pg.getByRole('button', { name: /Show all categories/ }).click(); await pg.waitForTimeout(200);
await pg.locator('#bud-c_rent').fill('15000'); await pg.locator('#bud-c_rent').press('Tab'); await pg.waitForTimeout(300);
await pg.locator('#bud-c_dine').fill('1000'); await pg.locator('#bud-c_dine').press('Tab'); await pg.waitForTimeout(300);
check('rent within budget', (await pg.locator('.tbl tr', { hasText: 'Rent' }).first().innerText()).includes('Within'));
check('dining over budget', (await pg.locator('.tbl tr', { hasText: 'Dining and takeaway' }).first().innerText()).includes('Over budget'));
check('pace card present for a month', (await pg.locator('section[aria-label="Spending pace this month"]').count()) === 1);
await pg.locator('#themeBtn').click(); await pg.waitForTimeout(150);
check('theme cycles to light', (await pg.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light');
await pg.locator('#themeBtn').click(); await pg.waitForTimeout(150);
check('dark theme paints a dark body', (await pg.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark' && (await pg.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== 'rgb(249, 249, 247)');
await pg.locator('#themeBtn').click(); await pg.waitForTimeout(150);
check('theme returns to automatic', (await pg.evaluate(() => document.documentElement.getAttribute('data-theme'))) === null);

section('everything survives a reload (stored in the browser)');
const before = await pg.evaluate(() => ({ n: Store.derive().txns.length, open: Store.derive().cfg.accounts.map((a) => a.opening), budgets: Store.derive().cfg.budgets, recon: Store.derive().recon.length }));
await pg.reload(); await pg.waitForFunction(() => Store.state.mode === 'local'); await pg.waitForSelector('#view h1');
const after = await pg.evaluate(() => ({ n: Store.derive().txns.length, open: Store.derive().cfg.accounts.map((a) => a.opening), budgets: Store.derive().cfg.budgets, recon: Store.derive().recon.length }));
check('entries, opening balances, budgets and balance checks come back', JSON.stringify(before) === JSON.stringify(after) && before.n > 10, JSON.stringify([before, after]));
await tab(pg, 'Dashboard'); await pg.waitForTimeout(250);
check('dashboard figures are the same after reload', (await kpi(pg, 'Income')) === '₹50,000');

section('page keeps working with no connection');
await pg.evaluate(() => navigator.serviceWorker.ready); await pg.reload(); await pg.waitForSelector('#view h1');
await A.context.setOffline(true);
await pg.reload(); await pg.waitForFunction(() => typeof Store !== 'undefined' && Store.state.mode === 'local'); await pg.waitForSelector('#view h1');
check('reloads offline with the data in place', (await pg.evaluate(() => Store.derive().txns.length)) === after.n);
await A.context.setOffline(false);

// ============================================================================
section('backup and restore');
await tab(pg, 'Setup');
const [dl] = await Promise.all([pg.waitForEvent('download'), pg.getByRole('button', { name: 'Download backup' }).click()]);
await dl.saveAs(`${OUT}/backup.json`);
const backup = JSON.parse(readFileSync(`${OUT}/backup.json`, 'utf8'));
check('backup file is named for the app and date', /^Expense_Ledger_Backup_2026-10-26\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
check('backup holds everything', backup.app === 'expense-ledger' && backup.v === 1 && Object.keys(backup.data.txns).length >= after.n && Object.keys(backup.data.cfg.accts).length === 5 && Object.keys(backup.data.recon).length === 3);
const B = await device({ tag: 'second device' });
await B.page.clock.install({ time: new Date('2026-10-26T09:51:00+05:30') });
await ready(B.page); await tab(B.page, 'Setup');
{
  const [fc] = await Promise.all([B.page.waitForEvent('filechooser'), B.page.getByRole('button', { name: 'Restore from backup' }).click()]);
  await fc.setFiles(`${OUT}/backup.json`); await B.page.waitForSelector('.toast');
  check('restore reports what it added', /Backup merged: \d+ new entries/.test(await toast(B.page)), await toast(B.page));
  const same = await B.page.evaluate(() => ({ n: Store.derive().txns.length, cfg: Store.derive().cfg.accounts.map((a) => a.name + ':' + a.opening), budgets: Store.derive().cfg.budgets }));
  check('the second device now has the same entries and settings', same.n === after.n && same.cfg.includes('HDFC Card:-2000') && same.budgets.c_rent === 15000, JSON.stringify(same));
  await B.page.waitForTimeout(3500);
  const [fc2] = await Promise.all([B.page.waitForEvent('filechooser'), B.page.getByRole('button', { name: 'Restore from backup' }).click()]);
  await fc2.setFiles(`${OUT}/backup.json`); await B.page.waitForTimeout(400);
  check('restoring the same backup again changes nothing', (await toast(B.page)).includes('already here'), await toast(B.page));
  const [fc3] = await Promise.all([B.page.waitForEvent('filechooser'), B.page.getByRole('button', { name: 'Restore from backup' }).click()]);
  await fc3.setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') }); await B.page.waitForTimeout(400);
  check('a file that is not a backup is refused with a clear message', (await toast(B.page)).includes('not a backup from this app'), await toast(B.page));
  const [fc4] = await Promise.all([B.page.waitForEvent('filechooser'), B.page.getByRole('button', { name: 'Restore from backup' }).click()]);
  await fc4.setFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('this is not json') }); await B.page.waitForTimeout(400);
  check('text that is not JSON is refused', (await toast(B.page)).includes('not a backup from this app'), await toast(B.page));
  check('refused files changed nothing', (await B.page.evaluate(() => Store.derive().txns.length)) === after.n);
}

section('Excel and CSV leave the app and come back');
await tab(pg, 'Records'); await pg.getByRole('button', { name: 'All', exact: true }).click(); await pg.waitForTimeout(250);
const [xl] = await Promise.all([pg.waitForEvent('download'), pg.getByRole('button', { name: 'Excel' }).click()]);
await xl.saveAs(`${OUT}/records.xlsx`);
const [cs] = await Promise.all([pg.waitForEvent('download'), pg.getByRole('button', { name: 'CSV' }).click()]);
await cs.saveAs(`${OUT}/records.csv`);
check('Excel and CSV downloads have content', statSync(`${OUT}/records.xlsx`).size > 3000 && statSync(`${OUT}/records.csv`).size > 500);
{
  // the exported Excel file, read back by the app's own reader
  const b64 = readFileSync(`${OUT}/records.xlsx`).toString('base64');
  const r = await pg.evaluate(async (b) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); const x = await XL.read(u.buffer); return { sheets: x.sheets.map((s) => s.name), rows: x.sheets[0].rows.length }; }, b64);
  check('workbook has the Records, summary, lists and read-me sheets', JSON.stringify(r.sheets) === JSON.stringify(['Records', 'Monthly summary', 'Lists', 'Read me']), JSON.stringify(r.sheets));
  check('one row per leg plus the header', r.rows === (await pg.evaluate(() => Core.buildLegs(Store.derive().txns).length)) + 1);
}
// import the Excel file on a fresh device: every entry comes across
const C = await device({ tag: 'third device' });
await C.page.clock.install({ time: new Date('2026-10-26T09:51:00+05:30') });
await ready(C.page);
await C.page.evaluate((c) => { Store.setCfg(c); }, await pg.evaluate(() => Store.derive().cfg));
await tab(C.page, 'Records');
await C.page.getByRole('button', { name: 'Import' }).click(); await C.page.waitForSelector('.modal');
await C.page.locator('#imp-file').setInputFiles(`${OUT}/records.xlsx`); await C.page.waitForSelector('text=Import ');
check('import preview names the new entries', /\d+ new/.test(await txt(C.page, '.modal')) || (await txt(C.page, '.modal')).includes('Import'), (await txt(C.page, '.modal')).slice(0, 300));
await C.page.getByRole('button', { name: /^Import \d+ entr/ }).click(); await C.page.waitForTimeout(600);
{
  const n = await C.page.evaluate(() => Store.derive().txns.length);
  const sums = await Promise.all([pg, C.page].map((p) => p.evaluate(() => { const s = Core.summarize(Store.derive().txns, '2026-01-01', '2026-12-31'); return [s.income, s.expense, s.invest, s.tout, s.xfer, s.count]; })));
  check('imported entries equal the exported ones', n === after.n && JSON.stringify(sums[0]) === JSON.stringify(sums[1]), JSON.stringify([n, after.n, sums]));
}
await C.context.close();
await B.context.close();

// ============================================================================
section('sync through a folder: two devices');
// A folder shared by two browsers, kept in this test process. The page-side stand-in has the same surface as a real folder.
const files = new Map();
let clock = 1;
const sharedFolder = {
  list: () => [...files.entries()].map(([name, f]) => ({ name, mtime: f.mtime, size: f.bytes.length })),
  read: (name) => { const f = files.get(name); return f ? { b64: Buffer.from(f.bytes).toString('base64'), mtime: f.mtime } : null; },
  write: (name, b64) => { files.set(name, { bytes: Buffer.from(b64, 'base64'), mtime: 1700000000000 + clock++ }); return true; },
  remove: (name) => { files.delete(name); return true; },
};
async function folderDevice(tag) {
  const d = await device({ tag });
  await d.context.exposeFunction('folderList', async () => sharedFolder.list());
  await d.context.exposeFunction('folderRead', async (n) => sharedFolder.read(n));
  await d.context.exposeFunction('folderWrite', async (n, b) => sharedFolder.write(n, b));
  await d.context.exposeFunction('folderRemove', async (n) => sharedFolder.remove(n));
  await d.context.addInitScript(() => {
    window.__perm = 'granted';
    const handle = (name) => ({
      kind: 'file', name,
      async getFile() { const r = await window.folderRead(name); const bytes = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0)); return new File([bytes], name, { lastModified: r.mtime }); },
      async createWritable() { const parts = []; return { async write(b) { parts.push(b); }, async close() { const buf = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ''; buf.forEach((c) => { s += String.fromCharCode(c); }); await window.folderWrite(name, btoa(s)); } }; },
    });
    window.__dir = {
      kind: 'directory', name: 'Expense ledger',
      async *entries() { for (const f of await window.folderList()) yield [f.name, handle(f.name)]; },
      async getFileHandle(name) { return handle(name); },
      async removeEntry(name) { await window.folderRemove(name); },
      async queryPermission() { return window.__perm; },
      async requestPermission() { window.__perm = 'granted'; return 'granted'; },
    };
    window.__dir.__fake = true;
    window.showDirectoryPicker = async () => window.__dir;
    // A real folder handle can be stored in IndexedDB and read back after a reload; a plain object cannot be cloned,
    // so the stand-in is swapped for a marker on the way in and for the stand-in again on the way out.
    const put = IDBObjectStore.prototype.put, get = IDBObjectStore.prototype.get, del = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.put = function (v, k) { if (k === 'dirHandle' && v && v.__fake) { sessionStorage.setItem('__dirHandle', '1'); return put.call(this, 1, k); } return put.call(this, v, k); };
    IDBObjectStore.prototype.get = function (k) { const r = get.call(this, k); if (k === 'dirHandle') Object.defineProperty(r, 'result', { get: () => (sessionStorage.getItem('__dirHandle') ? window.__dir : undefined) }); return r; };
    IDBObjectStore.prototype.delete = function (k) { if (k === 'dirHandle') sessionStorage.removeItem('__dirHandle'); return del.call(this, k); };
  });
  await ready(d.page);
  return d;
}
const laptop = await folderDevice('sync laptop');
const phone = await folderDevice('sync phone');
const L = laptop.page, P = phone.page;
const names = () => [...files.keys()].sort();
const live = (p) => p.evaluate(() => Core.liveTxns(Store.getData().txns).map((t) => t.id + ':' + t.amt).sort());
const addTx = (p, id, amt, extra = {}) => p.evaluate(([i, a, e]) => Store.putTxns([{ id: i, date: '2026-10-10', slot: 'morning', type: 'expense', acct: 'a_hdfc', amt: a, cat: 'c_misc', desc: i, ...e }]), [id, amt, extra]);
await addTx(L, 'e1', 100); await addTx(L, 'e2', 200);
await tab(L, 'Setup'); await L.getByRole('button', { name: 'Choose sync folder' }).click(); await L.waitForFunction(() => Sync.state === 'ok');
check('connecting writes this device\'s data into the folder', names().length === 1 && /^ledger-save-\d{14}-[a-z0-9]+\.json\.gz$/.test(names()[0]), JSON.stringify(names()));
check('chip shows the folder is in sync', (await txt(L, '.chip')).startsWith('Synced'), await txt(L, '.chip'));
check('Setup now offers save now, load latest and disconnect', (await L.getByRole('button', { name: 'Save now' }).count()) === 1 && (await L.getByRole('button', { name: 'Disconnect' }).count()) === 1);
await tab(P, 'Setup'); await P.getByRole('button', { name: 'Choose sync folder' }).click(); await P.waitForFunction(() => Sync.state === 'ok');
check('a second device that connects receives the first device\'s entries', JSON.stringify(await live(P)) === JSON.stringify(['e1:100', 'e2:200']), JSON.stringify(await live(P)));
check('each device keeps its own save file', names().length === 2);
// edits, additions and deletions travel
await P.evaluate(() => Store.putTxns([{ ...Store.derive().byId.get('e1'), amt: 150 }])); await addTx(P, 'e3', 300); await P.evaluate(() => Store.removeTxns(['e2']));
await P.evaluate(() => Sync.push()); await L.evaluate(() => Sync.pull());
check('an edit, an addition and a deletion made on the phone reach the laptop', JSON.stringify(await live(L)) === JSON.stringify(['e1:150', 'e3:300']), JSON.stringify(await live(L)));
// both change things while apart, then meet
await addTx(L, 'e4', 400); await P.evaluate(() => Store.putTxns([{ ...Store.derive().byId.get('e3'), amt: 333 }]));
await L.evaluate(() => Sync.push()); await P.evaluate(() => Sync.push()); await L.evaluate(() => Sync.pull()); await P.evaluate(() => Sync.pull());
const lv = await live(L), pv = await live(P);
check('changes made apart on both devices merge, and both end up identical', JSON.stringify(lv) === JSON.stringify(pv) && JSON.stringify(lv) === JSON.stringify(['e1:150', 'e3:333', 'e4:400']), JSON.stringify([lv, pv]));
// settings travel too
await L.evaluate(() => { const c = JSON.parse(JSON.stringify(Store.derive().cfg)); c.budgets.c_rent = 15000; c.accounts[0].opening = 2500; Store.setCfg(c); });
await P.evaluate(() => { const c = JSON.parse(JSON.stringify(Store.derive().cfg)); c.budgets.c_dine = 1200; Store.setCfg(c); });
await L.evaluate(() => Sync.push()); await P.evaluate(() => Sync.push()); await L.evaluate(() => Sync.pull()); await P.evaluate(() => Sync.pull());
const cfgs = await Promise.all([L, P].map((p) => p.evaluate(() => { const c = Store.derive().cfg; return [c.budgets, c.accounts[0].opening]; })));
check('different settings changed on each device both survive', JSON.stringify(cfgs[0]) === JSON.stringify(cfgs[1]) && cfgs[0][0].c_rent === 15000 && cfgs[0][0].c_dine === 1200 && cfgs[0][1] === 2500, JSON.stringify(cfgs));
// a no-spend mark and a balance check
await L.evaluate(() => Store.setMarks({ '2026-10-11|night': true })); await L.evaluate(() => Store.putRecon({ id: 'rx', acct: 'a_hdfc', asOf: '2026-10-11', bal: 5, note: '', demo: false }));
await L.evaluate(() => Sync.push()); await P.evaluate(() => Sync.pull());
check('no-spend marks and balance checks sync', await P.evaluate(() => !!Store.derive().marks['2026-10-11|night'] && Store.derive().recon.some((r) => r.id === 'rx')));
// automatic save about three seconds after a change
await addTx(L, 'e5', 500);
check('a change shows as waiting to save', await L.evaluate(() => Sync.state === 'pending'));
await L.waitForFunction(() => Sync.state === 'ok', null, { timeout: 8000 });
await P.evaluate(() => Sync.pull());
check('the change is saved on its own and arrives on the other device', (await live(P)).includes('e5:500'));
// the folder keeps the last three sessions
for (let i = 0; i < 4; i++) { await L.evaluate(() => { Sync.sessionFile = null; }); await L.waitForTimeout(1100); await addTx(L, 'k' + i, 1 + i); await L.evaluate(() => Sync.push()); }
check('only the newest three save files are kept', names().length === 3, JSON.stringify(names()));
// awkward files
files.set('ledger-save-29990101000000-half.json.gz', { bytes: Buffer.from('not finished'), mtime: 1700000099999 });
files.set('ledger-save-29990102000000-other.json', { bytes: Buffer.from(JSON.stringify({ app: 'tracker', v: 1, data: { logs: {} } })), mtime: 1700000099998 });
await P.evaluate(() => Sync.pull());
check('a half-delivered file and another app\'s file do not stop sync', (await P.evaluate(() => Sync.state)) === 'ok' && (await live(P)).includes('k3:4'));
// access to the folder is taken away, then given back
await P.evaluate(() => { clearTimeout(Sync.timer); window.__perm = 'prompt'; Sync.fail({ name: 'NotAllowedError' }); });
await P.waitForSelector('.banner:has-text("Allow access")');
check('when the browser asks again the page says so and the chip changes', (await txt(P, '.chip')).includes('Allow folder access'));
await P.getByRole('button', { name: 'Allow', exact: true }).click(); await P.waitForFunction(() => Sync.state === 'ok');
check('allowing access brings sync back', (await P.locator('.banner:has-text("Allow access")').count()) === 0);
// closing and reopening the page: the folder is remembered and sync resumes without asking again
await L.reload(); await L.waitForFunction(() => typeof Store !== 'undefined' && Store.state.mode === 'local');
await L.waitForFunction(() => Sync.state === 'ok', null, { timeout: 8000 });
check('after a reload the folder is remembered and sync resumes', (await txt(L, '.chip')).startsWith('Synced') && JSON.stringify(await live(L)) === JSON.stringify(await live(P)));
// disconnecting keeps the entries
const nBefore = await P.evaluate(() => Store.derive().txns.length);
await P.evaluate(() => Sync.stop());
check('disconnecting keeps every entry on the device', (await P.evaluate(() => Store.derive().txns.length)) === nBefore && (await txt(P, '.chip')).includes('This device only'));
await laptop.context.close(); await phone.context.close();

// ============================================================================
section('phone: layout, touch targets and install');
{
  const M = await device({ tag: 'phone view', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ready(M.page);
  await M.page.evaluate(() => Store.loadSample());
  for (const t of ['Start', 'Dashboard', 'Add', 'Records', 'Budget', 'Setup']) {
    await tab(M.page, t); await M.page.waitForTimeout(250);
    check(`phone layout fits the width: ${t}`, await M.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), String(await M.page.evaluate(() => document.documentElement.scrollWidth)));
    await M.page.screenshot({ path: `${OUT}/phone-${t.toLowerCase()}.png`, fullPage: true });
  }
  await tab(M.page, 'Start');
  check('phone shows the bottom tab bar', (await M.page.locator('.tabs').evaluate((el) => getComputedStyle(el).position)) === 'fixed');
  check('install offer appears when the browser provides one', await M.page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); return true; }));
  await tab(M.page, 'Setup'); await M.page.waitForTimeout(150);
  check('Setup then offers Install app', (await M.page.getByRole('button', { name: 'Install app' }).count()) === 1);
  await M.page.getByRole('button', { name: 'Install app' }).click(); await M.page.waitForTimeout(150);
  check('Install app asks the browser to install', await M.page.evaluate(() => window.__prompted === true));
  await M.context.close();
}

section('desktop screenshots with sample data');
{
  const S = await device({ tag: 'screenshots' });
  await ready(S.page);
  await S.page.evaluate(() => Store.loadSample());
  for (const t of ['Start', 'Dashboard', 'Add', 'Records', 'Budget', 'Setup']) { await tab(S.page, t); await S.page.waitForTimeout(300); await S.page.screenshot({ path: `${OUT}/desktop-${t.toLowerCase()}.png`, fullPage: true }); }
  check('every desktop page opens with sample data', true);
  await S.context.close();
}

check('no console errors or page errors anywhere', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
await A.context.close();
await browser.close();
server.close();
console.log(`e2e: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
