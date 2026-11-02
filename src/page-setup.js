'use strict';
/* Setup: tracking start, accounts, categories, targets, data tools, appearance. */
function updCfg(fn) { const cfg = JSON.parse(JSON.stringify(Store.derive().cfg)); fn(cfg); return Store.setCfg(cfg); }
function slug(s) { return 'x_' + s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10) + Store.uid().slice(-5); }
// drafts of the two "add" forms live outside the render so a repaint never wipes what was typed
const newAcct = { v: '', kind: 'bank', open: '' };
const newCat = { name: '', kind: 'expense', group: 'needs' };
function accountsCard(d) {
  const cfg = d.cfg;
  const used = new Set(); d.txns.forEach((t) => { used.add(t.acct); if (t.toAcct) used.add(t.toAcct); });
  const rows = cfg.accounts.map((a, i) => h('tr', null,
    h('td', { 'data-label': 'Name' }, h('input', { id: 'acc-name-' + a.id, class: 'in', value: a.name, 'aria-label': 'Account name', onChange: (e) => { const v = e.target.value.trim(); if (v) updCfg((c) => (c.accounts[i].name = v)); else render(); } })),
    h('td', { 'data-label': 'Type' }, select('acc-kind-' + a.id, Object.keys(Core.KIND_LABEL).map((k) => ({ value: k, label: Core.KIND_LABEL[k] })), a.kind, (v) => updCfg((c) => { const wasCard = c.accounts[i].kind === 'card'; c.accounts[i].kind = v; if (v === 'card' && !wasCard) c.accounts[i].opening = -Math.abs(c.accounts[i].opening); if (v !== 'card' && wasCard) c.accounts[i].opening = Math.abs(c.accounts[i].opening); }))),
    h('td', { 'data-label': a.kind === 'card' ? 'Amount owed at start (₹)' : 'Opening balance (₹)' }, h('input', { id: 'acc-open-' + a.id, class: 'in', inputmode: 'decimal', style: { textAlign: 'right' }, 'aria-label': 'Opening balance of ' + a.name, value: a.opening ? String(a.kind === 'card' ? Math.abs(a.opening) : a.opening) : '', placeholder: '0', onChange: (e) => { const raw = e.target.value.replace(/[₹,\s]/g, ''); const v = raw === '' ? 0 : Number(raw); if (!isFinite(v)) { Toast.show('Enter the balance as a number', 'bad'); return render(); } updCfg((c) => (c.accounts[i].opening = c.accounts[i].kind === 'card' ? -Math.abs(v) : v)); } })),
    h('td', { 'data-label': 'In use' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'acc-act-' + a.id, checked: a.active, onChange: (e) => updCfg((c) => (c.accounts[i].active = e.target.checked)) }), a.active ? 'Active' : 'Archived'))));
  const nm = newAcct;
  return h('section', { class: 'card', 'aria-label': 'Accounts' },
    h('header', null, h('div', null, h('h3', null, 'Accounts'), h('p', null, 'Opening balances are as of the start of the tracking date. Add each credit card as its own account and enter what you owed on that date. Archived accounts drop out of totals, so archive only a settled account.'))),
    h('div', { class: 'tw' }, h('table', { class: 'tbl stackable' }, h('thead', null, h('tr', null, ['Name', 'Type', 'Opening balance (₹)', 'In use'].map((x, i) => h('th', { class: i === 2 ? 'r' : '' }, x)))), h('tbody', null, rows))),
    h('form', { class: 'fgrid', style: { borderTop: '1px solid var(--line)', paddingTop: '14px' }, onSubmit: (e) => {
      e.preventDefault();
      if (!nm.v.trim()) { Toast.show('Give the account a name', 'bad'); return; }
      const raw = nm.open.replace(/[₹,\s]/g, ''); const ov = raw === '' ? 0 : Number(raw);
      if (!isFinite(ov)) { Toast.show('Enter the opening balance as a number', 'bad'); return; }
      if (!updCfg((c) => c.accounts.push({ id: slug(nm.v), name: nm.v.trim(), kind: nm.kind, opening: nm.kind === 'card' ? -Math.abs(ov) : ov, active: true }))) return;
      newAcct.v = ''; newAcct.open = ''; newAcct.kind = 'bank';
      Toast.show('Account added');
    } },
      field('New account name', h('input', { id: 'acc-new-name', class: 'in', placeholder: 'e.g. SBI Card', value: nm.v, onInput: (e) => (nm.v = e.target.value) }), 'c4'),
      field('Type', select('acc-new-kind', Object.keys(Core.KIND_LABEL).map((k) => ({ value: k, label: Core.KIND_LABEL[k] })), nm.kind, (v) => (nm.kind = v)), 'c3'),
      field('Opening balance or amount owed (₹)', h('input', { id: 'acc-new-open', class: 'in', inputmode: 'decimal', value: nm.open, onInput: (e) => (nm.open = e.target.value) }), 'c3'),
      h('div', { class: 'c2', style: { alignSelf: 'end' } }, h('button', { class: 'btn primary', type: 'submit', style: { width: '100%' } }, 'Add'))));
}
function categoriesCard(d) {
  const cfg = d.cfg;
  const kinds = [['expense', 'Expense categories'], ['transferout', 'Sent to others'], ['investment', 'Savings and investment'], ['income', 'Income sources']];
  const blocks = kinds.map(([k, label]) => {
    const list = cfg.cats.map((c, i) => ({ c, i })).filter((x) => x.c.kind === k);
    const groupOpts = k === 'expense' ? Core.GROUPS.slice(0, 2) : k === 'transferout' ? Core.GROUPS : null;
    return h('div', null, h('h4', { style: { margin: '6px 0' } }, label),
      h('div', { class: 'tw' }, h('table', { class: 'tbl stackable' }, h('thead', null, h('tr', null, ['Name', 'Counts as', 'In use'].map((x) => h('th', null, x)))),
        h('tbody', null, list.map(({ c, i }) => h('tr', null,
          h('td', { 'data-label': 'Name' }, h('input', { id: 'cat-name-' + c.id, class: 'in', value: c.name, 'aria-label': 'Category name', onChange: (e) => { const v = e.target.value.trim(); if (v) updCfg((x) => (x.cats[i].name = v)); else render(); } })),
          h('td', { 'data-label': 'Counts as' }, groupOpts ? select('cat-grp-' + c.id, groupOpts.map((g) => ({ value: g.id, label: g.label })), c.group, (v) => updCfg((x) => (x.cats[i].group = v))) : h('span', { class: 'muted' }, k === 'investment' ? 'Savings' : 'Income')),
          h('td', { 'data-label': 'In use' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'cat-act-' + c.id, checked: c.active, onChange: (e) => updCfg((x) => (x.cats[i].active = e.target.checked)) }), c.active ? 'Active' : 'Archived'))))))));
  });
  const nc = newCat;
  return h('section', { class: 'card', 'aria-label': 'Categories' },
    h('header', null, h('div', null, h('h3', null, 'Categories'), h('p', null, 'The starter list is yours to change. Renaming updates every past entry. Archive a category to hide it from the Add page while keeping its history.'))),
    blocks,
    h('form', { class: 'fgrid', style: { borderTop: '1px solid var(--line)', paddingTop: '14px' }, onSubmit: (e) => {
      e.preventDefault();
      if (!nc.name.trim()) { Toast.show('Give the category a name', 'bad'); return; }
      if (!updCfg((c) => c.cats.push({ id: slug(nc.name), name: nc.name.trim(), kind: nc.kind, group: nc.kind === 'investment' ? 'savings' : nc.kind === 'income' ? '' : nc.group, active: true }))) return;
      newCat.name = ''; newCat.kind = 'expense'; newCat.group = 'needs';
      Toast.show('Category added');
    } },
      field('New category', h('input', { id: 'cat-new-name', class: 'in', value: nc.name, onInput: (e) => (nc.name = e.target.value) }), 'c4'),
      field('Kind', select('cat-new-kind', kinds.map(([k, l]) => ({ value: k, label: l })), nc.kind, (v) => (nc.kind = v)), 'c3'),
      field('Counts as', select('cat-new-grp', Core.GROUPS.slice(0, 2).map((g) => ({ value: g.id, label: g.label })), nc.group, (v) => (nc.group = v)), 'c3'),
      h('div', { class: 'c2', style: { alignSelf: 'end' } }, h('button', { class: 'btn primary', type: 'submit', style: { width: '100%' } }, 'Add'))));
}

// ---------- sync, backup and install ----------
function syncCard() {
  const st = syncStatus();
  const on = Sync.enabled() && Sync.state !== 'off';
  const act = (fn) => async () => { try { await fn(); } catch (e) { if (!e || e.name !== 'AbortError') Toast.show((e && e.message) || 'That did not work', 'bad'); } schedule(); };
  return h('section', { class: 'card', 'aria-label': 'Sync between devices' },
    h('header', null, h('div', null, h('h3', null, 'Sync between devices'), h('p', null, 'Choose a folder that OneDrive (or another sync app) keeps on all your devices. The app saves into it and reads from it, and nothing else holds your data.'))),
    h('p', { class: 'small', role: 'status' }, h('span', { class: 'chip ' + st.cls }, h('i'), st.text), Sync.state === 'error' ? ' ' + Sync.msg : ''),
    Folder.supported()
      ? h('div', { class: 'row' }, on
        ? [h('button', { type: 'button', class: 'btn', onClick: act(() => Sync.push()) }, 'Save now'), h('button', { type: 'button', class: 'btn', onClick: act(() => Sync.pull()) }, 'Load latest'), h('button', { type: 'button', class: 'btn', onClick: act(() => Sync.connect()) }, 'Change folder'), h('button', { type: 'button', class: 'btn danger', onClick: act(async () => { Sync.stop(); Toast.show('Sync folder disconnected. Entries stay on this device.'); }) }, 'Disconnect')]
        : h('button', { type: 'button', class: 'btn primary', onClick: act(() => Sync.connect()) }, 'Choose sync folder'))
      : h('p', { class: 'small muted' }, 'This browser cannot open a folder. Use Chrome or Edge on a laptop, or Chrome on an Android phone, or move data with a backup file.'),
    h('p', { class: 'xs muted' }, 'It saves about 3 seconds after each change and keeps the last 3 sessions. Edits made on different devices merge entry by entry, and the newest edit wins. ', h('button', { type: 'button', class: 'btn ghost sm', style: { minHeight: 0, padding: 0, textDecoration: 'underline' }, onClick: () => go('start') }, 'How to set this up')));
}
function installRow() {
  if (isInstalled()) return h('p', { class: 'small muted' }, 'Installed on this device. It opens like an app and works without a connection.');
  return h('div', { class: 'stack', style: { gap: '8px' } },
    h('p', { class: 'small muted' }, canInstall() ? 'Install it to open from your home screen and use it without a connection.' : 'To open it like an app, use the browser menu and choose Install app or Add to Home screen.'),
    canInstall() ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onClick: installApp }, icon('download', 16), 'Install app')) : null);
}
async function downloadBackup() {
  const json = JSON.stringify(Store.backup());
  if (await saveFile('Expense_Ledger_Backup_' + today() + '.json', new Blob([json], { type: 'application/json' }))) Toast.show('Backup downloaded. Keep it somewhere safe.');
}
function pickBackup() {
  const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if (inp.parentNode) inp.parentNode.removeChild(inp);
    if (!f) return;
    try {
      const r = await Store.restore(JSON.parse(await f.text()));
      Toast.show(r.changed ? 'Backup merged: ' + r.added + ' new ' + (r.added === 1 ? 'entry' : 'entries') + ', ' + r.entries + ' in total.' : 'Everything in that backup was already here.');
    } catch (e) { Toast.show(e instanceof SyntaxError ? 'That file is not a backup from this app.' : (e && e.message) || 'The backup could not be read.', 'bad'); }
  });
  document.body.appendChild(inp);
  inp.click();
}
function pageSetup() {
  const d = Store.derive(), cfg = d.cfg;
  const tsum = (Number(cfg.targets.needs) || 0) + (Number(cfg.targets.wants) || 0) + (Number(cfg.targets.savings) || 0);
  const demoN = d.txns.filter((t) => t.demo).length;
  const tg = (k, label) => field(label, h('input', { id: 'tgt-' + k, class: 'in', inputmode: 'numeric', value: String(cfg.targets[k]), onChange: (e) => { const v = Number(e.target.value); if (!(v >= 0 && v <= 100)) { Toast.show('Enter a percentage between 0 and 100', 'bad'); return render(); } updCfg((c) => (c.targets[k] = v)); } }), 'c4');
  return h('div', { class: 'stack-lg' },
    pageHead('Setup', 'Done once, tweaked rarely. Everything here is stored with your ledger.'),
    demoBanner(),
    h('div', { class: 'cols' },
      h('section', { class: 'card', 'aria-label': 'Tracking basics' },
        h('header', null, h('div', null, h('h3', null, 'Tracking start and targets'), h('p', null, 'Balances are counted from the start date. Entries before it still appear in reports but do not move balances.'))),
        h('div', { class: 'fgrid' },
          field('Tracking starts on', h('input', { id: 'cfg-start', class: 'in', type: 'date', value: cfg.start, onChange: (e) => { if (Core.isDate(e.target.value)) updCfg((c) => (c.start = e.target.value)); else render(); } }), 'c12'),
          tg('needs', 'Needs target (%)'), tg('wants', 'Wants target (%)'), tg('savings', 'Savings target (%)')),
        tsum !== 100 ? h('p', { class: 'err-text', role: 'alert' }, 'Targets add up to ' + tsum + '%. They normally add up to 100%.') : h('p', { class: 'small muted' }, 'Targets add up to 100%.')),
      h('div', { class: 'stack' },
        syncCard(),
        h('section', { class: 'card', 'aria-label': 'Your data' },
          h('header', null, h('div', null, h('h3', null, 'Your data'), h('p', null, 'Entries are kept in this browser on this device. They are not sent to any server. Use a backup file to keep a copy or to move everything to another device.'))),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn', onClick: downloadBackup }, icon('download', 16), 'Download backup'),
            h('button', { type: 'button', class: 'btn', onClick: pickBackup }, icon('plus', 16), 'Restore from backup')),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn', onClick: () => exportRecords(d.txns, 'Expense_Ledger_All', 'xlsx') }, icon('download', 16), 'Export everything to Excel'),
            h('button', { type: 'button', class: 'btn', onClick: () => exportRecords(d.txns, 'Expense_Ledger_All', 'csv') }, icon('download', 16), 'CSV'),
            h('button', { type: 'button', class: 'btn', onClick: openImport }, icon('plus', 16), 'Import from Excel or CSV'),
            h('button', { type: 'button', class: 'btn ghost', onClick: () => downloadTemplate() }, 'Blank template')),
          h('p', { class: 'small muted' }, d.txns.length + ' entries stored across ' + new Set(d.txns.map((t) => t.date.slice(0, 7))).size + ' months. Restoring a backup adds what is missing and never removes anything.'),
          demoN ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onClick: async () => { try { const n = await Store.removeSample(); Toast.show('Removed ' + n + ' sample entries'); } catch (e) { /* surfaced */ } } }, 'Remove sample data (' + demoN + ')')) : h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onClick: async () => { try { const n = await Store.loadSample(); Toast.show('Loaded ' + n + ' sample entries'); } catch (e) { /* surfaced */ } } }, 'Load sample data'), h('span', { class: 'xs muted' }, 'Marked as sample and removable in one click.'))),
        h('section', { class: 'card', 'aria-label': 'This device' }, h('h3', null, 'This device'), installRow(), h('div', { class: 'stack', style: { gap: '8px' } }, h('span', { class: 'small muted' }, 'Appearance'), themeSeg()))),
    ),
    accountsCard(d), categoriesCard(d));
}
