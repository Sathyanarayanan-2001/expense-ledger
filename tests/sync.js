'use strict';
// Stored data and merging: what two devices must agree on. Expected values are worked out by hand.
global.Core = require('../src/core.js');
const Model = require('../src/model.js');
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL', name, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)); }
};
const TODAY = '2026-11-02';
const tx = (date, amt, u, o) => ({ date, slot: 'morning', type: 'expense', acct: 'a_hdfc', amt, ts: u, u, ...o });
const dataWith = (txns, extra) => { const d = Model.empty(); d.txns = txns; return Object.assign(d, extra || {}); };
const live = (d) => Core.liveTxns(d.txns).map((t) => t.id + ':' + t.amt);

// ---------- one record: the newer edit wins ----------
{
  const a = dataWith({ x: tx('2026-10-01', 100, 10) });
  const b = dataWith({ x: tx('2026-10-01', 150, 20) });
  const m = Model.merge(a, b);
  eq('newer edit wins on the receiving side', [live(m.data), m.localChanged, m.remoteBehind], [['x:150'], true, false]);
  const m2 = Model.merge(b, a);
  eq('older copy does not replace a newer one, and the other side is behind', [live(m2.data), m2.localChanged, m2.remoteBehind], [['x:150'], false, true]);
  eq('merging identical copies changes nothing', [Model.merge(a, a).localChanged, Model.merge(a, a).remoteBehind], [false, false]);
}
// ---------- deletions travel as tombstones ----------
{
  const a = dataWith({ x: tx('2026-10-01', 100, 10), y: tx('2026-10-02', 5, 10) });
  const b = dataWith({ x: { d: 1, u: 30 } });
  eq('a newer deletion removes the entry', live(Model.merge(a, b).data), ['y:5']);
  const c = dataWith({ x: tx('2026-10-01', 120, 40) });
  eq('an edit made after the deletion brings the entry back', live(Model.merge(Model.merge(a, b).data, c).data), ['x:120', 'y:5']);
  const e = dataWith({ x: { d: 1, u: 5 } });
  eq('a deletion older than the edit loses', live(Model.merge(a, e).data), ['x:100', 'y:5']);
  eq('a deleted entry is not counted', Model.counts(Model.merge(a, b).data), { entries: 1, balances: 0 });
}
// ---------- ties settle the same way on both devices ----------
{
  const a = dataWith({ x: tx('2026-10-01', 100, 10) });
  const b = dataWith({ x: tx('2026-10-01', 200, 10) });
  eq('equal times: both devices pick the same record', [live(Model.merge(a, b).data), live(Model.merge(b, a).data)], [live(Model.merge(b, a).data), live(Model.merge(b, a).data)]);
}
// ---------- marks and balance checks ----------
{
  const a = Model.empty(); a.marks['2026-10-01|night'] = { v: true, u: 5 }; a.recon.r1 = { acct: 'a_hdfc', asOf: '2026-10-31', bal: 100, u: 5 };
  const b = Model.empty(); b.marks['2026-10-01|night'] = { v: false, u: 9 }; b.recon.r1 = { d: 1, u: 9 };
  const m = Model.merge(a, b).data;
  eq('a mark switched off later stays off', Core.marksOf(m.marks), {});
  eq('a deleted balance check is gone', Core.normRecon(m.recon), []);
  const m2 = Model.merge(b, a).data;
  eq('same result from the other side', [Core.marksOf(m2.marks), Core.normRecon(m2.recon)], [{}, []]);
}
// ---------- sanitising whatever a file contains ----------
{
  eq('null becomes empty', Model.sanitize(null), Model.empty());
  eq('a string becomes empty', Model.sanitize('hello'), Model.empty());
  eq('an array becomes empty', Model.sanitize([1, 2]), Model.empty());
  const s = Model.sanitize({ txns: { a: { date: '2026-10-01', u: '7' }, b: 'junk', c: null }, marks: [], cfg: { base: 'x', accts: { z: 5 } } });
  eq('bad pieces dropped, update time becomes a number', [Object.keys(s.txns), s.txns.a.u, s.marks, s.cfg.base, s.cfg.accts], [['a'], 7, {}, null, {}]);
  eq('a record with no update time counts as the oldest', Model.merge(dataWith({ x: { ...tx('2026-10-01', 1, 0), u: undefined } }), dataWith({ x: tx('2026-10-01', 2, 1) })).data.txns.x.amt, 2);
}

// ---------- properties on random data: merging is order-free ----------
{
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const make = () => {
    const d = Model.empty();
    for (let i = 0; i < 12; i++) {
      const id = 'e' + rnd(8), u = 1 + rnd(6);
      d.txns[id] = rnd(4) === 0 ? { d: 1, u } : tx('2026-10-0' + (1 + rnd(8)), 10 * (1 + rnd(9)), u);
    }
    for (let i = 0; i < 5; i++) d.marks['2026-10-0' + (1 + rnd(5)) + '|night'] = { v: rnd(2) === 0, u: 1 + rnd(6) };
    for (let i = 0; i < 3; i++) d.recon['r' + rnd(3)] = rnd(3) === 0 ? { d: 1, u: 1 + rnd(6) } : { acct: 'a_hdfc', asOf: '2026-10-31', bal: rnd(100), u: 1 + rnd(6) };
    ['accts', 'cats', 'budgets'].forEach((k) => { for (let i = 0; i < 3; i++) d.cfg[k]['k' + rnd(4)] = { v: rnd(50), u: 1 + rnd(6) }; });
    if (rnd(2)) d.cfg.base = { v: { start: '2026-04-01', n: rnd(9) }, u: 1 + rnd(6) };
    return d;
  };
  let comm = 0, idem = 0, assoc = 0, absorb = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const a = make(), b = make(), c = make();
    const same = Model.same; // the same records, whatever order their keys are in
    if (same(Model.merge(a, b).data, Model.merge(b, a).data)) comm++;
    const ab = Model.merge(a, b).data;
    if (same(Model.merge(ab, ab).data, ab) && !Model.merge(ab, ab).localChanged) idem++;
    if (same(Model.merge(Model.merge(a, b).data, c).data, Model.merge(a, Model.merge(b, c).data).data)) assoc++;
    // after merging, the other side has nothing more to teach us, and nothing newer is lost
    const m = Model.merge(a, b);
    if (!Model.merge(m.data, b).localChanged && !Model.merge(m.data, a).localChanged) absorb++;
  }
  eq('merge is commutative on ' + N + ' random pairs', comm, N);
  eq('merge is idempotent', idem, N);
  eq('merge is associative', assoc, N);
  eq('a merged copy has already absorbed both inputs', absorb, N);
}

// ---------- settings ----------
{
  const d = Model.empty();
  const base = Model.compose(d, TODAY);
  eq('empty data gives the built-in settings', [base.start, base.accounts.length, base.cats.length, Model.hasCfg(d)], [Core.defaultCfg().start, 4, Core.DEFAULT_CATS.length, false]);
  const next = JSON.parse(JSON.stringify(base));
  next.start = '2026-04-01'; next.accounts[0].opening = 25000; next.budgets.c_rent = 15000;
  Model.applyCfg(d, next, 100, TODAY);
  const c = Model.compose(d, TODAY);
  eq('a settings change reads back', [c.start, c.accounts[0].opening, c.budgets, Model.hasCfg(d)], ['2026-04-01', 25000, { c_rent: 15000 }, true]);
  eq('only changed items get the new time; defaults are saved as the oldest', [d.cfg.base.u, d.cfg.accts.a_hdfc.u, d.cfg.accts.a_uco.u, d.cfg.budgets.c_rent.u, Object.keys(d.cfg.cats).length], [100, 100, 1, 100, 0]);
  eq('account order is kept', c.accounts.map((a) => a.id), ['a_hdfc', 'a_uco', 'a_indian', 'a_cash']);
}
{
  // two devices start from the same saved settings and change different things
  const seed = Model.empty();
  const s0 = Model.compose(seed, TODAY); s0.start = '2026-04-01';
  Model.applyCfg(seed, s0, 10, TODAY);
  const laptop = JSON.parse(JSON.stringify(seed)), phone = JSON.parse(JSON.stringify(seed));
  const l = Model.compose(laptop, TODAY); l.budgets.c_groc = 8000; l.accounts[1].opening = 700; Model.applyCfg(laptop, l, 50, TODAY);
  const p = Model.compose(phone, TODAY); p.budgets.c_dine = 2000; p.targets.needs = 45; p.targets.wants = 35; Model.applyCfg(phone, p, 60, TODAY);
  const both = Model.compose(Model.merge(laptop, phone).data, TODAY);
  eq('changes to different settings both survive', [both.budgets, both.accounts[1].opening, both.targets.needs, both.targets.wants], [{ c_dine: 2000, c_groc: 8000 }, 700, 45, 35]);
  eq('same result from either side', Model.same(Model.compose(Model.merge(phone, laptop).data, TODAY), both), true);
  const l2 = Model.compose(laptop, TODAY); l2.budgets.c_groc = 9000; Model.applyCfg(laptop, l2, 70, TODAY);
  const p2 = Model.compose(phone, TODAY); p2.budgets.c_groc = 7000; Model.applyCfg(phone, p2, 80, TODAY);
  eq('the same budget edited on both: the newer edit wins', Model.compose(Model.merge(laptop, phone).data, TODAY).budgets.c_groc, 7000);
  const cleared = Model.compose(laptop, TODAY); delete cleared.budgets.c_groc; Model.applyCfg(laptop, cleared, 90, TODAY);
  eq('a budget removed later is removed everywhere', Model.compose(Model.merge(phone, laptop).data, TODAY).budgets.c_groc, undefined);
}
{
  // a device that was never configured must not wipe the settings made elsewhere
  const configured = Model.empty();
  const c0 = Model.compose(configured, TODAY); c0.start = '2026-04-01'; c0.accounts[0].opening = 9000; c0.accounts[0].name = 'HDFC Savings';
  Model.applyCfg(configured, c0, 500, TODAY);
  const fresh = Model.empty();
  const f = Model.compose(fresh, TODAY); f.budgets.c_rent = 12000; Model.applyCfg(fresh, f, 900, TODAY); // first edit on a fresh device
  const merged = Model.compose(Model.merge(fresh, configured).data, TODAY);
  eq('a fresh device keeps the configured accounts and start date', [merged.start, merged.accounts[0].name, merged.accounts[0].opening, merged.budgets.c_rent], ['2026-04-01', 'HDFC Savings', 9000, 12000]);
}
{
  // new account and category on two devices, and the order that results
  const a = Model.empty(), b = Model.empty();
  const ca = Model.compose(a, TODAY); ca.accounts.push({ id: 'x_sbi', name: 'SBI Card', kind: 'card', opening: -500, active: true }); Model.applyCfg(a, ca, 100, TODAY);
  const cb = Model.compose(b, TODAY); cb.accounts.push({ id: 'x_icici', name: 'ICICI', kind: 'bank', opening: 0, active: true }); Model.applyCfg(b, cb, 110, TODAY);
  const names = Model.compose(Model.merge(a, b).data, TODAY).accounts.map((x) => x.id);
  eq('an account added on each device: both appear', [names.includes('x_sbi'), names.includes('x_icici'), names.length], [true, true, 6]);
  eq('both devices list them in the same order', Model.compose(Model.merge(b, a).data, TODAY).accounts.map((x) => x.id), names);
}

// ---------- moving the earlier shared-database data across ----------
{
  const legacy = {
    months: { '2026-04': { a1: { date: '2026-04-01', slot: 'evening', type: 'expense', acct: 'a_hdfc', amt: 220, cat: 'c_misc', ts: 5 } }, '2026-05': { b1: { date: '2026-05-02', slot: 'morning', type: 'income', acct: 'a_uco', amt: 900, ts: 6 } } },
    marksMonths: { '2026-04': { '2026-04-01|night': true, '2026-04-02|night': false } },
    recon: { r1: { acct: 'a_hdfc', asOf: '2026-04-30', bal: 5, note: '', demo: false, ts: 7 } },
    settings: { start: '2026-04-01', accounts: [{ id: 'a_uco', name: 'UCO', kind: 'bank', opening: 10, active: true }, { id: 'a_hdfc', name: 'HDFC', kind: 'bank', opening: 20, active: true }], cats: Core.DEFAULT_CATS, budgets: { c_rent: 100, c_groc: 0 }, targets: { needs: 50, wants: 30, savings: 20 }, plannedIncome: 0 },
  };
  const d = Model.fromLegacy(legacy, 1000);
  eq('entries carry across', Core.liveTxns(d.txns).map((t) => t.id + ':' + t.amt + ':' + t.date), ['a1:220:2026-04-01', 'b1:900:2026-05-02']);
  eq('marks carry across, switched-off ones dropped', Core.marksOf(d.marks), { '2026-04-01|night': true });
  eq('balance checks carry across', Core.normRecon(d.recon).map((r) => r.id + ':' + r.bal), ['r1:5']);
  const c = Model.compose(d, TODAY);
  eq('settings carry across in their order', [c.start, c.accounts.map((a) => a.id + ':' + a.opening), c.budgets, c.cats.length], ['2026-04-01', ['a_uco:10', 'a_hdfc:20'], { c_rent: 100 }, Core.DEFAULT_CATS.length]);
  eq('the converted data is already clean', Model.sanitize(d), d);
  // the data a backup holds survives a text round trip and a merge into an empty device
  const viaJson = JSON.parse(JSON.stringify({ app: 'expense-ledger', v: 1, data: d })).data;
  const onNew = Model.merge(Model.empty(), viaJson);
  eq('an empty device takes everything', [onNew.localChanged, Model.counts(onNew.data), Model.compose(onNew.data, TODAY).accounts.map((a) => a.id)], [true, { entries: 2, balances: 1 }, ['a_uco', 'a_hdfc']]);
  eq('restoring the same backup twice changes nothing', Model.merge(onNew.data, viaJson).localChanged, false);
}

// ---------- size ----------
{
  const big = Model.empty(), other = Model.empty();
  for (let i = 0; i < 5000; i++) { big.txns['t' + i] = tx('2026-10-' + String(1 + (i % 28)).padStart(2, '0'), i + 1, 100 + i); if (i % 2) other.txns['t' + i] = tx('2026-10-01', 1, 50); }
  const t0 = Date.now(); const m = Model.merge(other, big); const ms = Date.now() - t0;
  eq('5,000 entries merge', [Model.counts(m.data).entries, ms < 1500], [5000, true]);
}

console.log('sync tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
