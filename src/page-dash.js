'use strict';
/* Start page and Dashboard. */
function go(page, opts) {
  ui.page = page; Prefs.set('page', page); Prefs.set('seen', true);
  if (opts && opts.date) { ui.entry.date = opts.date; ui.entry.calMonth = opts.date.slice(0, 7); }
  render();
  window.scrollTo(0, 0);
  const m = $('main'); if (m) m.focus({ preventScroll: true });
}

function checklist() {
  const d = Store.derive();
  const hasOpening = d.cfg.accounts.some((a) => Number(a.opening) !== 0);
  const real = d.txns.filter((t) => !t.demo);
  const items = [
    { done: hasOpening, text: 'Enter opening balances for your accounts', page: 'setup' },
    { done: Store.state.cfgSaved, text: 'Confirm the tracking start date and accounts', page: 'setup' },
    { done: real.length > 0, text: 'Log your first real entry', page: 'entry' },
    { done: d.recon.some((r) => !r.demo), text: 'Record one bank balance to reconcile against', page: 'dashboard' },
    { done: Object.keys(d.cfg.budgets).length > 0, text: 'Set a monthly budget for a few categories', page: 'budget' },
    { done: Sync.enabled() && Sync.state !== 'off', text: 'Choose a sync folder to share entries between your devices', page: 'setup' },
  ];
  return h('ul', { class: 'check-list' }, items.map((i) => h('li', { class: i.done ? 'done' : '' },
    h('span', { class: 'ic' }, i.done ? icon('check', 12) : null),
    i.done ? h('span', null, i.text) : h('button', { type: 'button', class: 'btn ghost sm', style: { justifyContent: 'flex-start', padding: 0, minHeight: 0, textAlign: 'left', whiteSpace: 'normal' }, onClick: () => go(i.page) }, i.text))));
}

// The one-time setup for each device: install, then either restore a backup or share a sync folder.
function deviceSetupCard() {
  const code = (t) => h('code', null, t);
  const list = (items) => h('ol', { class: 'steps-list' }, items.map((x) => h('li', null, x)));
  // open on a device that is not set up yet, folded away once it is
  const open = ui.deviceOpen === undefined ? !Sync.enabled() && !isInstalled() : ui.deviceOpen;
  return h('details', { class: 'card fold', open, onToggle: (e) => { ui.deviceOpen = e.target.open; } },
    h('summary', null, h('div', null, h('h3', null, 'Set up each device, once'), h('p', { class: 'small muted' }, 'Install it, then share your entries between laptops and your phone. ' + (isInstalled() ? 'This device already has the app installed.' : '')))),
    h('h4', { style: { margin: '2px 0' } }, 'Laptops (Windows, Chrome or Edge)'),
    list([
      'Open the page in Chrome or Edge. In the address bar choose the install icon, or the browser menu and Install Daily Expense Ledger.',
      ['Check the OneDrive desktop app is running and create a folder such as ', code('OneDrive\\Expense ledger'), '.'],
      ['Open ', h('button', { type: 'button', class: 'link', onClick: () => go('setup') }, 'Setup'), ', choose Choose sync folder, and pick that folder. Choose Allow on every visit if the browser offers it.'],
      'Use the same folder on every laptop. On a work laptop, IT policy may stop a personal OneDrive from syncing.',
    ]),
    h('h4', { style: { margin: '10px 0 2px' } }, 'Android phone (Chrome)'),
    list([
      ['Install a OneDrive sync app, such as OneSync, and set two-way sync between the ', code('Expense ledger'), ' OneDrive folder and a folder on the phone. The OneDrive app alone does not keep a folder on the phone.'],
      'Open the page in Chrome, then use the menu and Install app (or Add to Home screen). An installed app keeps its folder permission.',
      'Open it from the home screen, go to Setup, choose Choose sync folder, and pick the phone folder. Folder access needs Chrome 132 or later.',
    ]),
    h('h4', { style: { margin: '10px 0 2px' } }, 'Moving an existing ledger across'),
    list([
      ['On the first device, open Setup and choose Restore from backup, then pick your ', code('Expense_Ledger_Backup'), ' file. Check the numbers on the Dashboard.'],
      'Then choose the sync folder on that device. Everything is copied into the folder, and your other devices pick it up when they connect.',
    ]),
    h('p', { class: 'small muted' }, 'Test it: add one entry on the phone, give the sync app a minute, then open the page on a laptop. Browsers that cannot open a folder (Firefox, Safari, iPhone) still work: move data with a backup file from Setup.'),
    canInstall() ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onClick: installApp }, icon('download', 16), 'Install on this device')) : null);
}

function pageStart() {
  const d = Store.derive();
  const startLabel = Core.dateLabel(d.cfg.start);
  const step = (n, title, text, acts) => h('div', { class: 'step' }, h('div', { class: 'n' }, String(n)), h('div', null, h('h3', null, title), h('p', null, text), acts ? h('div', { class: 'acts' }, acts) : null));
  const defs = [
    ['Income', 'Money received, from entries of type Income.'],
    ['Expense', 'Everything spent on Expense entries, card swipes included.'],
    ['Savings rate', 'Share of income left after Needs and Wants. It is the Savings line of the 50/30/20 check.'],
    ['Closing balance', 'All active accounts at the period end. Credit cards count as dues, so a swipe lowers it at once.'],
    ['Savings and investments', 'Money you moved into SIPs, FDs, PPF and similar. It leaves your bank balance but is not spending.'],
    ['Transfers out', 'Money sent to other people. You choose Needs, Wants or Savings for each, and it counts there. Moves between your own accounts are left out of every total.'],
    ['Average daily', 'Expense divided by the days tracked in the period so far.'],
    ['Reconciled', 'The tracker balance is within ₹0.50 of the balance your bank shows for the same date.'],
  ];
  return h('div', null,
    pageHead('Daily Expense Ledger', 'Four slots a day, any order, any day. Log what happened, catch up on what you missed, and read the month at a glance.'),
    demoBanner(),
    h('div', { style: { marginTop: '16px' } }, deviceSetupCard()),
    h('div', { class: 'guide', style: { marginTop: '16px' } },
      h('div', { class: 'steps' },
        step(1, 'Set the ground once', 'Open Setup and enter the opening balance of each account as it stood on the tracking start date (' + startLabel + '). Add a credit card as its own account so swipes and bill payments stay honest.', [h('button', { type: 'button', class: 'btn', onClick: () => go('setup') }, 'Open Setup')]),
        step(2, 'Log in thirty seconds', 'On Add, choose the day and slot (Morning, Afternoon, Evening, Night), then type rows. Entering at night? Log all four slots in one go: every row carries its own slot. Amounts accept sums like 120+80.', [h('button', { type: 'button', class: 'btn primary', onClick: () => go('entry') }, 'Add entries')]),
        step(3, 'Missed a day, a week, a year', 'Change the date and carry on. The calendar shows which slots each day has, and Catch up lists every day with a gap. A slot with no spending takes one tap on No spend, so a gap always means forgotten, never zero.'),
        step(4, 'Read the dashboard', 'Pick a financial year and either the full year or one month. Everything below it follows that choice: seven headline figures, the 50/30/20 check, bank reconciliation, top categories and two charts.', [h('button', { type: 'button', class: 'btn', onClick: () => go('dashboard') }, 'Open Dashboard')]),
        step(5, 'Reconcile with the bank', 'Whenever you look at a bank app or passbook, record the balance and its date. The tracker computes its own balance for that date and tells you if they match. A mismatch means a missing, duplicated or wrong entry.'),
        step(6, 'Stay on plan', 'Set monthly budgets on the Budget tab. It shows spending against each limit, where this month is heading, and what you can still spend per day.', [h('button', { type: 'button', class: 'btn', onClick: () => go('budget') }, 'Open Budget')]),
        step(7, 'Bring in and take out records', 'On Records, Export gives you Excel or CSV of what you are looking at, and Import reads an Excel or CSV file (including your own bank statements) after showing a preview. Download a backup from Setup now and then.', [h('button', { type: 'button', class: 'btn', onClick: () => go('records') }, 'Open Records')]),
      ),
      h('div', { class: 'stack' },
        h('section', { class: 'card' }, h('h3', null, 'Quick start'), checklist()),
        h('section', { class: 'card' },
          h('h3', null, 'See it filled in'),
          h('p', { class: 'small muted' }, d.txns.length ? 'You already have entries. Sample data can be added or removed from Setup.' : 'Load a month of clearly marked sample entries to explore every screen. One tap removes them again.'),
          d.txns.length ? null : h('button', { type: 'button', class: 'btn', disabled: ui.loadingSample, onClick: async () => { ui.loadingSample = true; render(); try { const n = await Store.loadSample(); Toast.show('Loaded ' + n + ' sample entries'); go('dashboard'); } catch (e) { /* surfaced */ } ui.loadingSample = false; } }, 'Load sample data')),
        h('section', { class: 'card' }, h('h3', null, 'How the numbers work'), h('dl', { class: 'defs' }, defs.map((x) => [h('dt', null, x[0]), h('dd', null, x[1])]))),
        h('section', { class: 'card', 'aria-label': 'If something looks wrong' }, h('h3', null, 'If something looks wrong'), h('dl', { class: 'defs' }, [
          ['An entry is missing on another device', 'Check the sync app has run, then reopen the page. Save files can arrive late, and they merge when they do.'],
          ['Asked to allow folder access', 'Choose Allow. Browsers sometimes ask again after a restart.'],
          ['A new browser, or its data was cleared', 'Choose the sync folder again and the latest save loads, or restore a backup from Setup.'],
          ['Before a big change', 'Download a backup from Setup. The folder keeps only the last 3 sessions.'],
        ].map((x) => [h('dt', null, x[0]), h('dd', null, x[1])]))),
      )));
}

// ---------- Dashboard ----------
function deltaLine(cur, prev, label) {
  if (!prev || !(prev > 0)) return null;
  const ch = (cur - prev) / prev;
  return (ch >= 0 ? '↑ ' : '↓ ') + Math.abs(Math.round(ch * 100)) + '% vs ' + label;
}
function prevPeriodOf(p) {
  return p.kind === 'month' ? Core.makePeriod(Core.fyOf(Core.monthStart(Core.addMonths(p.ym, -1))), Core.addMonths(p.ym, -1)) : Core.makePeriod(p.fy - 1, 'FY');
}
function dashCalc() {
  const d = Store.derive(), t = today(), period = curPeriod();
  const sum = Core.summarize(d.txns, period.from, period.to);
  const pp = prevPeriodOf(period);
  const psum = Core.summarize(d.txns, pp.from, pp.to);
  return {
    d, t, period, sum, psum, pp, days: Core.elapsedDays(period, t, d.cfg, d.txns), clos: Core.closing(d.cfg, d.legs, period, t),
    ft: Core.fiftyThirtyTwenty(sum, d.cfg.targets), rec: Core.reconcile(d.cfg, d.legs, d.recon, period, t), top: Core.topCategories(sum, d.cfg, 8),
  };
}
function kpi(label, value, sub, extra, color) {
  return h('div', { class: 'kpi' }, h('div', { class: 'lab' }, color ? h('span', { class: 'dot', style: { background: color } }) : null, label), h('div', { class: 'val num' }, value), sub ? h('div', { class: 'sub' }, sub) : null, extra || null);
}
function attention(c) {
  const t = c.t, d = c.d;
  const items = [];
  const from = Core.maxD(d.cfg.start, Core.addDays(t, -7));
  const g = Core.gaps(d.cov, from, Core.addDays(t, -1));
  if (g.length) items.push({ text: g.length + (g.length > 1 ? ' days' : ' day') + ' in the last week with unlogged slots', run: () => go('entry', { date: g[g.length - 1].date }) });
  const noBal = c.rec.filter((r) => r.status === 'none').length;
  const mism = c.rec.filter((r) => r.status === 'mismatch').length;
  if (mism) items.push({ text: mism + (mism > 1 ? ' accounts do' : ' account does') + ' not match the bank', run: () => { const e = document.getElementById('recon'); if (e) e.scrollIntoView({ behavior: 'smooth' }); } });
  else if (noBal) items.push({ text: noBal + (noBal > 1 ? ' accounts have' : ' account has') + ' no bank balance recorded', run: () => { ui.recon.open = true; render(); const e = document.getElementById('recon'); if (e) e.scrollIntoView(); } });
  const over = Core.budgetRows(d.cfg, c.sum, c.period, t, Core.firstTracked(d.cfg, d.txns)).filter((r) => r.status.id === 'over').length;
  if (over) items.push({ text: over + (over > 1 ? ' categories are' : ' category is') + ' over budget', run: () => go('budget') });
  if (!items.length) return null;
  return h('div', { class: 'attn', role: 'list', 'aria-label': 'Needs attention' }, items.map((i) => h('button', { type: 'button', role: 'listitem', onClick: i.run }, icon('alert', 14), i.text)));
}
function reconForm(c) {
  const d = c.d, r = ui.recon;
  const accts = d.cfg.accounts.filter((a) => a.active);
  if (!r.acct || !accts.some((a) => a.id === r.acct)) r.acct = accts.length ? accts[0].id : '';
  if (!r.asOf) r.asOf = Core.minD(c.t, c.period.to);
  const acct = accts.find((a) => a.id === r.acct);
  const tracker = acct && Core.isDate(r.asOf) ? Core.balanceAt(d.cfg, d.legs, acct.id, r.asOf) : null;
  const err = h('p', { class: 'err-text', role: 'alert' }, r.err || '');
  const hint = h('span', { class: 'xs muted', style: { fontWeight: 400 } }, tracker === null ? 'Tracker has no balance for a date before the tracking start.' : 'The tracker shows ' + fmtBal(acct, tracker) + ' on this date.');
  return h('form', { class: 'stack', style: { borderTop: '1px solid var(--line)', paddingTop: '14px' }, onSubmit: async (e) => {
    e.preventDefault();
    const v = Number(String(r.bal).replace(/[₹,\s]/g, ''));
    if (!acct) { r.err = 'Add an account in Setup first.'; return render(); }
    if (!Core.isDate(r.asOf) || r.asOf > c.t) { r.err = 'Choose a valid date that is not in the future.'; return render(); }
    if (r.bal === '' || !isFinite(v)) { r.err = 'Enter the balance shown by the bank.'; return render(); }
    const bal = acct.kind === 'card' ? -Math.abs(v) : v;
    r.err = '';
    try { await Store.putRecon({ id: Store.uid(), acct: acct.id, asOf: r.asOf, bal, note: r.note }); r.bal = ''; r.note = ''; Toast.show('Balance recorded for ' + acct.name); } catch (x) { /* surfaced */ }
  } },
    h('div', { class: 'fgrid' },
      field('Account', select('rc-acct', accts.map((a) => ({ value: a.id, label: a.name })), r.acct, (v) => { r.acct = v; render(); }), 'c3'),
      field('As of date', h('input', { id: 'rc-date', class: 'in', type: 'date', max: c.t, value: r.asOf, onChange: (e) => { r.asOf = e.target.value; render(); } }), 'c3'),
      field(acct && acct.kind === 'card' ? 'Amount due per bank (₹)' : 'Balance per bank (₹)', h('input', { id: 'rc-bal', class: 'in', inputmode: 'decimal', autocomplete: 'off', value: r.bal, placeholder: '0.00', onInput: (e) => (r.bal = e.target.value) }), 'c3'),
      field('Note (optional)', h('input', { id: 'rc-note', class: 'in', value: r.note, onInput: (e) => (r.note = e.target.value) }), 'c3')),
    hint, err,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Record balance'), h('button', { class: 'btn', type: 'button', onClick: () => { r.open = false; r.err = ''; render(); } }, 'Close')));
}
function reconCard(c) {
  const d = c.d, am = Core.acctMap(d.cfg);
  const rows = c.rec;
  const stat = (r) => (r.status === 'reconciled' ? pill('good', 'Reconciled') : r.status === 'mismatch' ? pill('bad', 'Mismatch') : r.status === 'before' ? pill('neutral', 'Before start date') : pill('neutral', 'No balance recorded'));
  const table = h('table', { class: 'tbl stackable' },
    h('thead', null, h('tr', null, ['Bank', 'As of date', 'Per bank balance', 'Per tracker', 'Difference', 'Status', ''].map((x, i) => h('th', { class: i > 1 && i < 5 ? 'r' : '' }, x)))),
    h('tbody', null, rows.map((r) => h('tr', null,
      h('td', { 'data-label': 'Bank' }, h('strong', null, r.acct.name)),
      h('td', { 'data-label': 'As of date' }, r.asOf ? Core.dateLabel(r.asOf) : '–'),
      h('td', { class: 'r', 'data-label': 'Per bank balance' }, r.bank === undefined ? '–' : fmtBal(r.acct, r.bank)),
      h('td', { class: 'r', 'data-label': 'Per tracker' }, r.tracker === undefined || r.tracker === null ? '–' : fmtBal(r.acct, r.tracker)),
      h('td', { class: 'r', 'data-label': 'Difference' }, r.diff === undefined || r.diff === null ? '–' : Core.fmtINR(r.diff, { sign: true })),
      h('td', { 'data-label': 'Status' }, stat(r)),
      h('td', { class: 'noLabel' }, h('button', { type: 'button', class: 'btn sm', onClick: () => { ui.recon.open = true; ui.recon.acct = r.acct.id; ui.recon.asOf = ''; render(); const e = document.getElementById('rc-bal'); if (e) e.focus(); } }, r.status === 'none' ? 'Add balance' : 'Update'))))));
  const hist = d.recon.slice().sort((a, b) => (a.asOf < b.asOf ? 1 : -1)).slice(0, 8);
  return h('section', { class: 'card', id: 'recon', 'aria-label': 'Balance reconciliation' },
    h('header', null, h('div', null, h('h3', null, 'Balance reconciliation'), h('p', null, 'Latest bank balance on or before ' + Core.dateLabel(Core.minD(c.period.to, c.t)) + ', compared with what the tracker computes for the same date.')),
      h('button', { type: 'button', class: 'btn', 'aria-expanded': String(ui.recon.open), onClick: () => { ui.recon.open = !ui.recon.open; render(); } }, ui.recon.open ? 'Hide form' : 'Record bank balance')),
    rows.length ? h('div', { class: 'tw' }, table) : emptyState('No active accounts', 'Add accounts in Setup to reconcile them.'),
    ui.recon.open ? reconForm(c) : null,
    hist.length && ui.recon.open ? h('div', null, h('h4', { class: 'small', style: { marginBottom: '6px' } }, 'Recently recorded'),
      hist.map((r) => h('div', { class: 'dayrow' }, h('span', { class: 'small' }, (am[r.acct] || { name: r.acct }).name + ' · ' + Core.dateLabel(r.asOf) + ' · ' + fmtBal(am[r.acct], r.bal) + (r.demo ? ' (sample)' : '')),
        confirmButton('rc' + r.id, 'Remove', 'Confirm', () => Store.removeRecon([r.id]))))) : null);
}
function ftCard(c) {
  const sum = c.sum, ft = c.ft;
  const sentN = Core.fromP(Core.toP(sum.needs) - Core.toP(sum.expNeeds)), sentW = Core.fromP(Core.toP(sum.wants) - Core.toP(sum.expWants));
  const sentNote = sentN + sentW > 0 ? h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Needs and Wants include money sent to others (Needs ' + INR(sentN) + ', Wants ' + INR(sentW) + '), so they are higher than the Expense tile. Moves between your own accounts are left out.') : null;
  const rows = ft.map((r) => h('tr', null,
    h('td', { 'data-label': 'Bucket' }, h('strong', null, r.label + ' (' + Math.round(r.targetPct * 100) + '%)'), r.id === 'savings' && sum.invest > 0 ? h('div', { class: 'xs muted' }, INR(sum.invest) + ' of it invested') : null),
    h('td', { class: 'r', 'data-label': 'Actual' }, money(r.actual)),
    h('td', { class: 'r', 'data-label': '% of income' }, Core.fmtPct(r.pct)),
    h('td', { class: 'r', 'data-label': 'Target' }, Math.round(r.targetPct * 100) + '% · ' + INR(r.targetAmt)),
    h('td', { 'data-label': 'Status' }, pill(r.status.tone, r.status.label))));
  return h('section', { class: 'card', 'aria-label': '50/30/20 check' },
    h('header', null, h('div', null, h('h3', null, '50/30/20 check'), h('p', null, 'Needs and Wants are what you spent. Savings is what is left of income after both.'))),
    h('div', { class: 'tw' }, h('table', { class: 'tbl stackable' },
      h('thead', null, h('tr', null, ['Bucket', 'Actual', '% of income', 'Target', 'Status'].map((x, i) => h('th', { class: i === 1 || i === 2 || i === 3 ? 'r' : '' }, x)))),
      h('tbody', null, rows),
      h('tfoot', null, h('tr', null, h('td', { 'data-label': 'Bucket' }, 'Income'), h('td', { class: 'r', 'data-label': 'Actual' }, money(sum.income)), h('td', { class: 'r', 'data-label': '% of income' }, sum.income > 0 ? '100%' : '–'), h('td', null), h('td', null))))),
    sentNote);
}
function topCard(c) {
  const rows = c.top;
  return h('section', { class: 'card', 'aria-label': 'Top spending categories' },
    h('header', null, h('div', null, h('h3', null, 'Top spending categories'), h('p', null, 'Expense entries only, largest first.'))),
    rows.length ? h('div', { class: 'tw' }, h('table', { class: 'tbl stackable' },
      h('thead', null, h('tr', null, ['Category', 'Actual', '% of expense', ''].map((x, i) => h('th', { class: i === 1 || i === 2 ? 'r' : '' }, x)))),
      h('tbody', null, rows.map((r) => h('tr', null,
        h('td', { 'data-label': 'Category' }, r.name),
        h('td', { class: 'r', 'data-label': 'Actual' }, money(r.amt)),
        h('td', { class: 'r', 'data-label': '% of expense' }, Core.fmtPct(r.pct)),
        h('td', { class: 'noLabel' }, h('div', { class: 'bar-cell' }, h('div', { class: 'meter', 'aria-hidden': 'true' }, h('b', { style: { width: Math.round(r.pct * 100) + '%', background: 'var(--exp)' } }))))))),
      h('tfoot', null, h('tr', null, h('td', { 'data-label': 'Total expense' }, 'Total expense'), h('td', { class: 'r', 'data-label': 'Actual' }, money(c.sum.expense)), h('td', { class: 'r', 'data-label': '% of expense' }, '100%'), h('td', null))))) : emptyState('No expenses in this period', 'Entries of type Expense will rank here.'));
}
function chartsRow(c) {
  const d = c.d, p = c.period;
  let series, labels, tipTitle, tableHead;
  if (p.kind === 'fy') { series = Core.monthlySeries(d.txns, p.months); labels = series.map((s) => s.label); tipTitle = (i) => Core.monthLabel(series[i].key); tableHead = 'Month'; }
  else { series = Core.weeklySeries(d.txns, p.from, p.to); labels = series.map((s) => s.label); tipTitle = (i) => series[i].label + ' · ' + Core.dayLabel(series[i].from) + (series[i].to !== series[i].from ? ' to ' + Core.dayLabel(series[i].to) : ''); tableHead = 'Week'; }
  const incSeries = { name: 'Income', color: 'var(--inc)', values: series.map((s) => s.income) };
  const expSeries = { name: 'Expense', color: 'var(--exp)', values: series.map((s) => s.expense) };
  const ive = Charts.card({
    title: 'Income vs expenses', sub: p.kind === 'fy' ? 'By month across the financial year' : 'By calendar week (CW) within the month',
    legend: [{ name: 'Income', color: 'var(--inc)' }, { name: 'Expense', color: 'var(--exp)' }],
    draw: (host) => Charts.columns(host, { labels, series: [incSeries, expSeries], annotate: 1, tipTitle, aria: 'Income versus expenses' }),
    table: () => h('table', { class: 'tbl' }, h('thead', null, h('tr', null, [tableHead, 'Income', 'Expense', 'Left after Needs and Wants'].map((x, i) => h('th', { class: i ? 'r' : '' }, x)))),
      h('tbody', null, series.map((s, i) => h('tr', null, h('td', null, tipTitle(i)), h('td', { class: 'r' }, INR2(s.income)), h('td', { class: 'r' }, INR2(s.expense)), h('td', { class: 'r' }, INR2(s.net)))))),
  });
  const tc = Charts.card({
    title: 'Top spending categories in rupees', sub: 'Expense entries, largest first',
    draw: (host) => Charts.hbars(host, c.top.map((r) => ({ name: r.name, value: r.amt, pct: r.pct }))),
    table: () => h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Category', 'Rupees', '% of expense'].map((x, i) => h('th', { class: i ? 'r' : '' }, x)))),
      h('tbody', null, c.top.map((r) => h('tr', null, h('td', null, r.name), h('td', { class: 'r' }, INR2(r.amt)), h('td', { class: 'r' }, Core.fmtPct(r.pct)))))),
  });
  return h('div', { class: 'cols' }, ive, tc);
}
function pageDashboard() {
  const c = dashCalc();
  const s = c.sum, p = c.period;
  const noData = Store.state.loaded.ledger && c.d.txns.length === 0;
  const notStarted = p.from > c.t, inProgress = p.to >= c.t;
  const dl = (cur, prev, lab) => (notStarted ? null : deltaLine(cur, prev, lab));
  const prevLab = (inProgress ? 'full ' : '') + (p.kind === 'month' ? Core.monthLabel(c.pp.ym) : Core.fyLabel(c.pp.fy));
  const rate = s.rate;
  const cl = c.clos;
  const cardTxt = cl && c.d.cfg.accounts.some((a) => a.active && a.kind === 'card') ? ' · banks and cash ' + INR(cl.banks) + ' · card dues ' + INR(-cl.cards) : '';
  const kpis = h('div', { class: 'kpis' },
    kpi('Income', INR(s.income), dl(s.income, c.psum.income, prevLab) || s.count + ' entries in period', null, 'var(--inc)'),
    kpi('Expense', INR(s.expense), dl(s.expense, c.psum.expense, prevLab) || 'Needs ' + INR(s.expNeeds) + ' · Wants ' + INR(s.expWants), null, 'var(--exp)'),
    kpi('Savings rate', rate === null ? '–' : Core.fmtPct(rate), rate === null ? 'No income in this period' : INR(s.savings) + ' left after Needs and Wants', rate === null ? null : h('div', null, pill(c.ft[2].status.tone, c.ft[2].status.label))),
    kpi('Closing balance', cl ? INR(cl.total) : '–', cl ? 'As of ' + Core.dateLabel(cl.asOf) + cardTxt : 'Period is before the tracking start'),
    kpi('Savings and investments', INR(s.invest), s.income > 0 ? Core.fmtPct(s.invest / s.income) + ' of income moved into investments' : 'Moved into investments', null, 'var(--sav)'),
    kpi('Transfers out', INR(s.tout), s.xfer > 0 ? 'To other people. Own-account moves of ' + INR(s.xfer) + ' left out' : 'Sent to other people'),
    kpi('Average daily', c.days > 0 ? INR(s.expense / c.days) : '–', c.days > 0 ? 'Expense over ' + c.days + (c.days > 1 ? ' tracked days' : ' tracked day') : 'No tracked days yet'));
  return h('div', { class: 'stack-lg' },
    h('div', null, pageHead('Dashboard', 'Choose a period and every figure below follows it.'), periodBar(), Store.state.loaded.ledger ? null : h('p', { class: 'muted small' }, 'Loading your ledger…'), demoBanner(), attention(c)),
    noData ? emptyState('Nothing logged yet', 'Add your first entry and these figures fill in as you go. Opening balances in Setup make the closing balance and reconciliation meaningful.', [
      h('button', { type: 'button', class: 'btn primary', onClick: () => go('entry') }, 'Add an entry'),
      h('button', { type: 'button', class: 'btn', onClick: async () => { try { const n = await Store.loadSample(); Toast.show('Loaded ' + n + ' sample entries'); } catch (e) { /* surfaced */ } } }, 'Load sample data')]) : null,
    kpis, ftCard(c), reconCard(c), topCard(c), chartsRow(c));
}
