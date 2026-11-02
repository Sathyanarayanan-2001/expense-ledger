'use strict';
/* Budget: plan checks, budget vs actual, month pace, plan vs 50/30/20. */
function budgetCalc() {
  const d = Store.derive(), t = today(), period = curPeriod();
  const sum = Core.summarize(d.txns, period.from, period.to);
  const first = Core.firstTracked(d.cfg, d.txns);
  const rows = Core.budgetRows(d.cfg, sum, period, t, first);
  const ft = Core.fiftyThirtyTwenty(sum, d.cfg.targets);
  const pace = Core.pace(d.txns, d.cfg, period, t);
  const gapFrom = Core.maxD(d.cfg.start, period.from), gapTo = Core.minD(period.to, Core.addDays(t, -1));
  const gapDays = Core.gaps(d.cov, gapFrom, gapTo).length;
  const rec = Core.reconcile(d.cfg, d.legs, d.recon, period, t);
  const hasBudgets = Object.keys(d.cfg.budgets).some((k) => Number(d.cfg.budgets[k]) > 0);
  const checks = Core.planChecks({ sum, ft, budgets: rows, hasBudgets, pace, period, today: t, gapDays, recon: rec });
  return { d, t, first, period, sum, rows, ft, pace, gapDays, rec, hasBudgets, checks };
}
function setBudget(catId, raw) {
  const d = Store.derive();
  const v = String(raw).trim() === '' ? 0 : Core.parseAmt(raw);
  if (raw !== '' && !(v >= 0)) { Toast.show('Enter the monthly budget as a number', 'bad'); render(); return; }
  const budgets = { ...d.cfg.budgets };
  if (v > 0) budgets[catId] = v; else delete budgets[catId];
  Store.setCfg({ ...d.cfg, budgets });
}
function checkIcon(status) { return status === 'pass' ? pill('good', 'Pass') : status === 'warn' ? pill('warn', 'Check') : status === 'fail' ? pill('bad', 'Fix') : pill('neutral', 'Waiting'); }
function paceCard(c) {
  const p = c.pace;
  if (!p) return null;
  const over = p.spendBudget > 0 && p.projected > p.spendBudget;
  const k = (label, value, sub) => h('div', { class: 'kpi' }, h('div', { class: 'lab' }, label), h('div', { class: 'val num', style: { fontSize: '22px' } }, value), sub ? h('div', { class: 'sub' }, sub) : null);
  const dayName = (day) => Core.dayLabel(Core.addDays(c.period.from, day - 1));
  return h('section', { class: 'card', 'aria-label': 'Spending pace this month' },
    h('header', null, h('div', null, h('h3', null, 'Spending pace'), h('p', null, 'Needs and Wants spent so far, against a straight-line path to your total monthly budget.'))),
    h('div', { class: 'kpis paceKpis' },
      k('Spent so far', INR(p.spent), p.days + (p.days > 1 ? ' days' : ' day') + ' of ' + p.dim),
      k('Monthly spending budget', p.spendBudget > 0 ? INR(p.spendBudget) : 'Not set', p.spendBudget > 0 ? INR(Math.max(p.remaining, 0)) + ' left' : 'Set budgets below'),
      k('Projected month end', INR(p.projected), p.spendBudget > 0 ? (over ? 'About ' + INR(p.projected - p.spendBudget) + ' over budget' : 'Within budget at this pace') : 'At the current daily rate'),
      k('Safe to spend per day', p.safePerDay === null ? '–' : INR(p.safePerDay), p.safePerDay === null ? 'Month is complete' : 'For the next ' + p.daysLeft + (p.daysLeft > 1 ? ' days' : ' day'))),
    Charts.card({
      title: 'Cumulative spending', legend: [{ name: 'Actual', color: 'var(--exp)', line: true }, { name: 'Budget pace', color: 'var(--ink2)', line: true }],
      draw: (host) => Charts.lines(host, { days: p.dim, series: [{ name: 'Actual', color: 'var(--exp)', points: p.actual.map((x, i) => ({ day: i + 1, value: x.value })) }, { name: 'Budget pace', color: 'var(--ink2)', points: p.spendBudget > 0 ? p.budget : [] }], tipTitle: dayName, aria: 'Cumulative spending against budget pace' }),
      table: () => h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Day', 'Actual so far', 'Budget pace'].map((x, i) => h('th', { class: i ? 'r' : '' }, x)))),
        h('tbody', null, p.budget.map((b, i) => h('tr', null, h('td', null, dayName(b.day)), h('td', { class: 'r' }, p.actual[i] ? INR2(p.actual[i].value) : '–'), h('td', { class: 'r' }, p.spendBudget > 0 ? INR2(b.value) : '–'))))),
    }));
}
function budgetTable(c) {
  const d = c.d;
  const monthsN = Core.monthsElapsed(c.period, c.t, c.first);
  const groups = [{ id: 'needs', label: 'Needs' }, { id: 'wants', label: 'Wants' }, { id: 'savings', label: 'Savings and investments' }];
  const head = ['Category', 'Budget per month (₹)', monthsN > 1 ? 'Budget for ' + monthsN + ' months' : 'Budget for period', 'Actual', 'Left', 'Used', 'Status'];
  const body = [];
  const showAll = !!ui.budgetAll;
  const idle = c.rows.filter((r) => !(r.monthly > 0 || r.actual > 0));
  groups.forEach((g) => {
    const rs = c.rows.filter((r) => (r.cat.group || 'needs') === g.id && (showAll || r.monthly > 0 || r.actual > 0));
    if (!rs.length) return;
    const bm = rs.reduce((a, r) => a + Core.toP(r.monthly), 0), bp = rs.reduce((a, r) => a + Core.toP(r.budget), 0), ac = rs.reduce((a, r) => a + Core.toP(r.actual), 0);
    body.push(h('tr', { class: 'group' }, h('td', { 'data-label': 'Group' }, g.label), h('td', { class: 'r', 'data-label': 'Budget per month' }, INR(Core.fromP(bm))), h('td', { class: 'r', 'data-label': 'Budget for period' }, INR(Core.fromP(bp))), h('td', { class: 'r', 'data-label': 'Actual' }, INR(Core.fromP(ac))), h('td', { class: 'r', 'data-label': 'Left' }, bp ? Core.fmtINR(Core.fromP(bp - ac), { dec: 0 }) : '–'), h('td', null), h('td', null)));
    rs.forEach((r) => {
      const used = r.used === null ? 0 : Math.min(1, r.used);
      body.push(h('tr', null,
        h('td', { 'data-label': 'Category' }, r.cat.name + (r.cat.active ? '' : ' (archived)')),
        h('td', { class: 'r', 'data-label': 'Budget per month' }, h('input', { id: 'bud-' + r.cat.id, class: 'in', style: { maxWidth: '130px', textAlign: 'right', minHeight: '34px' }, inputmode: 'decimal', 'aria-label': 'Monthly budget for ' + r.cat.name, placeholder: '0', value: r.monthly ? String(r.monthly) : '', onChange: (e) => setBudget(r.cat.id, e.target.value) })),
        h('td', { class: 'r', 'data-label': 'Budget for period' }, r.budget ? INR2(r.budget) : '–'),
        h('td', { class: 'r', 'data-label': 'Actual' }, r.actual ? INR2(r.actual) : '–'),
        h('td', { class: 'r', 'data-label': 'Left' }, r.budget ? Core.fmtINR(r.variance) : '–'),
        h('td', { 'data-label': 'Used' }, r.used === null ? '–' : h('div', { class: 'bar-cell' }, h('div', { class: 'meter', 'aria-hidden': 'true' }, h('b', { class: r.status.tone === 'bad' ? 'bad' : r.status.tone === 'warn' ? 'warn' : 'good', style: { width: Math.round(used * 100) + '%' } })), h('span', { class: 'xs num' }, Math.round(r.used * 100) + '%'))),
        h('td', { 'data-label': 'Status' }, r.status.id === 'none' ? '' : pill(r.status.tone, r.status.label))));
    });
  });
  const spend = c.rows.filter((r) => r.cat.kind !== 'investment' && (r.cat.group || 'needs') !== 'savings');
  const sb = spend.reduce((a, r) => a + Core.toP(r.budget), 0), sa = spend.reduce((a, r) => a + Core.toP(r.actual), 0);
  return h('section', { class: 'card', 'aria-label': 'Budget against actual' },
    h('header', null, h('div', null, h('h3', null, 'Budget vs actual'), h('p', null, 'Type a monthly limit per category. Actuals come from your entries for the chosen period.'))),
    idle.length || showAll ? h('div', null, h('button', { type: 'button', class: 'btn sm', onClick: () => { ui.budgetAll = !showAll; render(); } }, showAll ? 'Show only categories with a budget or spending' : 'Show all categories to add a budget (' + idle.length + ' more)')) : null,
    body.length ? h('div', { class: 'tw' }, h('table', { class: 'tbl stackable' },
      h('thead', null, h('tr', null, head.map((x, i) => h('th', { class: i >= 1 && i <= 4 ? 'r' : '' }, x)))), h('tbody', null, body),
      h('tfoot', null, h('tr', null, h('td', { 'data-label': 'Total' }, 'Needs and Wants'), h('td', null), h('td', { class: 'r', 'data-label': 'Budget for period' }, INR(Core.fromP(sb))), h('td', { class: 'r', 'data-label': 'Actual' }, INR(Core.fromP(sa))), h('td', { class: 'r', 'data-label': 'Left' }, sb ? Core.fmtINR(Core.fromP(sb - sa), { dec: 0 }) : '–'), h('td', null), h('td', null))))) : emptyState('No budgets or spending yet', 'Use “Show all categories” to set your first monthly budget.'),
    (() => {
      const diff = sa - Core.toP(c.sum.needs) - Core.toP(c.sum.wants);
      return body.length && diff !== 0 ? h('p', { class: 'small muted' }, 'This table groups entries by their category. The spending pace and the 50/30/20 check use each entry’s own Needs, Wants or Savings tag, so they differ from this total by ' + INR(Core.fromP(Math.abs(diff))) + ' (money sent to others that you tagged differently from its category).') : null;
    })());
}
function planCard(c) {
  const d = c.d, cfg = d.cfg;
  const inc = Number(cfg.plannedIncome) || 0;
  const tot = { needs: 0, wants: 0, savings: 0 };
  cfg.cats.filter((x) => x.kind !== 'income').forEach((x) => { const b = Number(cfg.budgets[x.id]) || 0; const g = x.group || 'needs'; if (tot[g] !== undefined) tot[g] += Core.toP(b); });
  const rows = Core.GROUPS.map((g) => {
    const amt = Core.fromP(tot[g.id]);
    const pct = inc > 0 ? amt / inc : null;
    const st = Core.bucketStatus(g.id, pct === null ? 0 : pct, (Number(cfg.targets[g.id]) || 0) / 100, inc > 0);
    return { g, amt, pct, st };
  });
  const unplanned = inc > 0 ? Core.fromP(Core.toP(inc) - tot.needs - tot.wants - tot.savings) : null;
  return h('section', { class: 'card', 'aria-label': 'Plan against 50/30/20' },
    h('header', null, h('div', null, h('h3', null, 'Does the plan fit 50/30/20?'), h('p', null, 'Your monthly budgets added up by group, against the income you expect each month.'))),
    h('div', { class: 'row' }, field('Expected monthly income (₹)', h('input', { id: 'plan-income', class: 'in', style: { maxWidth: '200px' }, inputmode: 'decimal', value: inc ? String(inc) : '', placeholder: 'e.g. 85000', onChange: (e) => { const v = e.target.value.trim() === '' ? 0 : Core.parseAmt(e.target.value); if (!(v >= 0)) { Toast.show('Enter a number', 'bad'); return render(); } Store.setCfg({ ...cfg, plannedIncome: v }); } }))),
    h('div', { class: 'tw' }, h('table', { class: 'tbl stackable' },
      h('thead', null, h('tr', null, ['Group', 'Planned per month', '% of expected income', 'Target', 'Status'].map((x, i) => h('th', { class: i > 0 && i < 4 ? 'r' : '' }, x)))),
      h('tbody', null, rows.map((r) => h('tr', null, h('td', { 'data-label': 'Group' }, h('strong', null, r.g.label)), h('td', { class: 'r', 'data-label': 'Planned per month' }, INR(r.amt)), h('td', { class: 'r', 'data-label': '% of expected income' }, Core.fmtPct(r.pct)), h('td', { class: 'r', 'data-label': 'Target' }, (Number(cfg.targets[r.g.id]) || 0) + '%'), h('td', { 'data-label': 'Status' }, pill(r.st.tone, r.st.id === 'na' ? 'Enter expected income' : r.st.label)))))),
    ), unplanned !== null ? h('p', { class: 'small muted' }, unplanned >= 0 ? INR(unplanned) + ' of expected income is not assigned to any budget yet.' : 'Budgets add up to ' + INR(-unplanned) + ' more than expected income.') : null);
}
function pageBudget() {
  const c = budgetCalc();
  return h('div', { class: 'stack-lg' },
    h('div', null, pageHead('Budget and plan', 'Set limits, watch the pace, and see whether the plan itself fits 50/30/20.'), periodBar(), demoBanner()),
    paceCard(c),
    h('section', { class: 'card', 'aria-label': 'Plan checks' }, h('header', null, h('div', null, h('h3', null, 'Plan checks'), h('p', null, 'For ' + c.period.label + '. Each line says what is checked and what to do.'))),
      h('ul', { class: 'check-list', style: { gap: '12px' } }, c.checks.map((k) => h('li', { style: { gridTemplateColumns: '90px 1fr', alignItems: 'center' } }, h('span', null, checkIcon(k.status)), h('span', null, h('strong', null, k.label), h('br'), h('span', { class: 'small muted' }, k.detail)))))),
    budgetTable(c), planCard(c));
}
