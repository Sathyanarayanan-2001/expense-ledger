'use strict';
/* App shell state and shared components. */
const PAGES = [
  { id: 'start', label: 'Start', icon: 'home' },
  { id: 'dashboard', label: 'Dashboard', icon: 'dash' },
  { id: 'entry', label: 'Add', icon: 'add' },
  { id: 'records', label: 'Records', icon: 'list' },
  { id: 'budget', label: 'Budget', icon: 'target' },
  { id: 'setup', label: 'Setup', icon: 'gear' },
];
const ui = {
  page: 'start', fy: null, sel: null, theme: 'auto', pending: false,
  entry: null, rec: null, recon: { open: false, acct: '', asOf: '', bal: '', note: '', err: '' }, hold: { open: false, acct: '', asOf: '', bal: '', note: '', err: '' }, confirm: {}, loadingSample: false,
};
const INR = (x) => Core.fmtINR(x, { dec: 0 });
const INR2 = (x) => Core.fmtINR(x);
const today = () => Store.today();

function initUi() {
  const t = today();
  const cfgFy = Core.fyOf(t);
  ui.theme = Prefs.get('theme', 'auto');
  const savedPage = Prefs.get('page', null);
  const hash = (location.hash || '').replace('#', '');
  ui.page = PAGES.some((p) => p.id === hash) ? hash : PAGES.some((p) => p.id === savedPage) && Prefs.get('seen', false) ? savedPage : 'start';
  ui.fy = Prefs.get('fy', cfgFy);
  ui.sel = Prefs.get('sel', t.slice(0, 7));
  if (typeof ui.fy !== 'number') ui.fy = cfgFy;
  fixSel();
  const slot = Core.slotForHour(new Date().getHours());
  ui.entry = { date: t, slot, rows: [], calMonth: t.slice(0, 7), gapWin: 30, edit: null };
  ui.rec = { view: 'table', preset: 'period', from: '', to: '', acct: '', group: '', cat: '', type: '', mode: '', q: '', limit: 100 };
}
function fixSel() {
  if (ui.sel !== 'FY') {
    const months = Core.fyMonths(ui.fy);
    if (!months.includes(ui.sel)) ui.sel = months.find((m) => m.slice(5) === String(ui.sel).slice(5)) || months[0];
  }
}
const curPeriod = () => Core.makePeriod(ui.fy, ui.sel);
function setPeriod(fy, sel) { ui.fy = fy; ui.sel = sel; fixSel(); Prefs.set('fy', ui.fy); Prefs.set('sel', ui.sel); render(); }

const money = (x) => h('span', { class: 'num' }, INR2(x));
function fmtBal(acct, v) {
  if (v === null || v === undefined) return '–';
  if (acct && acct.kind === 'card') return v < 0 ? INR2(-v) + ' due' : v > 0 ? INR2(v) + ' credit' : INR2(0);
  return INR2(v);
}
function pill(tone, label) {
  return h('span', { class: 'pill ' + tone }, icon(tone === 'good' ? 'check' : tone === 'warn' ? 'alert' : tone === 'bad' ? 'x' : 'minus', 14), label);
}
function pageHead(title, sub) { return h('div', { class: 'page-head' }, h('h1', null, title), sub ? h('p', null, sub) : null); }
function emptyState(title, text, actions) {
  return h('div', { class: 'empty' }, h('h3', null, title), h('p', null, text), actions ? h('div', { class: 'row', style: { justifyContent: 'center' } }, actions) : null);
}
function field(label, control, cls, hint) {
  return h('label', { class: 'f ' + (cls || '') }, label, control, hint ? h('span', { class: 'xs muted', style: { fontWeight: 400 } }, hint) : null);
}
function select(id, options, value, onChange, extra) {
  const s = h('select', { id, class: 'in', onChange: (e) => onChange(e.target.value), ...(extra || {}) },
    options.map((o) => (o.group ? h('optgroup', { label: o.group }, o.items.map((i) => h('option', { value: i.value, selected: i.value === value }, i.label))) : h('option', { value: o.value, selected: o.value === value }, o.label))));
  s.value = value;
  return s;
}
function segmented(items, value, onPick, label, cls) {
  return h('div', { class: 'seg ' + (cls || ''), role: 'group', 'aria-label': label },
    items.map((i) => h('button', { type: 'button', 'aria-pressed': String(i.value === value), onClick: () => onPick(i.value) }, i.label)));
}
// two-step confirmation without browser dialogs
function confirmButton(key, label, confirmLabel, onConfirm, cls) {
  const armed = ui.confirm[key];
  return h('button', {
    type: 'button', class: 'btn ' + (cls || 'sm danger'), onClick: (e) => {
      const btn = e.currentTarget;
      if (ui.confirm[key]) { delete ui.confirm[key]; onConfirm(); return; }
      ui.confirm[key] = true;
      btn.textContent = confirmLabel;
      setTimeout(() => { delete ui.confirm[key]; if (btn.isConnected) btn.textContent = label; }, 3500);
    },
  }, armed ? confirmLabel : label);
}

// ---------- period bar (shared by Dashboard and Budget) ----------
function fyOptions() {
  const d = Store.derive();
  const t = today();
  let lo = Core.fyOf(d.cfg.start), hi = Core.fyOf(t) + 1;
  if (d.txns.length) { lo = Math.min(lo, Core.fyOf(d.txns[0].date)); hi = Math.max(hi, Core.fyOf(d.txns[d.txns.length - 1].date)); }
  const out = [];
  for (let f = lo; f <= hi; f++) out.push({ value: String(f), label: Core.fyLabel(f) });
  return out;
}
function periodBar(extra) {
  const p = curPeriod();
  const t = today();
  const months = Core.fyMonths(ui.fy);
  const opts = [{ value: 'FY', label: 'Full ' + Core.fyLabel(ui.fy) + ' (Apr to Mar)' }].concat(months.map((m) => ({ value: m, label: Core.monthLabel(m) + (m === t.slice(0, 7) ? ' (this month)' : '') })));
  const elapsed = Core.diffDays(p.from, Core.minD(p.to, Core.maxD(p.from, t))) + 1;
  const total = Core.diffDays(p.from, p.to) + 1;
  const note = p.to < t ? Core.dateLabel(p.from) + ' to ' + Core.dateLabel(p.to) : p.from > t ? 'Starts ' + Core.dateLabel(p.from) : Core.dateLabel(p.from) + ' to ' + Core.dateLabel(p.to) + ' · day ' + elapsed + ' of ' + total;
  return h('div', { class: 'pbar', role: 'group', 'aria-label': 'Choose period' },
    field('Financial year', select('pfy', fyOptions(), String(ui.fy), (v) => setPeriod(Number(v), ui.sel))),
    field('Period', select('pper', opts, ui.sel, (v) => setPeriod(ui.fy, v))),
    h('button', { type: 'button', class: 'btn', onClick: () => setPeriod(Core.fyOf(t), t.slice(0, 7)) }, 'This month'),
    extra || null,
    h('div', { class: 'note' }, h('strong', null, p.label), h('br'), note));
}

// ---------- modal ----------
let modalEl = null, modalReturn = null;
function openModal(content, label) {
  closeModal();
  modalReturn = document.activeElement;
  modalEl = h('div', { class: 'modal-bg', onMousedown: (e) => { if (e.target === modalEl) closeModal(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, content));
  document.body.appendChild(modalEl);
  const f = modalEl.querySelector('input,select,textarea,button');
  if (f) f.focus();
}
function closeModal() {
  if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
  modalEl = null;
  if (modalReturn && modalReturn.isConnected) { try { modalReturn.focus(); } catch (e) { /* ignore */ } }
  modalReturn = null;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalEl) closeModal(); });

// ---------- downloads and clipboard ----------
// Save a file by handing it to the browser as a normal download (works on laptops and in the phone app).
async function saveFile(filename, data) {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.appendChild(a); a.click();
    setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 4000);
    return true;
  } catch (e) { Toast.show('The file could not be saved: ' + ((e && e.message) || 'unavailable'), 'bad'); return false; }
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); Toast.show('Copied to clipboard'); return true; } catch (e) { return false; }
}
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function exportRecords(txns, name, fmt) {
  const cfg = Store.derive().cfg;
  if (!txns.length) { Toast.show('No entries match the filters, so there is nothing to export. Widen the date range, or use Setup to export everything.', 'bad'); return; }
  const stamp = today();
  try {
    if (fmt === 'csv') {
      const csv = Core.toCSV(Core.exportRows(cfg, txns));
      if (await saveFile(name + '_' + stamp + '.csv', csv)) { Toast.show('CSV file ready'); return; }
      if (!(await copyText(csv))) Toast.show('The file could not be saved on this device.', 'bad');
      return;
    }
    const bytes = XL.write(IO.exportWorkbook(cfg, txns, stamp));
    if (await saveFile(name + '_' + stamp + '.xlsx', new Blob([bytes], { type: XLSX_MIME }))) Toast.show('Excel file ready');
  } catch (e) { Toast.show((e && e.message) || 'Export failed', 'bad'); }
}
async function downloadTemplate() {
  try {
    const bytes = XL.write(IO.templateWorkbook(Store.derive().cfg));
    if (await saveFile('Expense_Ledger_Template.xlsx', new Blob([bytes], { type: XLSX_MIME }))) Toast.show('Template ready');
  } catch (e) { Toast.show((e && e.message) || 'Could not make the template', 'bad'); }
}
function monthsBetween(a, b) {
  const out = []; let m = a.slice(0, 7); const end = b.slice(0, 7);
  while (m <= end && out.length < 600) { out.push(m); m = Core.addMonths(m, 1); }
  return out;
}

function demoBanner() {
  const d = Store.derive();
  const n = d.txns.filter((t) => t.demo).length;
  if (!n) return null;
  return h('div', { class: 'banner', role: 'status' },
    h('span', null, 'Sample data is loaded (' + n + ' made-up entries). Remove it before you start logging real spending.'),
    h('button', { type: 'button', class: 'btn sm', onClick: async () => { try { const k = await Store.removeSample(); Toast.show('Removed ' + k + ' sample entries'); } catch (e) { /* surfaced */ } } }, 'Remove sample data'));
}
