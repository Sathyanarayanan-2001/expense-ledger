'use strict';
/* Shell: header, navigation, theme, render loop, boot. */
function themeSeg() {
  return segmented([{ value: 'auto', label: 'Match device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], ui.theme, setTheme, 'Colour theme');
}
function applyTheme() {
  const r = document.documentElement;
  if (ui.theme === 'auto') { if (ui.themeTouched) r.removeAttribute('data-theme'); } else r.setAttribute('data-theme', ui.theme);
}
function setTheme(v) { ui.theme = v; ui.themeTouched = true; Prefs.set('theme', v); applyTheme(); render(); }
const timeAgo = (t) => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : new Date(t).toLocaleDateString(); };
// One line that says where the data is and whether it is shared with other devices.
function syncStatus() {
  const s = Store.state;
  if (s.mode === 'connecting') return { cls: 'local', text: 'Opening…', title: 'Opening your ledger' };
  if (s.mode === 'memory') return { cls: 'err', text: 'Not saved', title: s.error };
  if (s.error) return { cls: 'err', text: 'Problem saving', title: s.error };
  switch (Sync.state) {
    case 'error': return { cls: 'err', text: 'Sync problem', title: Sync.msg };
    case 'reconnect': return { cls: 'local', text: 'Allow folder access', title: 'Allow access to the sync folder to share entries with your other devices.' };
    case 'pending': case 'working': return { cls: 'local', text: 'Saving…', title: Sync.msg };
    case 'ok': return { cls: '', text: Sync.lastAt ? 'Synced ' + timeAgo(Sync.lastAt) : 'Synced', title: 'Saved on this device and in your sync folder.' };
    default: return { cls: 'local', text: 'This device only', title: 'Entries are saved in this browser. Choose a sync folder in Setup to share them with your other devices.' };
  }
}
function syncChip() {
  const st = syncStatus();
  return h('span', { class: 'chip ' + st.cls, title: st.title, role: 'status' }, h('i'), h('span', { class: 'chip-t' }, st.text));
}
// A bar under the header when the sync folder needs the person to do something.
function syncBanner() {
  const y = Sync.state;
  if (y !== 'reconnect' && y !== 'error') return null;
  return h('div', { class: 'wrap' }, h('div', { class: 'banner', role: 'status', style: { marginTop: '12px', marginBottom: 0 } },
    h('span', null, y === 'reconnect' ? 'Allow access to your sync folder to load the latest entries from your other devices.' : 'Sync problem: ' + Sync.msg),
    h('button', { type: 'button', class: 'btn sm', onClick: () => (y === 'reconnect' ? Sync.reconnect() : Sync.push()).catch((e) => Sync.fail(e)) }, y === 'reconnect' ? 'Allow' : 'Try again')));
}
// Chrome offers to install the app; keep the offer until the person wants it.
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; schedule(); });
window.addEventListener('appinstalled', () => { installEvt = null; Toast.show('Installed. Open it from your home screen.'); schedule(); });
const canInstall = () => !!installEvt;
async function installApp() {
  if (!installEvt) return;
  const e = installEvt; installEvt = null;
  try { e.prompt(); await e.userChoice; } catch (x) { /* ignore */ }
  schedule();
}
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function renderChrome() {
  const next = ui.theme === 'auto' ? 'light' : ui.theme === 'light' ? 'dark' : 'auto';
  const lab = { auto: 'Theme follows the device. Switch to light.', light: 'Light theme. Switch to dark.', dark: 'Dark theme. Switch to match the device.' }[ui.theme];
  mount($('#chrome'), h('header', { class: 'top' }, h('div', { class: 'top-in' },
    h('div', { class: 'brand' }, 'Daily Expense Ledger'),
    h('nav', { class: 'tabs', 'aria-label': 'Sections' }, PAGES.map((p) => h('button', { type: 'button', class: 'tab', 'aria-current': ui.page === p.id ? 'page' : null, onClick: () => go(p.id) }, icon(p.icon, 20), p.label))),
    h('div', { class: 'tools' }, syncChip(), h('button', { type: 'button', class: 'btn icon ghost', id: 'themeBtn', title: lab, 'aria-label': lab, onClick: () => setTheme(next) }, icon(ui.theme === 'auto' ? 'auto' : ui.theme === 'light' ? 'sun' : 'moon', 20))))),
  syncBanner());
}
const PAGE_FN = { start: pageStart, dashboard: pageDashboard, entry: pageEntry, records: pageRecords, budget: pageBudget, setup: pageSetup };
function render() {
  Tip.hide();
  renderChrome();
  const v = $('#view');
  mount(v, PAGE_FN[ui.page]());
  if (ui.page === 'records') paintRecords();
}
const isField = (a) => a && $('#view').contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
function refresh() {
  renderChrome();
  if (ui.page === 'entry') { repaintLive(); const dh = $('#demoHost'); if (dh) mount(dh, demoBanner()); return; }
  const a = document.activeElement;
  if (isField(a)) {
    // Repaint under the cursor so dependent figures stay current, then put the cursor back.
    if (!a.id) { ui.pending = true; return; }
    const keep = { id: a.id, value: a.value, y: window.scrollY, s: null, e: null };
    try { keep.s = a.selectionStart; keep.e = a.selectionEnd; } catch (x) { /* not a text field */ }
    render();
    const el = document.getElementById(keep.id);
    if (el && $('#view').contains(el)) {
      if (el.type !== 'checkbox' && el.type !== 'radio' && el.value !== keep.value) el.value = keep.value;
      try { el.focus({ preventScroll: true }); } catch (x) { /* ignore */ }
      if (keep.s !== null) { try { el.setSelectionRange(keep.s, keep.e); } catch (x) { /* ignore */ } }
      window.scrollTo(0, keep.y);
    }
    return;
  }
  render();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flushIfDirty(); });
window.addEventListener('pagehide', () => Store.flushIfDirty());
let raf = 0;
function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; refresh(); }); }
document.addEventListener('focusout', () => setTimeout(() => { if (ui.pending && !isField(document.activeElement)) { ui.pending = false; if (ui.page !== 'entry') render(); } }, 60));

function registerWorker() {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { /* offline use is optional */ });
}
async function boot() {
  initUi();
  if (ui.theme !== 'auto') { ui.themeTouched = true; applyTheme(); }
  Store.onError((m) => Toast.show(m, 'bad'));
  Store.subscribe(schedule);
  Sync.onChange = () => { renderChrome(); if (ui.page === 'setup') schedule(); };
  render();
  await Store.init();
  await Sync.start().catch((e) => Sync.fail(e));
  registerWorker();
}
boot();
