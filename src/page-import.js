'use strict';
/* Import: bring records in from an Excel or CSV file. Nothing is saved until the preview is confirmed. */
const imp = {};
let impBody = null;
function impReset() {
  Object.assign(imp, {
    step: 'pick', name: '', sheets: [], sheet: 0, csv: false, date1904: false, parsed: null, res: null, rows: null, counts: null, err: '', busy: false, done: null,
    ctx: { defaultAcct: '', defaultSlot: 'morning', bankMap: {}, catMap: {} }, suggested: {}, opt: { update: true, importDups: false, markSlots: false }, filter: 'all', limit: 60,
  });
}
impReset();

function openImport() {
  impReset();
  impBody = h('div', { class: 'stack' });
  openModal(h('div', { class: 'stack' },
    h('div', { class: 'row-sb' }, h('h2', { style: { margin: 0, fontSize: '19px' } }, 'Import records'), h('button', { type: 'button', class: 'btn ghost sm icon', 'aria-label': 'Close', onClick: closeModal }, icon('x'))),
    impBody), 'Import records');
  const m = impBody.closest('.modal'); if (m) m.style.width = 'min(980px, 100%)';
  impPaint();
}

// ---------- reading the file ----------
async function impReadFile(file) {
  const name = file.name || 'file';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const buf = await file.arrayBuffer();
  if (['csv', 'txt', 'tsv'].includes(ext)) {
    const rows = IO.parseCSV(IO.decodeText(new Uint8Array(buf)));
    if (rows.unterminated) throw new Error('This CSV has a quotation mark that is never closed, so the rows after it cannot be read reliably. Open it in Excel, save it again as .xlsx or .csv, and try again.');
    return { csv: true, date1904: false, sheets: [{ name: 'CSV', rows }] };
  }
  if (['xlsx', 'xlsm'].includes(ext)) {
    try { const x = await XL.read(buf); return { csv: false, date1904: x.date1904, sheets: x.sheets }; } catch (e) { throw new Error('I could not open this Excel file. Open it in Excel, choose Save As, pick .xlsx or .csv, and try again.'); }
  }
  if (['xls', 'xlsb', 'ods'].includes(ext)) throw new Error('Older Excel formats (.' + ext + ') are not read. Open the file in Excel, choose Save As, pick .xlsx or .csv, and import that.');
  throw new Error('This file type is not supported. Choose an Excel (.xlsx) or CSV file.');
}
async function impPick(file) {
  if (!file) return;
  imp.err = ''; imp.busy = true; impPaint();
  try {
    const r = await impReadFile(file);
    imp.name = file.name; imp.csv = r.csv; imp.date1904 = r.date1904;
    imp.sheets = r.sheets.filter((s) => !s.hidden).map((s) => ({ name: s.name, rows: s.rows, t: IO.parseTable(s.rows, { csv: r.csv, date1904: r.date1904 }) }));
    const ok = imp.sheets.filter((s) => s.t.ok && s.t.drafts.length);
    if (!ok.length) {
      const withHeader = imp.sheets.some((s) => s.t.ok);
      imp.err = withHeader ? 'The file has the right columns but no rows to import yet.' : imp.sheets.length ? imp.sheets[0].t.error : 'The file is empty.';
      imp.sheets = [];
    } else {
      const rec = ok.find((s) => s.name === 'Records') || ok[0];
      imp.sheet = imp.sheets.indexOf(rec);
      impSelectSheet();
    }
  } catch (e) { imp.err = (e && e.message) || 'I could not read this file.'; }
  imp.busy = false; impPaint();
}
function impSelectSheet() {
  imp.parsed = imp.sheets[imp.sheet].t;
  imp.ctx = { defaultAcct: '', defaultSlot: 'morning', bankMap: {}, catMap: {} }; imp.suggested = {};
  imp.filter = 'all'; imp.limit = 60; imp.step = 'review';
  impRecompute();
}
function impRecompute() {
  const d = Store.derive();
  const run = () => IO.resolve(imp.parsed.drafts, d.cfg, { ...imp.ctx, autoCreate: true, provided: imp.parsed.provided, today: today(), start: d.cfg.start });
  imp.res = run();
  // a bank that nearly matches one of yours is preselected once; the choice stays visible and can be changed
  let again = false;
  imp.res.needs.banks.forEach((b) => { if (b.suggest && !imp.suggested[b.key]) { imp.suggested[b.key] = true; imp.ctx.bankMap[b.key] = b.suggest; again = true; } });
  if (again) imp.res = run();
  imp.rows = IO.plan(imp.res.entries, d.txns, {});
  imp.counts = IO.countBy(imp.rows);
}
function impSetOrder(v) {
  const sh = imp.sheets[imp.sheet];
  sh.t = IO.parseTable(sh.rows, { csv: imp.csv, date1904: imp.date1904, dateOrder: v });
  imp.parsed = sh.t; imp.limit = 60;
  impRecompute(); impPaint();
}

// ---------- screens ----------
function impPaint() {
  if (!impBody) return;
  const a = document.activeElement; const keep = a && impBody.contains(a) && a.id ? a.id : null;
  const y = impBody.closest('.modal-bg') ? impBody.closest('.modal-bg').scrollTop : 0;
  mount(impBody, imp.step === 'pick' ? impPick1() : imp.step === 'done' ? impDone() : impReview());
  const bg = impBody.closest('.modal-bg'); if (bg) bg.scrollTop = y;
  if (keep) { const el = document.getElementById(keep); if (el) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
}
function impPick1() {
  return h('div', { class: 'stack' },
    h('p', { class: 'muted', style: { margin: 0 } }, 'Add records from an Excel (.xlsx) or CSV file. It can be a file exported from this page, or your own sheet or a bank statement with columns such as Date, Description, Withdrawal amount and Deposit amount. You will see a preview first and nothing is saved until you confirm.'),
    h('div', { class: 'row' },
      h('input', { id: 'imp-file', class: 'in', type: 'file', accept: '.xlsx,.xlsm,.csv,.tsv,.txt', 'aria-label': 'Choose an Excel or CSV file', style: { maxWidth: '420px' }, disabled: imp.busy, onChange: (e) => impPick(e.target.files && e.target.files[0]) }),
      imp.busy ? h('span', { class: 'muted small', role: 'status' }, 'Reading the file…') : null),
    imp.err ? h('p', { class: 'err-text', role: 'alert' }, imp.err) : null,
    h('div', { class: 'banner info', style: { marginBottom: 0 } }, h('span', null, 'New to this? Download a blank Excel sheet with the right columns and drop-down lists, fill it in, and import it here.'),
      h('button', { type: 'button', class: 'btn sm', onClick: () => downloadTemplate() }, icon('download', 14), 'Blank template')),
    h('p', { class: 'xs muted', style: { margin: 0 } }, 'Tip: import the .xlsx you exported, not a CSV that was re-saved from Excel. Excel shortens long bank reference numbers in CSV files (for example 6.27E+11) and the original digits cannot be recovered.'));
}
function impCatSelect(c, d) {
  const mine = d.cfg.cats.filter((x) => x.kind === c.kind && x.active !== false);
  const opts = [{ value: 'new', label: 'Add "' + c.name + '" as a new category' }, { value: 'none', label: 'Leave these without a category' }]
    .concat(mine.length ? [{ group: 'Use an existing ' + C_KIND[c.kind] + ' category', items: mine.map((x) => ({ value: x.id, label: x.name })) }] : []);
  return select('imp-cat-' + c.key.replace(/[^a-z0-9]/gi, '_'), opts, imp.ctx.catMap[c.key] || c.choice || 'new', (v) => { imp.ctx.catMap[c.key] = v; impRecompute(); impPaint(); });
}
const C_KIND = { expense: 'expense', income: 'income', investment: 'savings', transferout: 'sent-to-others' };
function impStatus(r) {
  const l = (x) => (x.length > 34 ? x.slice(0, 32) + '…' : x);
  let p;
  if (r.status === 'new') p = pill('good', 'New');
  else if (r.status === 'update') p = pill('warn', l('Changed: ' + r.changes.map((k) => IO.FIELD_LABEL[k]).join(', ')));
  else if (r.status === 'same') p = pill('neutral', 'Already stored');
  else if (r.status === 'dup' || r.status === 'maybe') p = imp.opt.importDups ? pill('good', 'Added anyway') : pill('neutral', 'Probably stored');
  else { p = pill('bad', r.note || 'Problem'); p.style.whiteSpace = 'normal'; }
  p.title = r.status === 'update' ? 'Changed: ' + r.changes.map((k) => IO.FIELD_LABEL[k]).join(', ') : r.note || '';
  return p;
}
function impReview() {
  const d = Store.derive(), cfg = d.cfg, am = Core.acctMap(cfg), cm = Core.catMap(cfg);
  const t = imp.parsed, c = imp.counts, res = imp.res;
  const accts = cfg.accounts.filter((a) => a.active !== false && !Core.isHolding(a));
  const needsDefaultBank = !t.hasBankCol || t.drafts.some((x) => !x.bankRaw);
  const willAdd = c.new + (imp.opt.importDups ? c.dup + c.maybe : 0);
  const willChange = imp.opt.update ? c.update : 0;
  const total = willAdd + willChange;
  const lost = t.drafts.filter((x) => x.refLost).length;
  const newCatMap = {}; res.newCats.forEach((n) => (newCatMap[n.id] = n));
  const catLabel = (e) => (e.type === 'transfer' ? 'Transfer' + (e.toAcct ? ': ' + ((am[e.acct] || {}).name || '?') + ' → ' + ((am[e.toAcct] || {}).name || '?') : '') : e.cat ? (cm[e.cat] || newCatMap[e.cat] || { name: e.cat }).name + (newCatMap[e.cat] ? ' (new)' : '') : e.catRaw || '');
  const filters = [['all', 'All'], ['new', 'New'], ['update', 'Changed'], ['skip', 'Skipped'], ['error', 'Problems']];
  const pass = (r) => imp.filter === 'all' || (imp.filter === 'new' && r.status === 'new') || (imp.filter === 'update' && r.status === 'update') || (imp.filter === 'skip' && ['same', 'dup', 'maybe'].includes(r.status)) || (imp.filter === 'error' && r.status === 'error');
  const list = imp.rows.filter(pass);
  const shown = list.slice(0, imp.limit);
  const moneyCell = (e) => (e.amt ? (e.type === 'income' ? '+' : e.type === 'transfer' ? '' : '−') + INR2(e.amt) : '');
  const joined = res.entries.filter((e) => e.merged).length;
  const sheetCands = imp.sheets.filter((s) => s.t.ok && s.t.drafts.length);
  return h('div', { class: 'stack' },
    h('div', { class: 'row-sb' },
      h('div', null, h('strong', null, imp.name), h('div', { class: 'xs muted' }, t.drafts.length + ' rows read' + (t.ignored ? ' · ' + t.ignored + ' without a date or amount left out' : '') + (joined ? ' · ' + joined + ' transfer' + (joined > 1 ? 's' : '') + ' joined from two rows each' : ''))),
      h('div', { class: 'row' },
        sheetCands.length > 1 ? select('imp-sheet', sheetCands.map((s) => ({ value: String(imp.sheets.indexOf(s)), label: 'Sheet: ' + s.name })), String(imp.sheet), (v) => { imp.sheet = Number(v); impSelectSheet(); impPaint(); }) : null,
        h('button', { type: 'button', class: 'btn sm', onClick: () => { impReset(); impPaint(); } }, 'Choose another file'))),
    t.dateAmbiguous ? h('div', { class: 'fgrid' }, field('Dates in this file are written as', select('imp-order', [{ value: 'dmy', label: 'Day-month-year, like 31-12-2026' }, { value: 'mdy', label: 'Month-day-year, like 12-31-2026' }], t.dateOrder, impSetOrder), 'c6', 'Many dates here could be read either way. Check the Date column in the preview.')) : null,
    h('p', { class: 'xs muted', style: { margin: 0 } }, 'Columns read: ' + t.columnsRead.join(', ') + (!('wd' in t.fields) && !('amount' in t.fields) ? '. There is no Withdrawal column, so rows that spend money will show as problems' : !('dep' in t.fields) && !('amount' in t.fields) ? '. There is no Deposit column, so money received will show as problems' : '') + '.'),
    t.unknownHeaders.length ? h('p', { class: 'xs muted', style: { margin: 0 } }, 'Columns not used: ' + t.unknownHeaders.slice(0, 8).join(', ') + (t.unknownHeaders.length > 8 ? '…' : '')) : null,
    lost ? h('div', { class: 'banner', role: 'status' }, h('span', null, lost + ' bank reference number' + (lost > 1 ? 's were' : ' was') + ' already shortened by Excel in this file (like 6.27E+11) and cannot be recovered. Entries that match a stored one keep the stored reference. Import the .xlsx export to bring references in intact.')) : null,
    // choices the file cannot answer by itself
    (needsDefaultBank || !t.provided.slot) ? h('div', { class: 'fgrid' },
      needsDefaultBank ? field(t.hasBankCol ? 'Bank for rows that have none' : 'Bank for every row', select('imp-defbank', [{ value: '', label: 'Choose a bank…' }].concat(accts.map((a) => ({ value: a.id, label: a.name }))), imp.ctx.defaultAcct, (v) => { imp.ctx.defaultAcct = v; impRecompute(); impPaint(); }), 'c6', t.hasBankCol ? '' : 'The file has no Bank column.') : null,
      !t.provided.slot ? field('Time of day for new entries', select('imp-defslot', Core.SLOTS.map((s) => ({ value: s.id, label: s.label + ' (' + s.hint + ')' })), imp.ctx.defaultSlot, (v) => { imp.ctx.defaultSlot = v; impRecompute(); impPaint(); }), 'c6', 'The file has no Slot column.') : null) : null,
    res.needs.banks.length ? h('div', { class: 'stack', style: { gap: '8px' } }, h('strong', { class: 'small' }, 'Banks that do not match one of yours exactly'),
      res.needs.banks.map((b) => h('div', { class: 'fgrid' },
        field('“' + b.name + '” · ' + b.count + ' row' + (b.count > 1 ? 's' : '') + ' · which bank is this?', select('imp-bank-' + b.key.replace(/[^a-z0-9]/gi, '_'), [{ value: '', label: 'Choose a bank…' }].concat(accts.map((a) => ({ value: a.id, label: a.name })), [{ value: 'skip', label: 'Leave these rows out' }]), imp.ctx.bankMap[b.key] || '', (v) => { if (v) imp.ctx.bankMap[b.key] = v; else delete imp.ctx.bankMap[b.key]; impRecompute(); impPaint(); }), 'c8')))) : null,
    res.needs.cats.length ? h('div', { class: 'stack', style: { gap: '8px' } }, h('strong', { class: 'small' }, 'Categories that are not in your ledger'),
      res.needs.cats.map((x) => h('div', { class: 'fgrid' }, field('“' + x.name + '” (' + C_KIND[x.kind] + ') · ' + x.count + ' row' + (x.count > 1 ? 's' : ''), impCatSelect(x, d), 'c8')))) : null,
    // what will happen
    h('div', { class: 'row', role: 'status', 'aria-live': 'polite' },
      pill('good', c.new + ' new'), c.update ? pill('warn', c.update + ' changed') : null, c.same ? pill('neutral', c.same + ' already stored') : null,
      c.dup + c.maybe ? pill('neutral', c.dup + c.maybe + ' look like stored entries') : null, c.error ? pill('bad', c.error + ' with problems') : null),
    h('div', { class: 'stack', style: { gap: '8px' } },
      c.update ? h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'imp-opt-update', checked: imp.opt.update, onChange: (e) => { imp.opt.update = e.target.checked; impPaint(); } }), 'Update the ' + c.update + ' stored entries whose Entry ID is in the file') : null,
      c.dup + c.maybe ? h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'imp-opt-dups', checked: imp.opt.importDups, onChange: (e) => { imp.opt.importDups = e.target.checked; impPaint(); } }), 'Add the ' + (c.dup + c.maybe) + ' rows that look like stored entries anyway') : null,
      h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'imp-opt-marks', checked: imp.opt.markSlots, onChange: (e) => { imp.opt.markSlots = e.target.checked; impPaint(); } }), 'Mark empty time slots on the imported days as “nothing spent”')),
    h('div', { class: 'row' }, segmented(filters.map((f) => ({ value: f[0], label: f[1] })), imp.filter, (v) => { imp.filter = v; imp.limit = 60; impPaint(); }, 'Show rows', 'scroll sm'), h('span', { class: 'xs muted' }, list.length + ' of ' + imp.rows.length + ' entries')),
    h('div', { class: 'tw', style: { maxHeight: '340px', overflowY: 'auto' } }, h('table', { class: 'tbl dense', 'aria-label': 'Preview of the import' },
      h('thead', null, h('tr', null, ['Row', 'Date', 'Bank', 'Description', 'Category', 'Amount', 'Result'].map((x) => h('th', { class: x === 'Amount' ? 'r' : '' }, x)))),
      h('tbody', null, shown.map((r) => { const e = r.entry; return h('tr', null,
        h('td', { class: 'xs muted' }, e.lines.join('+')), h('td', null, e.date ? Core.dmy(e.date) : ''), h('td', null, (am[e.acct] || {}).name || e.bankRaw || ''),
        h('td', { class: 'clip', style: { maxWidth: '170px' }, title: e.desc }, e.desc), h('td', { class: 'clip', style: { maxWidth: '190px' }, title: catLabel(e) }, catLabel(e)), h('td', { class: 'r' }, moneyCell(e)), h('td', { style: { whiteSpace: 'normal', minWidth: '190px' } }, impStatus(r))); })))),
    list.length > shown.length ? h('div', null, h('button', { type: 'button', class: 'btn sm', onClick: () => { imp.limit += 100; impPaint(); } }, 'Show 100 more (' + (list.length - shown.length) + ' left)')) : null,
    imp.err ? h('p', { class: 'err-text', role: 'alert' }, imp.err) : null,
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      h('button', { type: 'button', class: 'btn', onClick: closeModal }, 'Cancel'),
      h('button', { type: 'button', id: 'imp-go', class: 'btn primary', disabled: imp.busy || total === 0, onClick: impRun }, imp.busy ? 'Saving…' : total === 0 ? 'Nothing to import' : 'Import ' + total + ' entr' + (total === 1 ? 'y' : 'ies'))));
}
function impDone() {
  const r = imp.done;
  return h('div', { class: 'stack' },
    h('div', { class: 'row' }, pill('good', 'Import finished')),
    h('p', { style: { margin: 0 }, role: 'status' }, [r.added ? r.added + ' added' : '', r.updated ? r.updated + ' changed' : ''].filter(Boolean).join(', ') + '.'
      + (r.cats ? ' ' + r.cats + ' new categor' + (r.cats === 1 ? 'y' : 'ies') + ' created.' : '') + (r.marked ? ' ' + r.marked + ' empty slots marked as nothing spent.' : '')),
    r.skipped ? h('p', { class: 'small muted', style: { margin: 0 } }, r.skipped + ' rows were left out (already stored, possible duplicates or problems).') : null,
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
      ui.page !== 'records' ? h('button', { type: 'button', class: 'btn', onClick: () => { closeModal(); go('records'); } }, 'See in Records') : null,
      h('button', { type: 'button', class: 'btn primary', onClick: closeModal }, 'Done')));
}

// ---------- saving ----------
async function impMarkSlots(list) {
  const d = Store.derive();
  const dates = list.map((t) => t.date).sort();
  const from = Core.maxD(dates[0], d.cfg.start), to = Core.minD(dates[dates.length - 1], today());
  const ids = new Set(list.map((t) => t.id));
  const cov = Core.coverageMap(d.txns.filter((t) => !ids.has(t.id)).concat(list), d.marks);
  const map = {};
  for (let day = from; day <= to; day = Core.addDays(day, 1)) Core.missingSlots(cov, day).forEach((s) => { map[day + '|' + s] = true; });
  const n = Object.keys(map).length;
  if (n) await Store.setMarks(map);
  return n;
}
async function impRun() {
  if (imp.busy) return;
  imp.busy = true; imp.err = ''; impPaint();
  try {
    const list = IO.commit(imp.rows, { update: imp.opt.update, importDups: imp.opt.importDups, newId: Store.uid, now: Date.now() });
    if (!list.length) throw new Error('There is nothing to import.');
    const used = new Set(list.map((t) => t.cat));
    const have = new Set(Store.derive().cfg.cats.map((c) => c.id));
    const add = imp.res.newCats.filter((n) => used.has(n.id) && !have.has(n.id));
    if (add.length) {
      if (updCfg((cfg) => { add.forEach((n) => cfg.cats.push({ id: n.id, name: n.name, kind: n.kind, group: n.group, active: true })); }) === false) throw new Error('Your settings are still loading. Try again in a moment.');
      await Store.flushCfg();
    }
    await Store.putTxns(list);
    const marked = imp.opt.markSlots ? await impMarkSlots(list) : 0;
    const isUpd = (r) => r.status === 'update' && imp.opt.update;
    imp.done = { added: list.length - imp.rows.filter(isUpd).length, updated: imp.rows.filter(isUpd).length, cats: add.length, marked, skipped: imp.rows.length - list.length };
    imp.step = 'done';
  } catch (e) {
    imp.err = (e && e.message) || 'The import did not finish. Check Records to see what was saved, then try again.';
    try { impRecompute(); } catch (x) { /* keep the screen as it is */ }
  }
  imp.busy = false; impPaint();
}
