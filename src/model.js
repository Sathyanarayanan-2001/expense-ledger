'use strict';
/* Stored data model and merge. Pure functions: no DOM and no storage, so they run in Node tests too.

   Everything the app stores lives in one object, so a device can save it to a file and another device can merge it:

     txns    id -> entry
     marks   'YYYY-MM-DD|slot' -> { v }          v is true, 'demo' or false
     recon   id -> bank balance check
     cfg     settings, kept as separate items so two devices can change different things:
             base (start date, planned income, targets), accts and cats (by id), budgets (by category id),
             order (the order of accounts and categories)

   Every record carries u, its last update time. When two copies of a record meet, the newer u wins.
   A deleted entry or balance check stays behind as { d: 1, u } so the deletion reaches the other devices too. */
const Model = (function () {
  const TABLES = ['txns', 'marks', 'recon'];
  const SECTIONS = ['accts', 'cats', 'budgets'];
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  const empty = () => ({ txns: {}, marks: {}, recon: {}, cfg: { base: null, accts: {}, cats: {}, budgets: {}, order: null } });

  // Make any parsed JSON safe to use: wrong shapes are dropped, update times become numbers.
  function sanitize(raw) {
    const out = empty();
    if (!isObj(raw)) return out;
    TABLES.forEach((t) => {
      const src = isObj(raw[t]) ? raw[t] : {};
      Object.keys(src).forEach((id) => { if (isObj(src[id])) out[t][id] = { ...src[id], u: num(src[id].u) }; });
    });
    const c = isObj(raw.cfg) ? raw.cfg : {};
    ['base', 'order'].forEach((k) => { if (isObj(c[k]) && isObj(c[k].v)) out.cfg[k] = { v: c[k].v, u: num(c[k].u) }; });
    SECTIONS.forEach((k) => {
      const src = isObj(c[k]) ? c[k] : {};
      Object.keys(src).forEach((id) => { if (isObj(src[id]) && 'v' in src[id]) out.cfg[k][id] = { v: src[id].v, u: num(src[id].u) }; });
    });
    return out;
  }

  // ---------- merge ----------
  // text form with the keys in a fixed order, so equal records always compare equal
  const canon = (x) => JSON.stringify(x, (k, v) => (isObj(v) ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v));
  const same = (x, y) => x === y || canon(x) === canon(y);
  // The newer record wins. On an exact tie the larger text wins, so every device settles on the same record.
  function pick(x, y) {
    if (!x) return y;
    if (!y) return x;
    const ux = num(x.u), uy = num(y.u);
    if (ux !== uy) return ux > uy ? x : y;
    return canon(x) >= canon(y) ? x : y;
  }
  function mergeMap(a, b, flags) {
    const out = { ...a };
    Object.keys(b).forEach((k) => {
      const w = pick(a[k], b[k]);
      out[k] = w;
      if (!same(w, a[k])) flags.localChanged = true;
    });
    Object.keys(out).forEach((k) => { if (!same(out[k], b[k])) flags.remoteBehind = true; });
    return out;
  }
  function mergeOne(a, b, flags) {
    const w = pick(a, b);
    if (!same(w, a)) flags.localChanged = true;
    if (!same(w, b)) flags.remoteBehind = true;
    return w || null;
  }
  // Returns the merged data, whether this device learnt something new, and whether the other copy is behind.
  function merge(local, remote) {
    const a = sanitize(local), b = sanitize(remote);
    const flags = { localChanged: false, remoteBehind: false };
    const out = empty();
    TABLES.forEach((t) => { out[t] = mergeMap(a[t], b[t], flags); });
    out.cfg.base = mergeOne(a.cfg.base, b.cfg.base, flags);
    out.cfg.order = mergeOne(a.cfg.order, b.cfg.order, flags);
    SECTIONS.forEach((k) => { out.cfg[k] = mergeMap(a.cfg[k], b.cfg[k], flags); });
    return { data: out, localChanged: flags.localChanged, remoteBehind: flags.remoteBehind };
  }

  // ---------- settings: items to the settings object the app uses, and back ----------
  const baseOf = (cfg) => ({ start: cfg.start, plannedIncome: Number(cfg.plannedIncome) || 0, targets: { needs: Number(cfg.targets.needs) || 0, wants: Number(cfg.targets.wants) || 0, savings: Number(cfg.targets.savings) || 0 } });
  // Items are listed in the saved order; anything the order does not know yet (added on another device) follows, by id.
  function arrange(items, ids) {
    const have = Object.keys(items);
    const first = (ids || []).filter((id) => have.includes(id));
    return first.concat(have.filter((id) => !first.includes(id)).sort()).map((id) => items[id].v);
  }
  function compose(data, today) {
    const c = (data && data.cfg) || empty().cfg;
    const raw = {};
    if (c.base) Object.assign(raw, c.base.v);
    const ord = (c.order && c.order.v) || {};
    if (Object.keys(c.accts).length) raw.accounts = arrange(c.accts, ord.accts);
    if (Object.keys(c.cats).length) raw.cats = arrange(c.cats, ord.cats);
    const budgets = {};
    Object.keys(c.budgets).sort().forEach((id) => { const v = Number(c.budgets[id].v); if (v > 0) budgets[id] = v; });
    raw.budgets = budgets;
    return Core.normCfg(raw, today);
  }
  const hasCfg = (data) => { const c = data.cfg; return !!(c.base || c.order || SECTIONS.some((k) => Object.keys(c[k]).length)); };

  // Store a settings change as items. Only items that really changed get a new time, so a device that never
  // touched a setting can never overwrite another device's change to it.
  function applyCfg(data, next, now, today) {
    const cur = compose(data, today);
    const nxt = Core.normCfg(next, today);
    const c = data.cfg;
    const curOrder = { accts: cur.accounts.map((x) => x.id), cats: cur.cats.map((x) => x.id) };
    const nxtOrder = { accts: nxt.accounts.map((x) => x.id), cats: nxt.cats.map((x) => x.id) };
    if (!same(baseOf(cur), baseOf(nxt))) c.base = { v: baseOf(nxt), u: now };
    const lists = { accts: [cur.accounts, nxt.accounts], cats: [cur.cats, nxt.cats] };
    let seeded = false;
    Object.keys(lists).forEach((sec) => {
      const [was, will] = lists[sec];
      const wasById = new Map(was.map((x) => [x.id, x]));
      const changed = will.filter((x) => !same(wasById.get(x.id), x));
      if (!changed.length) return;
      // first change to a section that still shows built-in defaults: save the defaults too, as the oldest version,
      // so that anything saved on another device beats them
      if (!Object.keys(c[sec]).length) { was.forEach((x) => { c[sec][x.id] = { v: x, u: 1 }; }); seeded = true; }
      changed.forEach((x) => { c[sec][x.id] = { v: x, u: now }; });
    });
    Object.keys(Object.assign({}, cur.budgets, nxt.budgets)).forEach((id) => {
      const was = Number(cur.budgets[id]) || 0, will = Number(nxt.budgets[id]) || 0;
      if (was !== will) c.budgets[id] = { v: will, u: now };
    });
    if (!same(curOrder, nxtOrder)) c.order = { v: nxtOrder, u: now };
    else if (seeded && !c.order) c.order = { v: curOrder, u: 1 };
    return data;
  }

  // ---------- data from the earlier shared-database version of this app ----------
  // months: 'YYYY-MM' -> items; marksMonths: 'YYYY-MM' -> { key: true }; settings: the old settings document.
  function fromLegacy(legacy, now) {
    const out = empty();
    Object.keys(legacy.months || {}).forEach((ym) => {
      const items = legacy.months[ym] || {};
      Object.keys(items).forEach((id) => { if (items[id]) out.txns[id] = { ...items[id], u: now }; });
    });
    Object.keys(legacy.marksMonths || {}).forEach((ym) => {
      const m = legacy.marksMonths[ym] || {};
      Object.keys(m).forEach((k) => { if (m[k]) out.marks[k] = { v: m[k], u: now }; });
    });
    const ri = legacy.recon || {};
    Object.keys(ri).forEach((id) => { if (ri[id]) out.recon[id] = { ...ri[id], u: now }; });
    if (legacy.settings) {
      const cfg = Core.normCfg(legacy.settings, '2026-01-01');
      out.cfg.base = { v: baseOf(cfg), u: now };
      cfg.accounts.forEach((x) => { out.cfg.accts[x.id] = { v: x, u: now }; });
      cfg.cats.forEach((x) => { out.cfg.cats[x.id] = { v: x, u: now }; });
      Object.keys(cfg.budgets).forEach((id) => { if (Number(cfg.budgets[id]) > 0) out.cfg.budgets[id] = { v: Number(cfg.budgets[id]), u: now }; });
      out.cfg.order = { v: { accts: cfg.accounts.map((x) => x.id), cats: cfg.cats.map((x) => x.id) }, u: now };
    }
    return out;
  }

  const counts = (data) => ({
    entries: Object.keys(data.txns).filter((k) => !data.txns[k].d).length,
    balances: Object.keys(data.recon).filter((k) => !data.recon[k].d).length,
  });

  return { empty, sanitize, merge, pick, same, compose, applyCfg, hasCfg, fromLegacy, counts };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Model;
