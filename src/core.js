'use strict';
/* Core: pure logic (dates, money, schema, calculations). No DOM, no storage. */
const Core = (function () {
  // ---------- constants ----------
  const SLOTS = [
    { id: 'morning', label: 'Morning', hint: 'before noon' },
    { id: 'afternoon', label: 'Afternoon', hint: 'noon to 4 pm' },
    { id: 'evening', label: 'Evening', hint: '4 pm to 8 pm' },
    { id: 'night', label: 'Night', hint: 'after 8 pm' },
  ];
  const SLOT_IDS = SLOTS.map((s) => s.id);
  const slotLabel = (id) => (SLOTS.find((s) => s.id === id) || { label: id }).label;
  const slotForHour = (h) => (h < 5 ? 'night' : h < 12 ? 'morning' : h < 16 ? 'afternoon' : h < 20 ? 'evening' : 'night');

  const TYPES = [
    { id: 'expense', label: 'Expense', short: 'Expense' },
    { id: 'income', label: 'Income', short: 'Income' },
    { id: 'investment', label: 'Savings and investment', short: 'Invest' },
    { id: 'transfer', label: 'Own-account transfer', short: 'Own transfer' },
    { id: 'transferout', label: 'Sent to others', short: 'Sent out' },
  ];
  const typeLabel = (id) => (TYPES.find((t) => t.id === id) || { label: id }).label;

  const MODES = ['UPI', 'Debit card', 'Credit card', 'Cash', 'NEFT/IMPS/RTGS', 'Cheque', 'Net banking', 'Auto-debit'];
  const GROUPS = [
    { id: 'needs', label: 'Needs', def: 50 },
    { id: 'wants', label: 'Wants', def: 30 },
    { id: 'savings', label: 'Savings', def: 20 },
  ];
  const groupLabel = (id) => (GROUPS.find((g) => g.id === id) || { label: '' }).label;
  const groupTag = (id, cfg) => groupLabel(id) + ' (' + (Number(cfg && cfg.targets && cfg.targets[id]) || 0) + '%)';
  const KIND_LABEL = { bank: 'Bank account', cash: 'Cash', card: 'Credit card' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---------- dates (all 'YYYY-MM-DD' strings, UTC math so no timezone drift) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const parts = (s) => { const a = s.split('-'); return { y: +a[0], m: +a[1], d: +a[2] }; };
  const toMs = (s) => { const p = parts(s); return Date.UTC(p.y, p.m - 1, p.d); };
  const fromMs = (ms) => { const dt = new Date(ms); return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); };
  const addDays = (s, n) => fromMs(toMs(s) + n * 86400000);
  const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / 86400000);
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromMs(toMs(s)) === s;
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthKey = (s) => s.slice(0, 7);
  const monthStart = (ym) => ym + '-01';
  const monthEnd = (ym) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return ymd(y, m, daysInMonth(y, m)); };
  const addMonths = (ym, n) => { let y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + pad(m + 1); };
  const dow = (s) => new Date(toMs(s)).getUTCDay();
  const minD = (a, b) => (a < b ? a : b);
  const maxD = (a, b) => (a > b ? a : b);
  const localDate = (d) => ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  function isoWeek(s) {
    const d = new Date(toMs(s));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
    return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7) };
  }
  const cwLabel = (s) => 'CW' + pad(isoWeek(s).week);
  const monthLabel = (ym) => MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
  const monthShort = (ym) => MONTHS[+ym.slice(5, 7) - 1];
  const monthTag = (s) => MONTHS[+s.slice(5, 7) - 1] + '-' + s.slice(0, 4); // Oct-2026 (export column)
  const dayLabel = (s) => { const p = parts(s); return DOW[dow(s)] + ' ' + p.d + ' ' + MONTHS[p.m - 1]; };
  const dateLabel = (s) => { const p = parts(s); return p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y; };
  const dmy = (s) => { const p = parts(s); return pad(p.d) + '-' + pad(p.m) + '-' + p.y; };

  // Indian financial year: April to March. fy = the calendar year in which it starts.
  const fyOf = (s) => { const p = parts(s); return p.m >= 4 ? p.y : p.y - 1; };
  const fyRange = (fy) => ({ from: fy + '-04-01', to: fy + 1 + '-03-31' });
  const fyLabel = (fy) => 'FY ' + fy + '-' + String((fy + 1) % 100).padStart(2, '0');
  const fyMonths = (fy) => { const out = []; for (let i = 0; i < 12; i++) out.push(addMonths(fy + '-04', i)); return out; };

  function makePeriod(fy, sel) {
    if (sel === 'FY') {
      const r = fyRange(fy);
      return { kind: 'fy', fy, from: r.from, to: r.to, label: 'Full ' + fyLabel(fy), months: fyMonths(fy) };
    }
    return { kind: 'month', fy, ym: sel, from: monthStart(sel), to: monthEnd(sel), label: monthLabel(sel), months: [sel] };
  }

  // ---------- money (integers in paise to avoid float drift) ----------
  const toP = (x) => Math.round((Number(x) || 0) * 100);
  const fromP = (p) => p / 100;
  function groupIN(intStr) {
    if (intStr.length <= 3) return intStr;
    return intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + intStr.slice(-3);
  }
  function fmtINR(x, o) {
    o = o || {};
    if (x === null || x === undefined || Number.isNaN(x)) return '–';
    const p = toP(x);
    const neg = p < 0;
    let a = Math.abs(p);
    let dec = o.dec;
    if (dec === undefined || dec === null) dec = a % 100 === 0 ? 0 : 2;
    if (dec === 0) a = Math.round(a / 100) * 100;
    const rupees = Math.floor(a / 100);
    const paise = a % 100;
    let s = '₹' + groupIN(String(rupees)) + (dec ? '.' + pad(paise) : '');
    if (neg && a !== 0) s = '−' + s;
    else if (o.sign && a !== 0) s = '+' + s;
    return s;
  }
  function fmtCompact(x) {
    const a = Math.abs(x), s = x < 0 ? '−' : '';
    const t = (v) => String(+v.toFixed(2));
    if (a >= 1e7) return s + '₹' + t(a / 1e7) + 'Cr';
    if (a >= 1e5) return s + '₹' + t(a / 1e5) + 'L';
    if (a >= 1e3) return s + '₹' + t(a / 1e3) + 'k';
    return s + '₹' + t(a);
  }
  const fmtPct = (x, d) => (x === null || x === undefined || !isFinite(x) ? '–' : (x * 100).toFixed(d === undefined ? 1 : d).replace(/\.0+$/, '') + '%');
  // accepts "1,250.50" and sums like "120+80"
  function parseAmt(str) {
    if (typeof str === 'number') return isFinite(str) && str > 0 ? Math.round(str * 100) / 100 : NaN;
    const s = String(str || '').replace(/[₹,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?(\+\d+(\.\d{1,2})?)*$/.test(s)) return NaN;
    const total = s.split('+').reduce((acc, v) => acc + toP(v), 0);
    return total > 0 ? fromP(total) : NaN;
  }

  // ---------- defaults ----------
  const DEFAULT_ACCOUNTS = [
    { id: 'a_hdfc', name: 'HDFC', kind: 'bank', opening: 0, active: true },
    { id: 'a_uco', name: 'UCO Bank', kind: 'bank', opening: 0, active: true },
    { id: 'a_indian', name: 'Indian Bank', kind: 'bank', opening: 0, active: true },
    { id: 'a_cash', name: 'Cash wallet', kind: 'cash', opening: 0, active: true },
  ];
  const DEFAULT_CATS = [
    ['c_rent', 'Rent', 'expense', 'needs'], ['c_groc', 'Groceries and vegetables', 'expense', 'needs'],
    ['c_util', 'Electricity, water and gas', 'expense', 'needs'], ['c_tel', 'Mobile and internet', 'expense', 'needs'],
    ['c_fuel', 'Fuel and commute', 'expense', 'needs'], ['c_med', 'Medical and pharmacy', 'expense', 'needs'],
    ['c_ins', 'Insurance premiums', 'expense', 'needs'], ['c_emi', 'Loan EMIs', 'expense', 'needs'],
    ['c_help', 'Household help and upkeep', 'expense', 'needs'], ['c_edu', 'Education and fees', 'expense', 'needs'],
    ['c_tax', 'Taxes and government fees', 'expense', 'needs'],
    ['c_dine', 'Dining and takeaway', 'expense', 'wants'], ['c_ent', 'Entertainment and subscriptions', 'expense', 'wants'],
    ['c_shop', 'Shopping and clothes', 'expense', 'wants'], ['c_trav', 'Travel and holidays', 'expense', 'wants'],
    ['c_care', 'Personal care', 'expense', 'wants'], ['c_gift', 'Gifts and festivals', 'expense', 'wants'],
    ['c_gadget', 'Gadgets and home upgrades', 'expense', 'wants'], ['c_misc', 'Miscellaneous', 'expense', 'wants'],
    ['c_sip', 'Mutual funds and SIP', 'investment', 'savings'], ['c_stock', 'Stocks', 'investment', 'savings'],
    ['c_fd', 'FD and RD', 'investment', 'savings'], ['c_ret', 'PPF, NPS and EPF', 'investment', 'savings'],
    ['c_gold', 'Gold', 'investment', 'savings'], ['c_emerg', 'Emergency fund', 'investment', 'savings'],
    ['c_sal', 'Salary', 'income', ''], ['c_int', 'Interest and dividends', 'income', ''],
    ['c_ref', 'Refunds and reimbursements', 'income', ''], ['c_oinc', 'Other income', 'income', ''],
    ['c_fam', 'Family support', 'transferout', 'needs'], ['c_loan', 'Loan or gift to others', 'transferout', 'wants'],
    ['c_otr', 'Other transfer', 'transferout', 'needs'],
  ].map((c) => ({ id: c[0], name: c[1], kind: c[2], group: c[3], active: true }));

  const START_DEFAULT = '2026-10-01';
  function defaultCfg() {
    return {
      v: 1,
      start: START_DEFAULT,
      accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
      cats: DEFAULT_CATS.map((c) => ({ ...c })),
      budgets: {},
      targets: { needs: 50, wants: 30, savings: 20 },
      plannedIncome: 0,
    };
  }
  function normCfg(raw, today) {
    const d = defaultCfg();
    if (!raw || typeof raw !== 'object') return d;
    const c = { ...d, ...raw };
    c.accounts = Array.isArray(raw.accounts) && raw.accounts.length ? raw.accounts.map((a) => ({ active: true, opening: 0, kind: 'bank', ...a })) : d.accounts;
    c.cats = Array.isArray(raw.cats) && raw.cats.length ? raw.cats.map((x) => ({ active: true, group: '', ...x })) : d.cats;
    c.budgets = raw.budgets && typeof raw.budgets === 'object' ? { ...raw.budgets } : {};
    c.targets = { ...d.targets, ...(raw.targets || {}) };
    c.start = isDate(raw.start) ? raw.start : d.start;
    c.plannedIncome = Number(raw.plannedIncome) || 0;
    return c;
  }
  const acctMap = (cfg) => { const m = {}; cfg.accounts.forEach((a) => (m[a.id] = a)); return m; };
  const catMap = (cfg) => { const m = {}; cfg.cats.forEach((c) => (m[c.id] = c)); return m; };

  // ---------- transactions ----------
  function normTxn(id, r) {
    if (!r || typeof r !== 'object' || r.d) return null; // d marks a deleted entry (kept so the deletion can sync)
    const t = {
      id, date: r.date, slot: SLOT_IDS.includes(r.slot) ? r.slot : 'morning',
      type: TYPES.some((x) => x.id === r.type) ? r.type : 'expense',
      acct: r.acct || '', toAcct: r.toAcct || '', cat: r.cat || '', desc: r.desc || '',
      amt: Number(r.amt), mode: r.mode || '', ref: r.ref || '', notes: r.notes || '', group: r.group || '',
      demo: !!r.demo, ts: Number(r.ts) || 0,
    };
    if (!isDate(t.date) || !(t.amt > 0)) return null;
    return t;
  }
  const byDateThenTime = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts || (a.id < b.id ? -1 : 1));
  function flatten(months) {
    const out = [];
    Object.keys(months || {}).forEach((ym) => {
      const items = months[ym] || {};
      Object.keys(items).forEach((id) => { const t = normTxn(id, items[id]); if (t) out.push(t); });
    });
    out.sort(byDateThenTime);
    return out;
  }
  // the stored form is one flat map of id -> record, deleted records included
  function liveTxns(map) {
    const out = [];
    Object.keys(map || {}).forEach((id) => { const t = normTxn(id, map[id]); if (t) out.push(t); });
    out.sort(byDateThenTime);
    return out;
  }
  function legsOf(t) {
    const base = { tid: t.id, date: t.date, slot: t.slot, desc: t.desc, cat: t.cat, mode: t.mode, ref: t.ref, notes: t.notes, group: t.group, type: t.type, ts: t.ts };
    if (t.type === 'income') return [{ ...base, acct: t.acct, wd: 0, dep: t.amt }];
    if (t.type === 'transfer') {
      return [
        { ...base, acct: t.acct, wd: t.amt, dep: 0, group: '', leg: 'out', other: t.toAcct },
        { ...base, acct: t.toAcct, wd: 0, dep: t.amt, group: '', leg: 'in', other: t.acct },
      ];
    }
    return [{ ...base, acct: t.acct, wd: t.amt, dep: 0 }];
  }
  const buildLegs = (txns) => { const l = []; txns.forEach((t) => legsOf(t).forEach((x) => l.push(x))); return l; };
  const spendGroup = (t) => (t.type === 'expense' ? (t.group === 'needs' ? 'needs' : 'wants') : t.group === 'wants' || t.group === 'savings' ? t.group : 'needs');

  // ---------- period summary ----------
  function summarize(txns, from, to) {
    const o = { income: 0, expense: 0, invest: 0, tout: 0, needs: 0, wants: 0, toutSavings: 0, xfer: 0, expNeeds: 0, expWants: 0, count: 0, byCat: {}, expByCat: {} };
    for (const t of txns) {
      if (t.date < from || t.date > to) continue;
      const p = toP(t.amt);
      o.count++;
      if (t.type === 'income') o.income += p;
      else if (t.type === 'expense') {
        o.expense += p; o[spendGroup(t)] += p; o[spendGroup(t) === 'needs' ? 'expNeeds' : 'expWants'] += p;
        o.byCat[t.cat] = (o.byCat[t.cat] || 0) + p; o.expByCat[t.cat] = (o.expByCat[t.cat] || 0) + p;
      } else if (t.type === 'investment') {
        o.invest += p; o.byCat[t.cat] = (o.byCat[t.cat] || 0) + p;
      } else if (t.type === 'transferout') {
        o.tout += p; const g = spendGroup(t);
        if (g === 'savings') o.toutSavings += p; else o[g] += p;
        o.byCat[t.cat] = (o.byCat[t.cat] || 0) + p;
      } else if (t.type === 'transfer') o.xfer += p;
    }
    const r = {};
    ['income', 'expense', 'invest', 'tout', 'needs', 'wants', 'toutSavings', 'xfer', 'expNeeds', 'expWants'].forEach((k) => (r[k] = fromP(o[k])));
    r.count = o.count;
    r.byCat = {}; Object.keys(o.byCat).forEach((k) => (r.byCat[k] = fromP(o.byCat[k])));
    r.expByCat = {}; Object.keys(o.expByCat).forEach((k) => (r.expByCat[k] = fromP(o.expByCat[k])));
    r.savings = fromP(o.income - o.needs - o.wants); // what is left of income after Needs and Wants
    r.rate = o.income > 0 ? (o.income - o.needs - o.wants) / o.income : null;
    r.spend = fromP(o.needs + o.wants);
    return r;
  }

  // days used for "average daily": tracking days inside the period, up to today
  const firstTracked = (cfg, txns) => (txns && txns.length ? minD(cfg.start, txns[0].date) : cfg.start);
  function elapsedDays(period, today, cfg, txns) {
    const first = firstTracked(cfg, txns);
    const a = maxD(period.from, first);
    const b = minD(period.to, today);
    return b < a ? 0 : diffDays(a, b) + 1;
  }

  // ---------- balances & reconciliation ----------
  function balanceAt(cfg, legs, acctId, date) {
    const a = cfg.accounts.find((x) => x.id === acctId);
    if (!a || date < cfg.start) return null;
    let p = toP(a.opening);
    for (const l of legs) if (l.acct === acctId && l.date >= cfg.start && l.date <= date) p += toP(l.dep) - toP(l.wd);
    return fromP(p);
  }
  function closing(cfg, legs, period, today) {
    const asOf = minD(period.to, today);
    if (asOf < cfg.start) return null;
    let total = 0, banks = 0, cards = 0;
    const per = [];
    cfg.accounts.filter((a) => a.active).forEach((a) => {
      const b = balanceAt(cfg, legs, a.id, asOf);
      const p = toP(b);
      total += p; if (a.kind === 'card') cards += p; else banks += p;
      per.push({ acct: a, bal: b });
    });
    return { asOf, total: fromP(total), banks: fromP(banks), cards: fromP(cards), per };
  }
  function reconcile(cfg, legs, recon, period, today) {
    const cap = minD(period.to, today);
    return cfg.accounts.filter((a) => a.active).map((a) => {
      const es = recon.filter((r) => r.acct === a.id && r.asOf <= cap).sort((x, y) => (x.asOf === y.asOf ? y.ts - x.ts : x.asOf < y.asOf ? 1 : -1));
      const e = es[0];
      if (!e) return { acct: a, status: 'none' };
      const tracker = balanceAt(cfg, legs, a.id, e.asOf);
      if (tracker === null) return { acct: a, id: e.id, asOf: e.asOf, bank: e.bal, tracker: null, diff: null, status: 'before' };
      const diff = fromP(toP(e.bal) - toP(tracker));
      return { acct: a, id: e.id, asOf: e.asOf, bank: e.bal, tracker, diff, status: Math.abs(diff) <= 0.5 ? 'reconciled' : 'mismatch' };
    });
  }
  function normRecon(items) {
    const out = [];
    Object.keys(items || {}).forEach((id) => {
      const r = items[id];
      if (r && !r.d && isDate(r.asOf) && r.acct && isFinite(Number(r.bal))) out.push({ id, acct: r.acct, asOf: r.asOf, bal: Number(r.bal), note: r.note || '', demo: !!r.demo, ts: Number(r.ts) || 0 });
    });
    return out;
  }

  // ---------- coverage (which day/slot has been accounted for) ----------
  function coverageMap(txns, marks) {
    const m = new Map();
    const add = (d, s) => { if (!SLOT_IDS.includes(s)) return; if (!m.has(d)) m.set(d, new Set()); m.get(d).add(s); };
    txns.forEach((t) => add(t.date, t.slot));
    Object.keys(marks || {}).forEach((k) => { if (marks[k]) { const i = k.indexOf('|'); add(k.slice(0, i), k.slice(i + 1)); } });
    return m;
  }
  const missingSlots = (cov, d) => SLOT_IDS.filter((s) => !(cov.get(d) && cov.get(d).has(s)));
  function gaps(cov, from, to) {
    const out = [];
    if (to < from) return out;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const miss = missingSlots(cov, d);
      if (miss.length) out.push({ date: d, missing: miss, covered: 4 - miss.length });
    }
    return out;
  }
  function marksOf(map) {
    const out = {};
    Object.keys(map || {}).forEach((k) => { if (map[k] && map[k].v) out[k] = true; });
    return out;
  }
  function normMarks(months) {
    const out = {};
    Object.keys(months || {}).forEach((ym) => { const m = months[ym] || {}; Object.keys(m).forEach((k) => { if (m[k]) out[k] = true; }); });
    return out;
  }

  // ---------- status rules ----------
  function bucketStatus(group, pct, target, hasIncome) {
    if (!hasIncome) return { id: 'na', label: 'No income yet', tone: 'neutral' };
    const diff = (pct - target) * 100; // percentage points
    if (group === 'savings') {
      if (diff >= 0) return { id: 'ok', label: 'On track', tone: 'good' };
      if (diff >= -5) return { id: 'near', label: 'Slightly under', tone: 'warn' };
      return { id: 'bad', label: 'Below target', tone: 'bad' };
    }
    if (diff <= 0) return { id: 'ok', label: 'On track', tone: 'good' };
    if (diff <= 5) return { id: 'near', label: 'Slightly over', tone: 'warn' };
    return { id: 'bad', label: 'Over target', tone: 'bad' };
  }
  function fiftyThirtyTwenty(sum, targets) {
    const inc = sum.income;
    const rows = [
      { id: 'needs', label: 'Needs', actual: sum.needs },
      { id: 'wants', label: 'Wants', actual: sum.wants },
      { id: 'savings', label: 'Savings', actual: sum.savings },
    ];
    return rows.map((r) => {
      const tp = (Number(targets[r.id]) || 0) / 100;
      const pct = inc > 0 ? r.actual / inc : null;
      return { ...r, pct, targetPct: tp, targetAmt: fromP(Math.round(toP(inc) * tp)), status: bucketStatus(r.id, pct, tp, inc > 0) };
    });
  }
  function topCategories(sum, cfg, n) {
    const cm = catMap(cfg);
    const rows = Object.keys(sum.expByCat).map((id) => ({ id, name: (cm[id] || { name: 'Uncategorised' }).name, amt: sum.expByCat[id] })).sort((a, b) => b.amt - a.amt);
    const total = sum.expense;
    const top = rows.slice(0, n).map((r) => ({ ...r, pct: total > 0 ? r.amt / total : 0 }));
    const rest = rows.slice(n);
    if (rest.length) { const amt = fromP(rest.reduce((a, r) => a + toP(r.amt), 0)); top.push({ id: '_other', name: 'All other categories (' + rest.length + ')', amt, pct: total > 0 ? amt / total : 0, other: true }); }
    return top;
  }

  // ---------- time series ----------
  function blankBucket(key, label) { return { key, label, income: 0, expense: 0, invest: 0, tout: 0, needs: 0, wants: 0, count: 0 }; }
  function addToBucket(b, t) {
    const p = toP(t.amt);
    b.count++;
    if (t.type === 'income') b.income += p;
    else if (t.type === 'expense') { b.expense += p; b[spendGroup(t)] += p; }
    else if (t.type === 'investment') b.invest += p;
    else if (t.type === 'transferout') { b.tout += p; const g = spendGroup(t); if (g !== 'savings') b[g] += p; }
  }
  function finishBucket(b) {
    ['income', 'expense', 'invest', 'tout', 'needs', 'wants'].forEach((k) => (b[k] = fromP(b[k])));
    b.net = fromP(toP(b.income) - toP(b.needs) - toP(b.wants));
    b.rate = b.income > 0 ? b.net / b.income : null;
    return b;
  }
  function bucketize(txns, from, to, keyFn, labelFn, order) {
    const map = new Map();
    (order || []).forEach((k) => map.set(k, blankBucket(k, labelFn(k))));
    txns.forEach((t) => {
      if (t.date < from || t.date > to) return;
      const k = keyFn(t.date);
      if (!map.has(k)) map.set(k, blankBucket(k, labelFn(k)));
      addToBucket(map.get(k), t);
    });
    return [...map.values()].map(finishBucket);
  }
  const monthlySeries = (txns, months) => bucketize(txns, months[0] + '-01', monthEnd(months[months.length - 1]), monthKey, monthShort, months);
  function weeklySeries(txns, from, to) {
    const keyOf = (d) => { const w = isoWeek(d); return w.year + '-W' + pad(w.week); };
    const order = [];
    for (let d = from; d <= to; d = addDays(d, 1)) { const k = keyOf(d); if (!order.includes(k)) order.push(k); }
    const rangeOf = {};
    for (let d = from; d <= to; d = addDays(d, 1)) { const k = keyOf(d); if (!rangeOf[k]) rangeOf[k] = { from: d, to: d }; rangeOf[k].to = d; }
    const rows = bucketize(txns, from, to, keyOf, (k) => 'CW' + k.slice(-2), order);
    rows.forEach((r) => { r.from = rangeOf[r.key].from; r.to = rangeOf[r.key].to; });
    return rows;
  }
  function dailySeries(txns, from, to) {
    const order = [];
    for (let d = from; d <= to; d = addDays(d, 1)) order.push(d);
    return bucketize(txns, from, to, (d) => d, (d) => dayLabel(d), order);
  }

  // ---------- budgets ----------
  // months of the period that count towards a budget: from the first tracked month up to the current month
  const monthsElapsed = (period, today, first) => period.months.filter((m) => monthStart(m) <= today && (!first || monthEnd(m) >= first)).length;
  function budgetRows(cfg, sum, period, today, first) {
    const n = monthsElapsed(period, today, first === undefined ? cfg.start : first);
    const rows = [];
    cfg.cats.filter((c) => c.kind !== 'income').forEach((c) => {
      const monthly = Number(cfg.budgets[c.id]) || 0;
      const actual = sum.byCat[c.id] || 0;
      if (!c.active && monthly === 0 && actual === 0) return;
      const budget = fromP(toP(monthly) * n);
      const variance = fromP(toP(budget) - toP(actual));
      const used = budget > 0 ? actual / budget : null;
      let status;
      if (budget === 0 && actual === 0) status = { id: 'none', label: 'No budget', tone: 'neutral' };
      else if (budget === 0) status = { id: 'unbudgeted', label: 'No budget set', tone: 'warn' };
      else if (c.kind === 'investment') status = used >= 1 ? { id: 'ok', label: 'Target met', tone: 'good' } : used >= 0.85 ? { id: 'near', label: 'Nearly there', tone: 'warn' } : { id: 'under', label: 'Behind', tone: 'warn' };
      else status = used > 1 ? { id: 'over', label: 'Over budget', tone: 'bad' } : used >= 0.85 ? { id: 'near', label: 'Near limit', tone: 'warn' } : { id: 'ok', label: 'Within budget', tone: 'good' };
      rows.push({ cat: c, monthly, budget, actual, variance, used, status });
    });
    return rows;
  }
  // cumulative spend (Needs + Wants) for a month vs a straight-line budget pace
  function pace(txns, cfg, period, today) {
    if (period.kind !== 'month') return null;
    const ym = period.ym;
    const last = minD(period.to, today);
    if (last < period.from) return null;
    const dim = diffDays(period.from, period.to) + 1;
    const spendBudget = cfg.cats.filter((c) => (c.kind === 'expense' || c.kind === 'transferout') && (c.group || 'needs') !== 'savings').reduce((a, c) => a + toP(cfg.budgets[c.id] || 0), 0);
    const daily = dailySeries(txns, period.from, last);
    let cum = 0;
    const actual = daily.map((d, i) => { cum += toP(d.needs) + toP(d.wants); return { day: i + 1, date: d.key, value: fromP(cum) }; });
    const budget = [];
    for (let i = 1; i <= dim; i++) budget.push({ day: i, value: fromP(Math.round((spendBudget * i) / dim)) });
    const spent = actual.length ? actual[actual.length - 1].value : 0;
    const days = actual.length;
    const projected = days > 0 ? fromP(Math.round((toP(spent) / days) * dim)) : 0;
    const left = period.to > today ? diffDays(today, period.to) : 0;
    const remaining = fromP(spendBudget - toP(spent));
    return { ym, dim, days, actual, budget, spendBudget: fromP(spendBudget), spent, projected, daysLeft: left, safePerDay: left > 0 && spendBudget > 0 ? fromP(Math.round(Math.max(remaining, 0) * 100 / left)) : null, remaining };
  }

  // ---------- plan checks ----------
  function planChecks(a) {
    // a: {sum, ft, budgets (rows), gapDays, recon, period, pace, hasBudgets}
    const out = [];
    const inc = a.sum.income;
    const push = (id, label, status, detail) => out.push({ id, label, status, detail });
    const b = a.ft;
    const mk = (r, what) => {
      if (inc <= 0) return push(r.id, what, 'na', 'Waiting for income in this period');
      const st = r.status;
      push(r.id, what, st.tone === 'good' ? 'pass' : st.tone === 'warn' ? 'warn' : 'fail', fmtPct(r.pct) + ' of income against a target of ' + fmtPct(r.targetPct, 0));
    };
    mk(b[0], 'Needs stay within target'); mk(b[1], 'Wants stay within target'); mk(b[2], 'Savings reach target');
    if (a.hasBudgets) {
      const over = a.budgets.filter((r) => r.status.id === 'over');
      push('budget', 'Every category within its budget', over.length ? 'fail' : 'pass', over.length ? over.length + ' over: ' + over.slice(0, 3).map((r) => r.cat.name).join(', ') + (over.length > 3 ? '…' : '') : 'All budgeted categories are within limit');
      const un = a.budgets.filter((r) => r.status.id === 'unbudgeted');
      push('unbudgeted', 'Every spend has a budget', un.length ? 'warn' : 'pass', un.length ? un.length + ' with spending but no budget: ' + un.slice(0, 3).map((r) => r.cat.name).join(', ') : 'Nothing is spent outside a budget');
    } else push('budget', 'Budgets are set', 'warn', 'No category budgets yet. Add them on the Budget tab.');
    if (a.pace && a.period.to >= a.today && a.pace.spendBudget > 0) {
      const ok = a.pace.projected <= a.pace.spendBudget;
      push('pace', 'Month-end pace fits the budget', ok ? 'pass' : 'fail', 'Projected ' + fmtINR(a.pace.projected, { dec: 0 }) + ' against a budget of ' + fmtINR(a.pace.spendBudget, { dec: 0 }));
    }
    push('gaps', 'Every day is logged', a.gapDays === 0 ? 'pass' : a.gapDays <= 3 ? 'warn' : 'fail', a.gapDays === 0 ? 'No unlogged slots in this period' : a.gapDays + ' day' + (a.gapDays > 1 ? 's' : '') + ' with unlogged slots');
    const rec = a.recon.filter((r) => r.status !== 'reconciled');
    push('recon', 'Bank balances reconcile', rec.length === 0 ? 'pass' : a.recon.some((r) => r.status === 'mismatch') ? 'fail' : 'warn', rec.length === 0 ? 'All accounts match their statements' : rec.length + ' account' + (rec.length > 1 ? 's' : '') + ' need a check');
    return out;
  }

  // ---------- export ----------
  // One row per leg (an own-account transfer is two rows, one per bank). 'Entry ID' ties the rows to the stored entry,
  // so a file exported from here can be imported back without creating duplicates.
  function exportRows(cfg, txns) {
    const am = acctMap(cfg), cm = catMap(cfg);
    const rows = [];
    buildLegs(txns).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts)).forEach((l) => {
      const catName = l.type === 'transfer' ? (l.leg === 'out' ? 'Transfer to ' : 'Transfer from ') + ((am[l.other] || {}).name || '') : (cm[l.cat] || {}).name || '';
      rows.push({
        Date: dmy(l.date), Slot: slotLabel(l.slot), Bank: (am[l.acct] || {}).name || l.acct, Description: l.desc, Category: catName,
        'Mode of payment': l.mode, 'Withdrawal amount': l.wd || '', 'Deposit amount': l.dep || '', 'Bank reference no': l.ref, Notes: l.notes,
        Group: l.group ? groupTag(l.group, cfg) : '', Month: monthTag(l.date), CW: cwLabel(l.date), Type: typeLabel(l.type), 'Entry ID': l.tid, _iso: l.date,
      });
    });
    return rows;
  }
  // 'Entry ID' is the last column so the first fourteen keep their old positions in sheets built on earlier exports
  const EXPORT_COLS = ['Date', 'Slot', 'Bank', 'Description', 'Category', 'Mode of payment', 'Withdrawal amount', 'Deposit amount', 'Bank reference no', 'Notes', 'Group', 'Month', 'CW', 'Type', 'Entry ID'];
  // Text that Excel would silently change when it opens a CSV: long numbers (12-digit bank references become 6.27E+11),
  // leading zeros, dates and fractions (5-10, 1/2), month names (Oct-2026), thousands separators, times, TRUE/FALSE.
  const MONTH_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
  const MANGLE = [
    /^\d{10,}$/, /^0\d+$/, /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i, /^\d{1,4}[-/.]\d{1,4}(?:[-/.]\d{1,4})?$/, /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/,
    /^\d{1,2}:\d{2}(?::\d{2})?$/, /^(?:true|false)$/i, new RegExp('^' + MONTH_RE + '[-\\s./]+\\d{1,4}$', 'i'), new RegExp('^\\d{1,2}[-\\s./]+' + MONTH_RE + '(?:[-\\s./]+\\d{2,4})?$', 'i'),
  ];
  const excelWouldMangle = (s) => s.length <= 200 && MANGLE.some((re) => re.test(s));
  const csvQuote = (s) => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    const s = String(v);
    if (/^'?[=+\-@\t\r]/.test(s)) return csvQuote("'" + s); // a text that starts like a formula is shown as plain text
    if (excelWouldMangle(s)) return csvQuote('="' + s.replace(/"/g, '""') + '"'); // ="627400000123": Excel shows it exactly as written
    return csvQuote(s);
  }
  function toCSV(rows) {
    // dates go out as 2026-10-01: Excel reads that the same way in every regional setting, day-first or month-first
    return '﻿' + [EXPORT_COLS.join(',')].concat(rows.map((r) => EXPORT_COLS.map((c) => (c === 'Date' && r._iso ? r._iso : csvCell(r[c]))).join(','))).join('\r\n') + '\r\n';
  }

  // ---------- sample data (clearly flagged as demo, removable) ----------
  function genSample(today, cfg) {
    let seed = 20261026;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const between = (a, b) => Math.round(a + rnd() * (b - a));
    const first = monthStart(monthKey(today));
    const txns = [];
    let n = 0;
    const add = (date, slot, type, acct, cat, desc, amt, mode, extra) => {
      txns.push({ id: 'demo' + (++n).toString(36), date, slot, type, acct, toAcct: '', cat, desc, amt, mode, ref: '', notes: '', group: '', demo: true, ts: n, ...(extra || {}) });
    };
    const catGroup = (id) => (cfg.cats.find((c) => c.id === id) || {}).group || '';
    for (let d = first; d <= today; d = addDays(d, 1)) {
      const day = parts(d).d;
      if (day === 1) { add(d, 'morning', 'income', 'a_hdfc', 'c_sal', 'Salary credit', 85000, 'NEFT/IMPS/RTGS'); add(d, 'afternoon', 'expense', 'a_hdfc', 'c_rent', 'House rent', 18000, 'NEFT/IMPS/RTGS', { group: 'needs' }); }
      if (day === 3) add(d, 'evening', 'investment', 'a_hdfc', 'c_sip', 'Monthly SIP', 10000, 'Auto-debit', { group: 'savings' });
      if (day === 5) add(d, 'morning', 'expense', 'a_hdfc', 'c_util', 'Electricity bill', 1350, 'UPI', { group: 'needs' });
      if (day === 6) add(d, 'afternoon', 'expense', 'a_uco', 'c_tel', 'Mobile and broadband', 1098, 'Auto-debit', { group: 'needs' });
      if (day === 8) { txns.push({ id: 'demo' + (++n).toString(36), date: d, slot: 'evening', type: 'transfer', acct: 'a_hdfc', toAcct: 'a_cash', cat: '', desc: 'Cash withdrawal', amt: 3000, mode: 'Cash', ref: '', notes: '', group: '', demo: true, ts: n }); }
      if (day === 10) add(d, 'night', 'transferout', 'a_hdfc', 'c_fam', 'Sent to parents', 8000, 'UPI', { group: 'needs' });
      if (rnd() < 0.8) add(d, 'morning', 'expense', 'a_hdfc', 'c_dine', 'Tea and breakfast', between(40, 140), 'UPI', { group: 'wants' });
      if (rnd() < 0.75) add(d, 'afternoon', 'expense', 'a_cash', 'c_dine', 'Lunch', between(90, 240), 'Cash', { group: 'wants' });
      if (day % 3 === 0) add(d, 'evening', 'expense', 'a_hdfc', 'c_groc', 'Vegetables and groceries', between(250, 1100), 'UPI', { group: 'needs' });
      if (rnd() < 0.35) add(d, 'evening', 'expense', 'a_hdfc', 'c_fuel', 'Petrol', between(300, 700), 'UPI', { group: 'needs' });
      if (rnd() < 0.3) add(d, 'night', 'expense', 'a_hdfc', 'c_dine', 'Dinner order', between(280, 650), 'UPI', { group: 'wants' });
      if (dow(d) === 0 && rnd() < 0.7) add(d, 'afternoon', 'expense', 'a_indian', 'c_shop', 'Online shopping', between(600, 2400), 'Net banking', { group: 'wants' });
    }
    const cov = coverageMap(txns, {});
    const marks = {};
    for (let d = first; d <= addDays(today, -3); d = addDays(d, 1)) missingSlots(cov, d).forEach((s) => (marks[d + '|' + s] = true));
    const legs = buildLegs(txns);
    const cfg2 = { ...cfg, start: first };
    const recDate = addDays(today, -1) < first ? first : addDays(today, -1);
    const hdfc = balanceAt(cfg2, legs, 'a_hdfc', recDate);
    const cash = balanceAt(cfg2, legs, 'a_cash', recDate);
    const recon = [
      { id: 'demor1', acct: 'a_hdfc', asOf: recDate, bal: hdfc, note: 'Sample statement balance', demo: true, ts: 1 },
      { id: 'demor2', acct: 'a_cash', asOf: recDate, bal: fromP(toP(cash) + 12000), note: 'Sample: cash count is ₹120 more', demo: true, ts: 2 },
    ];
    return { txns, marks, recon, start: first };
  }

  return {
    SLOTS, SLOT_IDS, slotLabel, slotForHour, TYPES, typeLabel, MODES, GROUPS, groupLabel, groupTag, KIND_LABEL, MONTHS, DOW,
    pad, ymd, parts, addDays, diffDays, isDate, daysInMonth, monthKey, monthStart, monthEnd, addMonths, dow, minD, maxD, localDate, isoWeek, cwLabel,
    monthLabel, monthShort, monthTag, dayLabel, dateLabel, dmy, fyOf, fyRange, fyLabel, fyMonths, makePeriod,
    toP, fromP, fmtINR, fmtCompact, fmtPct, parseAmt, defaultCfg, normCfg, acctMap, catMap, DEFAULT_CATS, DEFAULT_ACCOUNTS,
    normTxn, flatten, legsOf, buildLegs, spendGroup, summarize, elapsedDays, balanceAt, closing, reconcile, normRecon,
    coverageMap, missingSlots, gaps, normMarks, bucketStatus, fiftyThirtyTwenty, topCategories, monthlySeries, weeklySeries, dailySeries, bucketize,
    firstTracked, monthsElapsed, budgetRows, pace, planChecks, exportRows, EXPORT_COLS, toCSV, genSample, liveTxns, marksOf,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
