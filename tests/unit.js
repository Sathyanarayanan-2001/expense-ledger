'use strict';
// Verification round 1a: hand-computed expectations (worked out on paper, not by the code under test)
const C = require('../src/core.js');
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL', name, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)); }
};
const near = (name, got, want) => eq(name, Math.round(got * 1e6) / 1e6, Math.round(want * 1e6) / 1e6);

const cfg = C.normCfg({
  start: '2026-10-01',
  accounts: [
    { id: 'H', name: 'HDFC', kind: 'bank', opening: 10000, active: true },
    { id: 'C', name: 'Cash', kind: 'cash', opening: 500, active: true },
    { id: 'K', name: 'Card', kind: 'card', opening: -2000, active: true },
  ],
  cats: C.DEFAULT_CATS, budgets: { c_rent: 15000, c_dine: 1000, c_groc: 0 }, targets: { needs: 50, wants: 30, savings: 20 }, plannedIncome: 50000,
});
const T = (id, date, slot, type, acct, o) => ({ id, date, slot, type, acct, toAcct: '', cat: '', desc: '', amt: 0, mode: '', ref: '', notes: '', group: '', demo: false, ts: +id.slice(1), ...o });
const months = { '2026-10': {
  t1: T('t1', '2026-10-01', 'morning', 'income', 'H', { amt: 50000, cat: 'c_sal' }),
  t2: T('t2', '2026-10-02', 'morning', 'expense', 'H', { amt: 12000, cat: 'c_rent', group: 'needs' }),
  t3: T('t3', '2026-10-03', 'afternoon', 'expense', 'K', { amt: 1500, cat: 'c_dine', group: 'wants', mode: 'Credit card' }),
  t4: T('t4', '2026-10-04', 'evening', 'investment', 'H', { amt: 5000, cat: 'c_sip', group: 'savings' }),
  t5: T('t5', '2026-10-05', 'night', 'transferout', 'H', { amt: 3000, cat: 'c_fam', group: 'needs' }),
  t6: T('t6', '2026-10-06', 'morning', 'transfer', 'H', { toAcct: 'C', amt: 2000 }),
  t7: T('t7', '2026-10-07', 'evening', 'transfer', 'H', { toAcct: 'K', amt: 1500 }),
  t8: T('t8', '2026-10-08', 'afternoon', 'expense', 'C', { amt: 300.5, cat: 'c_dine', group: 'wants' }),
  t9: T('t9', '2026-10-09', 'morning', 'expense', 'H', { amt: 800, cat: 'c_groc', group: 'needs' }),
  t11: T('t11', '2026-10-10', 'morning', 'transferout', 'H', { amt: 1000, cat: 'c_loan', group: 'wants' }),
  t12: T('t12', '2026-10-11', 'morning', 'transferout', 'H', { amt: 700, cat: 'c_otr', group: 'savings' }),
}, '2026-09': { t10: T('t10', '2026-09-30', 'evening', 'expense', 'H', { amt: 999, cat: 'c_groc', group: 'needs' }) } };
const txns = C.flatten(months);
eq('flatten count', txns.length, 12);
eq('flatten sorted', txns[0].id, 't10');
const oct = C.makePeriod(2026, '2026-10');
const s = C.summarize(txns, oct.from, oct.to);
eq('income', s.income, 50000); eq('expense', s.expense, 14600.5); eq('invest', s.invest, 5000); eq('tout', s.tout, 4700);
eq('needs', s.needs, 15800); eq('wants', s.wants, 2800.5); eq('toutSavings', s.toutSavings, 700); eq('xfer', s.xfer, 3500);
eq('expNeeds', s.expNeeds, 12800); eq('expWants', s.expWants, 1800.5); eq('count', s.count, 11);
eq('savings', s.savings, 31399.5); near('rate', s.rate, 31399.5 / 50000);
eq('byCat rent', s.byCat.c_rent, 12000); eq('byCat sip', s.byCat.c_sip, 5000); eq('byCat fam', s.byCat.c_fam, 3000);
eq('expByCat has no transfer cats', Object.keys(s.expByCat).sort(), ['c_dine', 'c_groc', 'c_rent']);
// the pre-start 30 Sep expense is in September's summary but not in balances
const sep = C.summarize(txns, '2026-09-01', '2026-09-30'); eq('sep expense', sep.expense, 999);
// FY roll-up
const fy = C.makePeriod(2026, 'FY'); eq('fy label', fy.label, 'Full FY 2026-27'); eq('fy from/to', [fy.from, fy.to], ['2026-04-01', '2027-03-31']);
const sfy = C.summarize(txns, fy.from, fy.to); eq('fy expense', sfy.expense, 15599.5);
// balances
const legs = C.buildLegs(txns);
eq('legs count', legs.length, 14);
eq('bal H', C.balanceAt(cfg, legs, 'H', '2026-10-31'), 34000);
eq('bal C', C.balanceAt(cfg, legs, 'C', '2026-10-31'), 2199.5);
eq('bal K', C.balanceAt(cfg, legs, 'K', '2026-10-31'), -2000);
eq('bal before start', C.balanceAt(cfg, legs, 'H', '2026-09-30'), null);
eq('bal on start day, nothing yet', C.balanceAt(cfg, legs, 'H', '2026-10-01'), 60000);
const cl = C.closing(cfg, legs, oct, '2026-10-26');
eq('closing total', cl.total, 34199.5); eq('closing banks', cl.banks, 36199.5); eq('closing cards', cl.cards, -2000); eq('closing asOf', cl.asOf, '2026-10-26');
eq('identity: opening + income - expense - invest - tout', 8500 + s.income - s.expense - s.invest - s.tout, cl.total);
eq('closing before start', C.closing(cfg, legs, C.makePeriod(2026, '2026-09'), '2026-10-26'), null);
const cl2 = C.closing(cfg, legs, oct, '2026-10-05'); eq('closing capped at today', cl2.asOf, '2026-10-05');
eq('closing at 5 Oct (H)', cl2.per.find((x) => x.acct.id === 'H').bal, 40000);
// reconciliation
const recon = C.normRecon({
  r1: { acct: 'H', asOf: '2026-10-05', bal: 40000 }, r2: { acct: 'C', asOf: '2026-10-08', bal: 2200 }, r3: { acct: 'K', asOf: '2026-10-10', bal: -2001 },
  r4: { acct: 'H', asOf: '2026-09-20', bal: 1 }, r5: { acct: 'H', asOf: '2026-10-30', bal: 5 },
});
const rc = C.reconcile(cfg, legs, recon, oct, '2026-10-26');
eq('recon H reconciled', [rc[0].status, rc[0].diff, rc[0].asOf], ['reconciled', 0, '2026-10-05']);
eq('recon C boundary 0.50 reconciled', [rc[1].status, rc[1].diff], ['reconciled', 0.5]);
eq('recon K mismatch', [rc[2].status, rc[2].diff], ['mismatch', -1]);
const rcSep = C.reconcile(cfg, legs, recon, C.makePeriod(2026, '2026-09'), '2026-10-26'); eq('recon before start', [rcSep[0].status], ['before']);
const rcNone = C.reconcile(cfg, legs, [], oct, '2026-10-26'); eq('recon none', rcNone.map((r) => r.status), ['none', 'none', 'none']);
// future-dated bank entry (30 Oct) is ignored when today is 26 Oct
eq('recon ignores future statement', rc[0].asOf, '2026-10-05');
// 50/30/20
const ft = C.fiftyThirtyTwenty(s, cfg.targets);
near('needs pct', ft[0].pct, 15800 / 50000); eq('needs status', ft[0].status.id, 'ok');
near('wants pct', ft[1].pct, 2800.5 / 50000); near('savings pct', ft[2].pct, 31399.5 / 50000);
eq('targetAmt', ft.map((r) => r.targetAmt), [25000, 15000, 10000]);
eq('status over', C.bucketStatus('needs', 0.56, 0.5, true).id, 'bad'); eq('status near', C.bucketStatus('needs', 0.53, 0.5, true).id, 'near');
eq('status savings under', C.bucketStatus('savings', 0.12, 0.2, true).id, 'bad'); eq('status savings near', C.bucketStatus('savings', 0.17, 0.2, true).id, 'near');
eq('status exact target', C.bucketStatus('wants', 0.3, 0.3, true).id, 'ok'); eq('status no income', C.bucketStatus('wants', 0, 0.3, false).id, 'na');
// top categories
const top = C.topCategories(s, cfg, 2);
eq('top names', top.map((r) => r.name), ['Rent', 'Dining and takeaway', 'All other categories (1)']);
near('top pct rent', top[0].pct, 12000 / 14600.5); eq('top other amt', top[2].amt, 800);
// avg days
eq('elapsed days uses earliest txn (30 Sep) inside period only', C.elapsedDays(oct, '2026-10-26', cfg, txns), 26);
eq('elapsed days past period', C.elapsedDays(C.makePeriod(2026, '2026-09'), '2026-10-26', cfg, txns), 1);
eq('elapsed days future', C.elapsedDays(C.makePeriod(2026, '2026-12'), '2026-10-26', cfg, txns), 0);
// coverage + gaps
const marks = C.normMarks({ '2026-10': { '2026-10-01|afternoon': true, '2026-10-01|evening': 'demo', '2026-10-01|night': false } });
const cov = C.coverageMap(txns, marks);
eq('missing 1 Oct', C.missingSlots(cov, '2026-10-01'), ['night']);
eq('missing 2 Oct', C.missingSlots(cov, '2026-10-02'), ['afternoon', 'evening', 'night']);
const g = C.gaps(cov, '2026-10-01', '2026-10-03'); eq('gaps days', g.map((x) => x.date), ['2026-10-01', '2026-10-02', '2026-10-03']); eq('gaps covered', g.map((x) => x.covered), [3, 1, 1]);
eq('gaps empty range', C.gaps(cov, '2026-10-05', '2026-10-01'), []);
// dates
eq('iso 26 Oct 2026', C.cwLabel('2026-10-26'), 'CW44'); eq('iso 31 Dec 2026', C.cwLabel('2026-12-31'), 'CW53'); eq('iso 1 Jan 2027', C.cwLabel('2027-01-01'), 'CW53'); eq('iso 4 Jan 2027', C.cwLabel('2027-01-04'), 'CW01');
eq('iso 29 Dec 2025', C.cwLabel('2025-12-29'), 'CW01'); eq('iso 1 Jan 2026', C.cwLabel('2026-01-01'), 'CW01'); eq('leap day', C.isDate('2028-02-29'), true); eq('bad day', C.isDate('2026-02-29'), false);
eq('addDays across year', C.addDays('2026-12-31', 1), '2027-01-01'); eq('diffDays', C.diffDays('2026-10-01', '2026-10-26'), 25);
eq('fyOf Mar', C.fyOf('2027-03-31'), 2026); eq('fyOf Apr', C.fyOf('2027-04-01'), 2027); eq('addMonths', C.addMonths('2026-11', 3), '2027-02'); eq('addMonths back', C.addMonths('2026-01', -1), '2025-12');
eq('monthEnd Feb 2028', C.monthEnd('2028-02'), '2028-02-29');
// money
eq('inr lakh', C.fmtINR(123456.5), '₹1,23,456.50'); eq('inr crore', C.fmtINR(12345678), '₹1,23,45,678'); eq('inr neg', C.fmtINR(-999.99), '−₹999.99'); eq('inr 0 dec', C.fmtINR(1234.56, { dec: 0 }), '₹1,235');
eq('inr small', C.fmtINR(5), '₹5'); eq('inr thousand', C.fmtINR(1000), '₹1,000'); eq('inr sign', C.fmtINR(1.2, { sign: true }), '+₹1.20'); eq('inr zero', C.fmtINR(0), '₹0'); eq('inr null', C.fmtINR(null), '–');
eq('compact', [C.fmtCompact(950), C.fmtCompact(12500), C.fmtCompact(250000), C.fmtCompact(15000000)], ['₹950', '₹12.5k', '₹2.5L', '₹1.5Cr']);
eq('parse sum', C.parseAmt('120+80'), 200); eq('parse commas', C.parseAmt('₹1,250.50'), 1250.5); eq('parse bad', C.parseAmt('12a'), NaN); eq('parse zero', C.parseAmt('0'), NaN); eq('parse 3dp', C.parseAmt('1.234'), NaN); eq('parse neg', C.parseAmt('-5'), NaN);
eq('float drift 0.1+0.2', C.parseAmt('0.1+0.2'), 0.3);
eq('norm txn rejects bad date', C.normTxn('x', { date: '2026-13-01', amt: 5 }), null); eq('norm txn rejects zero amt', C.normTxn('x', { date: '2026-10-01', amt: 0 }), null);
// weekly / monthly / daily series
const wk = C.weeklySeries(txns, '2026-10-01', '2026-10-31');
eq('weekly labels', wk.map((w) => w.label), ['CW40', 'CW41', 'CW42', 'CW43', 'CW44']);
eq('weekly CW40 span', [wk[0].from, wk[0].to], ['2026-10-01', '2026-10-04']);
eq('weekly CW40 expense (2 Oct 12000 + 3 Oct 1500)', wk[0].expense, 13500); eq('weekly CW41 expense (8 Oct 300.5 + 9 Oct 800)', wk[1].expense, 1100.5);
eq('weekly total = month', Math.round(wk.reduce((a, w) => a + w.expense, 0) * 100) / 100, s.expense);
const ms = C.monthlySeries(txns, C.fyMonths(2026)); eq('monthly len', ms.length, 12); eq('monthly Oct', ms[6].expense, 14600.5); eq('monthly Sep', ms[5].expense, 999); eq('monthly Apr empty', ms[0].count, 0);
const ds = C.dailySeries(txns, '2026-10-01', '2026-10-03'); eq('daily', ds.map((d) => d.expense), [0, 12000, 1500]);
// budgets and pace
const br = C.budgetRows(cfg, s, oct, '2026-10-26');
const rent = br.find((r) => r.cat.id === 'c_rent'); eq('budget rent', [rent.budget, rent.actual, rent.variance, rent.status.id], [15000, 12000, 3000, 'ok']);
const dine = br.find((r) => r.cat.id === 'c_dine'); eq('budget dine over', [dine.budget, dine.actual, dine.status.id], [1000, 1800.5, 'over']);
const groc = br.find((r) => r.cat.id === 'c_groc'); eq('budget groc (0 budget, spent)', groc.status.id, 'unbudgeted');
const fyRows = C.budgetRows(cfg, C.summarize(txns, fy.from, fy.to), fy, '2026-10-26'); eq('fy budget counts from the tracking start (Oct only = 1 month)', fyRows.find((r) => r.cat.id === 'c_rent').budget, 15000);
const firstT = C.firstTracked(cfg, txns); eq('first tracked day is the earliest entry when it precedes the start', firstT, txns[0].date < cfg.start ? txns[0].date : cfg.start);
eq('fy budget months with a pre-start entry (Sep + Oct)', C.budgetRows(cfg, C.summarize(txns, fy.from, fy.to), fy, '2026-10-26', firstT).find((r) => r.cat.id === 'c_rent').budget, txns[0].date < cfg.start ? 30000 : 15000);
const cfgApr = { ...cfg, start: '2026-04-01' }; eq('fy budget when tracking began in April (7 months)', C.budgetRows(cfgApr, C.summarize(txns, fy.from, fy.to), fy, '2026-10-26').find((r) => r.cat.id === 'c_rent').budget, 105000);
eq('months elapsed: future month counts none', C.monthsElapsed(C.makePeriod(2026, '2026-11'), '2026-10-26', '2026-10-01'), 0);
eq('months elapsed: month before tracking counts none', C.monthsElapsed(C.makePeriod(2026, '2026-08'), '2026-10-26', '2026-10-01'), 0);
eq('months elapsed: a mid-month start still counts that whole month', C.monthsElapsed(C.makePeriod(2026, '2026-10'), '2026-10-26', '2026-10-15'), 1);
const cfgSv = { ...cfg, cats: cfg.cats.concat([{ id: 'c_svout', name: 'Sent as savings', kind: 'transferout', group: 'savings', active: true }, { id: 'c_nout', name: 'Sent for needs', kind: 'transferout', group: 'needs', active: true }]), budgets: { ...cfg.budgets, c_svout: 4000, c_nout: 2000 } };
eq('pace budget leaves out savings-group categories, includes needs-group transfers out', C.pace(txns, cfgSv, oct, '2026-10-26').spendBudget, 18000);
eq('group tag follows the targets', [C.groupTag('needs', { targets: { needs: 60, wants: 20, savings: 20 } }), C.groupTag('savings', cfg)], ['Needs (60%)', 'Savings (' + cfg.targets.savings + '%)']);
const pc = C.pace(txns, cfg, oct, '2026-10-26'); eq('pace dim', pc.dim, 31); eq('pace budget total', pc.spendBudget, 16000);
eq('pace spent = needs+wants', pc.spent, 18600.5); eq('pace days', pc.days, 26); eq('pace daysLeft', pc.daysLeft, 5);
eq('pace projected', pc.projected, Math.round((18600.5 / 26) * 31 * 100) / 100); eq('pace safe/day', pc.safePerDay, 0);
eq('pace null for FY', C.pace(txns, cfg, fy, '2026-10-26'), null);
// export + CSV guard
const rows = C.exportRows(cfg, [txns.find((t) => t.id === 't2')]);
eq('export row', [rows[0].Date, rows[0].Bank, rows[0]['Withdrawal amount'], rows[0].Month, rows[0].CW, rows[0].Group], ['02-10-2026', 'HDFC', 12000, 'Oct-2026', 'CW40', 'Needs (50%)']);
const tr = C.exportRows(cfg, [txns.find((t) => t.id === 't6')]); eq('transfer legs', tr.map((r) => [r.Bank, r['Withdrawal amount'], r['Deposit amount'], r.Category]), [['HDFC', 2000, '', 'Transfer to Cash'], ['Cash', '', 2000, 'Transfer from HDFC']]);
eq('csv formula guard', C.toCSV([{ Date: '=1+1', Description: 'a,"b"' }]).includes("'=1+1"), true); eq('csv quoting', C.toCSV([{ Description: 'a,"b"' }]).includes('"a,""b"""'), true);
// sample data sanity
const smp = C.genSample('2026-10-26', C.defaultCfg());
eq('sample has demo flags', smp.txns.every((t) => t.demo), true);
eq('sample recon cash off by 120', (() => { const c2 = { ...C.defaultCfg(), start: '2026-10-01' }; const l = C.buildLegs(C.flatten({ x: Object.fromEntries(smp.txns.map((t) => [t.id, t])) })); return Math.round((smp.recon[1].bal - C.balanceAt(c2, l, 'a_cash', smp.recon[1].asOf)) * 100) / 100; })(), 120);
console.log('unit tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
