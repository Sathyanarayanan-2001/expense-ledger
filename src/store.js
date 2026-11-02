'use strict';
/* Storage on this device. The whole ledger is one object (see model.js) kept in IndexedDB.
   Sync (sync.js) copies that object to and from save files in a folder; nothing here touches the network. */
const Store = (function () {
  const DB_NAME = 'expense-ledger';
  const state = { cfg: null, cfgSaved: false, mode: 'connecting', error: '', loaded: { ledger: false, marks: false, settings: false, recon: false } };
  const subs = new Set(), hooks = new Set();
  let data = Model.empty(), version = 0, cache = null, db = null, lastU = 0, saving = Promise.resolve(), onError = () => {};
  let readyResolve; const readyP = new Promise((r) => (readyResolve = r));
  const today = () => Core.localDate(new Date());
  const emit = () => { version++; subs.forEach((f) => f()); };
  // update times never repeat or go backwards on one device, even for entries saved in the same millisecond
  const nextU = () => (lastU = Math.max(Date.now(), lastU + 1));

  // ---------- IndexedDB: one small key-value store ----------
  const idb = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    run(mode, fn) {
      return new Promise((res, rej) => {
        if (!db) return res(null);
        const t = db.transaction('kv', mode);
        const q = fn(t.objectStore('kv'));
        t.oncomplete = () => res(q && q.result);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('The browser stopped the save'));
      });
    },
    get: (k) => idb.run('readonly', (s) => s.get(k)),
    set: (k, v) => idb.run('readwrite', (s) => s.put(v, k)),
    del: (k) => idb.run('readwrite', (s) => s.delete(k)),
  };

  function fail(e, what) {
    const m = (e && e.message) || String(e || 'unknown error');
    state.error = what + ': ' + m;
    onError(what + ' failed. ' + m);
    emit();
  }
  function refresh() {
    state.cfg = Model.compose(data, today());
    state.cfgSaved = Model.hasCfg(data);
  }
  // saves are queued one after another; each writes the newest state
  function persist() {
    if (!db) return Promise.resolve();
    saving = saving.catch(() => {}).then(() => idb.set('data', data)).then(() => { if (state.error.startsWith('Saving')) { state.error = ''; emit(); } }, (e) => {
      fail(e, 'Saving on this device');
      throw e;
    });
    return saving;
  }
  // every change made on this device ends here
  function commit() {
    refresh();
    emit();
    const p = persist();
    hooks.forEach((f) => { try { f(); } catch (e) { /* a sync problem must not block saving */ } });
    return p;
  }

  async function init() {
    emit();
    try {
      db = await idb.open();
      data = Model.sanitize(await idb.get('data'));
      state.mode = 'local';
      // ask the browser not to clear this data when it is short of space (best effort)
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
    } catch (e) {
      db = null;
      state.mode = 'memory';
      state.error = 'This browser would not open its storage, so entries cannot be kept after you close the page.';
      onError(state.error + ' Download a backup from Setup before you leave.');
    }
    Object.keys(state.loaded).forEach((k) => (state.loaded[k] = true));
    refresh();
    readyResolve();
    emit();
  }

  function derive() {
    if (cache && cache.v === version) return cache;
    const cfg = state.cfg || Core.normCfg(null, today());
    const txns = Core.liveTxns(data.txns);
    const marks = Core.marksOf(data.marks);
    cache = { v: version, cfg, txns, legs: Core.buildLegs(txns), marks, cov: Core.coverageMap(txns, marks), recon: Core.normRecon(data.recon), byId: new Map(txns.map((t) => [t.id, t])) };
    return cache;
  }

  // A saved entry holds only the fields that have a value.
  function compact(t, u) {
    const o = { date: t.date, slot: t.slot, type: t.type, acct: t.acct, amt: t.amt, ts: t.ts || Date.now(), u };
    ['toAcct', 'cat', 'desc', 'mode', 'ref', 'notes', 'group'].forEach((k) => { if (t[k]) o[k] = t[k]; });
    if (t.demo) o.demo = true;
    return o;
  }
  async function guard(what, fn) {
    try { return await fn(); } catch (e) { if (!state.error) fail(e, what); throw e; }
  }

  async function putTxns(list) {
    return guard('Saving entries', async () => {
      await readyP;
      list.forEach((t) => { data.txns[t.id] = compact(t, nextU()); });
      return commit();
    });
  }
  async function removeTxns(ids) {
    return guard('Deleting entries', async () => {
      await readyP;
      ids.forEach((id) => { if (data.txns[id] && !data.txns[id].d) data.txns[id] = { d: 1, u: nextU() }; });
      return commit();
    });
  }
  async function setMarks(map, demo) { // map: {'YYYY-MM-DD|slot': true|false}
    return guard('Saving no-spend marks', async () => {
      await readyP;
      Object.keys(map).forEach((k) => { data.marks[k] = { v: map[k] ? (demo ? 'demo' : true) : false, u: nextU() }; });
      return commit();
    });
  }
  async function putRecon(e) {
    return guard('Saving statement balance', async () => {
      await readyP;
      data.recon[e.id] = { acct: e.acct, asOf: e.asOf, bal: e.bal, note: e.note || '', demo: !!e.demo, ts: e.ts || Date.now(), u: nextU() };
      return commit();
    });
  }
  async function removeRecon(ids) {
    return guard('Removing statement balance', async () => {
      await readyP;
      ids.forEach((id) => { if (data.recon[id] && !data.recon[id].d) data.recon[id] = { d: 1, u: nextU() }; });
      return commit();
    });
  }
  function setCfg(next) {
    Model.applyCfg(data, next, nextU(), today());
    commit().catch(() => {});
    return true;
  }
  const flushCfg = () => saving.catch(() => {});
  const flushIfDirty = () => { /* every change is saved as it is made */ };

  async function loadSample() {
    const d = derive();
    const s = Core.genSample(today(), d.cfg);
    await putTxns(s.txns);
    const mk = {}; Object.keys(s.marks).forEach((k) => (mk[k] = true));
    await setMarks(mk, true);
    for (const r of s.recon) await putRecon(r);
    return s.txns.length;
  }
  async function removeSample() {
    const d = derive();
    const ids = d.txns.filter((t) => t.demo).map((t) => t.id);
    if (ids.length) await removeTxns(ids);
    const mk = {};
    Object.keys(data.marks).forEach((k) => { if (data.marks[k].v === 'demo') mk[k] = false; });
    if (Object.keys(mk).length) await setMarks(mk);
    const rids = d.recon.filter((r) => r.demo).map((r) => r.id);
    if (rids.length) await removeRecon(rids);
    return ids.length;
  }

  // ---------- backup, restore and sync ----------
  const ENVELOPE = 'expense-ledger';
  const backup = () => ({ app: ENVELOPE, v: 1, savedAt: new Date().toISOString(), data });
  // Merge data from another copy (a save file or a backup). Records already here stay unless the other copy is newer.
  async function absorb(remote) {
    await readyP;
    const m = Model.merge(data, remote);
    if (m.localChanged) {
      data = m.data;
      refresh();
      emit();
      await persist();
    }
    return { changed: m.localChanged, behind: m.remoteBehind };
  }
  async function restore(json) {
    if (!json || json.app !== ENVELOPE || typeof json.data !== 'object') throw new Error('That file is not a backup from this app.');
    if (json.v > 1) throw new Error('That backup comes from a newer version of the app. Reload the page and try again.');
    const before = Model.counts(data);
    const r = await absorb(json.data);
    const after = Model.counts(data);
    return { changed: r.changed, added: after.entries - before.entries, entries: after.entries };
  }

  const uid = () => {
    let r = '';
    try { const a = new Uint32Array(2); crypto.getRandomValues(a); r = a[0].toString(36) + a[1].toString(36); } catch (e) { r = Math.random().toString(36).slice(2, 10); }
    return Date.now().toString(36) + r.slice(0, 6);
  };

  return {
    state, init, derive, putTxns, removeTxns, setMarks, putRecon, removeRecon, setCfg, flushCfg, flushIfDirty, loadSample, removeSample, uid, today,
    backup, restore, absorb, getData: () => data, kv: idb,
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    onChange: (f) => { hooks.add(f); },
    onError: (f) => { onError = f; },
    ready: () => readyP,
  };
})();
