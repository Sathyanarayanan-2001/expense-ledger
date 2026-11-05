'use strict';
/* Records: stored entries as a table, plus daily, weekly (CW) and monthly views. */
function recRange() {
  const r = ui.rec, t = today(), d = Store.derive(), p = curPeriod();
  const first = d.txns.length ? Core.minD(d.txns[0].date, d.cfg.start) : d.cfg.start;
  switch (r.preset) {
    case 'period': return { from: p.from, to: p.to };
    case 'month': return { from: Core.monthStart(t.slice(0, 7)), to: Core.monthEnd(t.slice(0, 7)) };
    case '7': return { from: Core.addDays(t, -6), to: t };
    case '30': return { from: Core.addDays(t, -29), to: t };
    case 'fy': return Core.fyRange(Core.fyOf(t));
    case 'all': return { from: first, to: Core.maxD(t, d.txns.length ? d.txns[d.txns.length - 1].date : t) };
    default: return { from: r.from && Core.isDate(r.from) ? r.from : first, to: r.to && Core.isDate(r.to) ? r.to : Core.maxD(t, d.txns.length ? d.txns[d.txns.length - 1].date : t) };
  }
}
function recFiltered() {
  const r = ui.rec, d = Store.derive(), rg = recRange();
  const q = r.q.trim().toLowerCase();
  const cm = Core.catMap(d.cfg), am = Core.acctMap(d.cfg);
  return d.txns.filter((t) => {
    if (t.date < rg.from || t.date > rg.to) return false;
    if (r.type && t.type !== r.type) return false;
    if (r.acct && t.acct !== r.acct && t.toAcct !== r.acct) return false;
    if (r.group && t.group !== r.group) return false;
    if (r.cat && t.cat !== r.cat) return false;
    if (r.mode && t.mode !== r.mode) return false;
    if (q) {
      const hay = [t.desc, t.notes, t.ref, (cm[t.cat] || {}).name, (am[t.acct] || {}).name, t.mode, String(t.amt)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function recTable(txns, rg) {
  const r = ui.rec, d = Store.derive(), am = Core.acctMap(d.cfg), cm = Core.catMap(d.cfg);
  let legs = Core.buildLegs(txns);
  if (r.acct) legs = legs.filter((l) => l.acct === r.acct);
  legs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.ts - a.ts));
  if (!legs.length) return emptyState('No entries match', Store.derive().txns.length ? 'Widen the date range or clear a filter.' : 'Entries you save on the Add page are listed here.', [h('button', { type: 'button', class: 'btn primary', onClick: () => go('entry') }, 'Add entries')]);
  let wd = 0, dep = 0;
  legs.forEach((l) => { wd += Core.toP(l.wd); dep += Core.toP(l.dep); });
  const shown = legs.slice(0, r.limit);
  const cols = ['Date', 'Slot', 'Bank', 'Description', 'Category', 'Mode of payment', 'Withdrawal', 'Deposit', 'Bank ref no.', 'Notes', 'Group', 'Month', 'CW', ''];
  const tbl = h('table', { class: 'tbl stackable dense', 'aria-label': 'Stored entries' },
    h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c === 'Withdrawal' || c === 'Deposit' ? 'r' : '' }, c)))),
    h('tbody', null, shown.map((l) => {
      const t = d.byId.get(l.tid);
      const cat = l.type === 'transfer' ? (l.leg === 'out' ? 'Transfer to ' : 'Transfer from ') + ((am[l.other] || {}).name || '') : (cm[l.cat] || {}).name || '';
      return h('tr', null,
        h('td', { 'data-label': 'Date' }, Core.dmy(l.date)),
        h('td', { 'data-label': 'Slot' }, Core.slotLabel(l.slot)),
        h('td', { 'data-label': 'Bank' }, (am[l.acct] || {}).name || l.acct),
        h('td', { class: 'clip', 'data-label': 'Description', title: l.desc }, l.desc, t && t.demo ? h('span', { class: 'xs muted' }, ' (sample)') : null),
        h('td', { class: 'clip', 'data-label': 'Category', title: cat }, cat),
        h('td', { 'data-label': 'Mode' }, l.mode),
        h('td', { class: 'r', 'data-label': 'Withdrawal' }, l.wd ? INR2(l.wd) : ''),
        h('td', { class: 'r', 'data-label': 'Deposit' }, l.dep ? INR2(l.dep) : ''),
        h('td', { 'data-label': 'Bank ref no.' }, l.ref),
        h('td', { class: 'clip', 'data-label': 'Notes', title: l.notes }, l.notes),
        h('td', { 'data-label': 'Group' }, l.group ? Core.groupTag(l.group, d.cfg) : ''),
        h('td', { 'data-label': 'Month' }, Core.monthTag(l.date)),
        h('td', { 'data-label': 'CW' }, Core.cwLabel(l.date)),
        h('td', { class: 'noLabel' }, t ? h('div', { class: 'row', style: { gap: '2px', flexWrap: 'nowrap' } },
          h('button', { type: 'button', class: 'btn ghost sm icon', 'aria-label': 'Edit entry ' + (l.desc || cat), onClick: () => openEditor(t) }, icon('edit')),
          h('button', { type: 'button', class: 'btn ghost sm icon', 'aria-label': 'Copy entry ' + (l.desc || cat) + ' to a new row', onClick: () => dupToDraft(t) }, icon('copy'))) : null));
    })),
    h('tfoot', null, h('tr', null, h('td', { 'data-label': 'Rows' }, legs.length + ' rows'), h('td', { colspan: 5, class: 'muted xs noLabel' }, 'Own-account transfers show on both banks and cancel out.'), h('td', { class: 'r', 'data-label': 'Withdrawals' }, INR2(Core.fromP(wd))), h('td', { class: 'r', 'data-label': 'Deposits' }, INR2(Core.fromP(dep))), h('td', { colspan: 6 }))));
  return h('div', { class: 'stack' }, h('div', { class: 'tw' }, tbl),
    legs.length > shown.length ? h('div', null, h('button', { type: 'button', class: 'btn', onClick: () => { r.limit += 100; paintRecords(); } }, 'Show 100 more (' + (legs.length - shown.length) + ' left)')) : null);
}
function seriesTable(rows, kind, limitState) {
  const r = ui.rec;
  const lab = kind === 'daily' ? 'Day' : kind === 'weekly' ? 'Calendar week' : 'Month';
  const shown = rows.slice(0, r.limit);
  const label = (s) => (kind === 'daily' ? Core.dayLabel(s.key) + ' ' + s.key.slice(0, 4) : kind === 'weekly' ? s.label + ' · ' + Core.dayLabel(s.from) + ' to ' + Core.dayLabel(s.to) : Core.monthLabel(s.key));
  const tot = rows.reduce((a, s) => ({ income: a.income + Core.toP(s.income), expense: a.expense + Core.toP(s.expense), tout: a.tout + Core.toP(s.tout), invest: a.invest + Core.toP(s.invest), net: a.net + Core.toP(s.net), count: a.count + s.count }), { income: 0, expense: 0, tout: 0, invest: 0, net: 0, count: 0 });
  const heads = [lab, 'Entries', 'Income', 'Expense', 'Sent to others', 'Invested', 'Left after Needs and Wants'].concat(kind === 'monthly' ? ['Savings rate'] : []).concat(kind === 'daily' ? [''] : []);
  return h('div', { class: 'stack' }, h('div', { class: 'tw' }, h('table', { class: 'tbl stackable' },
    h('thead', null, h('tr', null, heads.map((x, i) => h('th', { class: i > 0 && x !== '' ? 'r' : '' }, x)))),
    h('tbody', null, shown.map((s) => h('tr', null,
      h('td', { 'data-label': lab }, h('strong', null, label(s))), h('td', { class: 'r', 'data-label': 'Entries' }, String(s.count)),
      h('td', { class: 'r', 'data-label': 'Income' }, s.income ? INR2(s.income) : '–'), h('td', { class: 'r', 'data-label': 'Expense' }, s.expense ? INR2(s.expense) : '–'),
      h('td', { class: 'r', 'data-label': 'Sent to others' }, s.tout ? INR2(s.tout) : '–'), h('td', { class: 'r', 'data-label': 'Invested' }, s.invest ? INR2(s.invest) : '–'),
      h('td', { class: 'r', 'data-label': 'Left after Needs and Wants' }, s.income || s.expense || s.tout ? INR2(s.net) : '–'),
      kind === 'monthly' ? h('td', { class: 'r', 'data-label': 'Savings rate' }, s.rate === null ? '–' : Core.fmtPct(s.rate)) : null,
      kind === 'daily' ? h('td', { class: 'noLabel' }, h('button', { type: 'button', class: 'btn sm', onClick: () => go('entry', { date: s.key }) }, 'Open day')) : null))),
    h('tfoot', null, h('tr', null, h('td', { 'data-label': 'Total' }, 'Total'), h('td', { class: 'r', 'data-label': 'Entries' }, String(tot.count)), h('td', { class: 'r', 'data-label': 'Income' }, INR2(Core.fromP(tot.income))), h('td', { class: 'r', 'data-label': 'Expense' }, INR2(Core.fromP(tot.expense))), h('td', { class: 'r', 'data-label': 'Sent to others' }, INR2(Core.fromP(tot.tout))), h('td', { class: 'r', 'data-label': 'Invested' }, INR2(Core.fromP(tot.invest))), h('td', { class: 'r', 'data-label': 'Left after Needs and Wants' }, INR2(Core.fromP(tot.net))), kind === 'monthly' ? h('td', null) : null, kind === 'daily' ? h('td', null) : null)))),
    rows.length > shown.length ? h('div', null, h('button', { type: 'button', class: 'btn', onClick: () => { r.limit += 100; paintRecords(); } }, 'Show 100 more')) : null);
}
function recView(txns, rg) {
  const r = ui.rec;
  if (!txns.length && r.view !== 'table') return emptyState('No entries match', 'Widen the date range or clear a filter.');
  if (r.view === 'table') return recTable(txns, rg);
  let rows, chart;
  if (r.view === 'daily') {
    rows = Core.dailySeries(txns, rg.from, rg.to);
    const days = rows.length;
    chart = days <= 62
      ? Charts.card({ title: 'Daily spending', sub: 'Needs and Wants spent each day', draw: (host) => Charts.columns(host, { labels: rows.map((s) => String(Core.parts(s.key).d)), series: [{ name: 'Spent', color: 'var(--exp)', values: rows.map((s) => Core.fromP(Core.toP(s.needs) + Core.toP(s.wants))) }], tipTitle: (i) => Core.dayLabel(rows[i].key), aria: 'Daily spending', annotate: 'max' }), table: () => h('p', { class: 'small muted' }, 'The table below lists every day.') })
      : h('p', { class: 'small muted' }, 'Narrow the range to 62 days or fewer to see the daily chart. The table below still lists every day.');
    rows = rows.slice().reverse();
  } else if (r.view === 'weekly') {
    rows = Core.weeklySeries(txns, rg.from, rg.to);
    chart = Charts.card({ title: 'Income vs expenses by week', sub: 'Calendar weeks (CW), clipped to the range', legend: [{ name: 'Income', color: 'var(--inc)' }, { name: 'Expense', color: 'var(--exp)' }], draw: (host) => Charts.columns(host, { labels: rows.map((s) => s.label), series: [{ name: 'Income', color: 'var(--inc)', values: rows.map((s) => s.income) }, { name: 'Expense', color: 'var(--exp)', values: rows.map((s) => s.expense) }], tipTitle: (i) => rows[i].label + ' · ' + Core.dayLabel(rows[i].from) + ' to ' + Core.dayLabel(rows[i].to), aria: 'Income versus expenses by week', annotate: 'max' }), table: () => h('p', { class: 'small muted' }, 'The table below lists every week.') });
    rows = rows.slice().reverse();
  } else {
    const first = rg.from.slice(0, 7), last = rg.to.slice(0, 7);
    const months = monthsBetween(first + '-01', last + '-01');
    rows = Core.monthlySeries(txns, months);
    chart = Charts.card({ title: 'Income vs expenses by month', sub: 'Every month in the range', legend: [{ name: 'Income', color: 'var(--inc)' }, { name: 'Expense', color: 'var(--exp)' }], draw: (host) => Charts.columns(host, { labels: rows.map((s) => Core.monthShort(s.key)), series: [{ name: 'Income', color: 'var(--inc)', values: rows.map((s) => s.income) }, { name: 'Expense', color: 'var(--exp)', values: rows.map((s) => s.expense) }], tipTitle: (i) => Core.monthLabel(rows[i].key), aria: 'Income versus expenses by month', annotate: 'max' }), table: () => h('p', { class: 'small muted' }, 'The table below lists every month.') });
    rows = rows.slice().reverse();
  }
  return h('div', { class: 'stack' }, chart, h('section', { class: 'card' }, seriesTable(rows, r.view)));
}
function paintRecords() {
  const host = $('#recResults'); if (!host) return;
  const rg = recRange();
  const txns = recFiltered();
  const sum = Core.summarize(txns, rg.from, rg.to);
  mount(host, h('div', { class: 'stack' },
    h('p', { class: 'small muted', 'aria-live': 'polite' }, Core.dateLabel(rg.from) + ' to ' + Core.dateLabel(rg.to) + ' · ' + txns.length + ' entries · Income ' + INR2(sum.income) + ' · Expense ' + INR2(sum.expense)),
    recView(txns, rg)));
}
function pageRecords() {
  const r = ui.rec, d = Store.derive();
  const pick = (k) => (v) => { r[k] = v; r.limit = 100; paintRecords(); };
  const accts = [{ value: '', label: 'All banks' }].concat(d.cfg.accounts.filter((a) => !Core.isHolding(a)).map((a) => ({ value: a.id, label: a.name + (a.active ? '' : ' (archived)') })));
  const catOpts = [{ value: '', label: 'All categories' }].concat(['expense', 'income', 'investment', 'transferout'].map((k) => ({ group: Core.typeLabel(k), items: d.cfg.cats.filter((c) => c.kind === k).map((c) => ({ value: c.id, label: c.name })) })));
  const presets = [{ value: 'period', label: 'Dashboard period' }, { value: 'month', label: 'This month' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: 'fy', label: 'This FY' }, { value: 'all', label: 'All' }, { value: 'custom', label: 'Custom' }];
  const custom = r.preset === 'custom';
  const rg = recRange();
  const filters = h('div', { class: 'stack' },
    h('div', { class: 'row' }, segmented(presets, r.preset, (v) => { r.preset = v; if (v === 'custom') { r.from = rg.from; r.to = rg.to; } r.limit = 100; render(); }, 'Date range', 'scroll sm'),
      custom ? h('div', { class: 'row' }, h('input', { id: 'rec-from', class: 'in', type: 'date', 'aria-label': 'From date', value: r.from, style: { width: 'auto' }, onChange: (e) => { r.from = e.target.value; paintRecords(); } }), h('span', null, 'to'), h('input', { id: 'rec-to', class: 'in', type: 'date', 'aria-label': 'To date', value: r.to, style: { width: 'auto' }, onChange: (e) => { r.to = e.target.value; paintRecords(); } })) : null),
    h('div', { class: 'fgrid' },
      field('Bank', select('rec-acct', accts, r.acct, pick('acct')), 'c3'),
      field('Category', select('rec-cat', catOpts, r.cat, pick('cat')), 'c3'),
      field('Group', select('rec-group', [{ value: '', label: 'All groups' }].concat(Core.GROUPS.map((g) => ({ value: g.id, label: g.label }))), r.group, pick('group')), 'c2'),
      field('Type', select('rec-type', [{ value: '', label: 'All types' }].concat(Core.TYPES.map((t) => ({ value: t.id, label: t.label }))), r.type, pick('type')), 'c2'),
      field('Mode', select('rec-mode', [{ value: '', label: 'Any mode' }].concat(Core.MODES.map((m) => ({ value: m, label: m }))), r.mode, pick('mode')), 'c2'),
      field('Search', h('input', { id: 'rec-q', class: 'in', type: 'search', placeholder: 'Description, notes, reference…', value: r.q, onInput: (e) => { r.q = e.target.value; r.limit = 100; clearTimeout(r._t); r._t = setTimeout(paintRecords, 160); } }), 'c12')));
  return h('div', { class: 'stack' },
    h('div', { class: 'row-sb' }, pageHead('Records', 'Everything you have stored. Filter it, switch views, export what you see to Excel or CSV, or import records from a file.'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onClick: () => exportRecords(recFiltered(), 'Expense_Records', 'xlsx') }, icon('download', 16), 'Excel'), h('button', { type: 'button', class: 'btn', onClick: () => exportRecords(recFiltered(), 'Expense_Records', 'csv') }, icon('download', 16), 'CSV'), h('button', { type: 'button', class: 'btn', onClick: openImport }, icon('plus', 16), 'Import'))),
    demoBanner(),
    segmented([{ value: 'table', label: 'All entries' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly (CW)' }, { value: 'monthly', label: 'Monthly' }], r.view, (v) => { r.view = v; r.limit = 100; render(); }, 'Records view', 'scroll'),
    filters, h('div', { id: 'recResults' }));
}
