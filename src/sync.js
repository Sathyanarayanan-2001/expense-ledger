'use strict';
/* Sync between devices. Each device keeps its own copy (store.js). You choose a folder, and the app writes save files
   into it. OneDrive (or any sync app that mirrors a folder) carries the files between devices. When the app opens, and
   whenever you come back to it, it merges every save it has not read yet, record by record, newest edit wins. */
const KEEP = 3;
const SAVE_PREFIX = 'ledger-save-';
const SAVE_FILE = /^ledger-save-.+\.json(\.gz)?$/;
const deviceId = Prefs.get('device', null) || (() => { const d = Store.uid().slice(-5); Prefs.set('device', d); return d; })();

async function gz(text) {
  if (!window.CompressionStream) return new Blob([text]);
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
async function gunzip(blob, name) {
  if (!name.endsWith('.gz')) return blob.text();
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
const saveName = () => SAVE_PREFIX + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + deviceId + '.json' + (window.CompressionStream ? '.gz' : '');

const Folder = {
  dir: null,
  supported: () => !!window.showDirectoryPicker,
  async pick() {
    this.dir = await window.showDirectoryPicker({ id: 'expense-ledger', mode: 'readwrite' });
    await Store.kv.set('dirHandle', this.dir);
    return true;
  },
  async resume(interactive) {
    this.dir = this.dir || await Store.kv.get('dirHandle');
    if (!this.dir) return false;
    let p = await this.dir.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted' && interactive) p = await this.dir.requestPermission({ mode: 'readwrite' });
    return p === 'granted';
  },
  async list() {
    const out = [];
    for await (const [name, handle] of this.dir.entries()) {
      if (handle.kind !== 'file' || !SAVE_FILE.test(name)) continue;
      const file = await handle.getFile();
      out.push({ name, stamp: name + ':' + file.lastModified + ':' + file.size, file });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  },
  async write(name, blob) { const h = await this.dir.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(blob); await w.close(); },
  async remove(name) { await this.dir.removeEntry(name); },
  disconnect() { this.dir = null; return Store.kv.del('dirHandle'); },
};

const Sync = {
  state: 'off', msg: '', lastAt: Prefs.get('lastSync', null), sessionFile: null, seen: new Set(), timer: null, busy: false, dirty: !!Prefs.get('dirty', false),
  onChange: () => {},
  set(state, msg) { this.state = state; this.msg = msg || ''; this.onChange(); },
  enabled: () => Prefs.get('syncMode', null) === 'folder',
  async start() {
    if (!this.enabled() || !Folder.supported()) { this.set('off'); return; }
    if (!(await Folder.resume(false))) { this.set('reconnect', 'Allow folder access to sync'); return; }
    await this.pull();
  },
  // Merge every save not read yet, so nothing is missed when a sync app delivers files late.
  async absorbAll(list) {
    for (const f of list) {
      if (f.name === this.sessionFile || this.seen.has(f.stamp)) continue;
      try {
        const remote = JSON.parse(await gunzip(f.file, f.name));
        if (!remote || remote.app !== 'expense-ledger' || typeof remote.data !== 'object') { this.seen.add(f.stamp); continue; }
        const r = await Store.absorb(remote.data);
        this.seen.add(f.stamp);
        if (r.behind) this.markDirty();
      } catch (e) { /* a file still being delivered: try it next time */ }
    }
  },
  async pull() {
    if (!Folder.dir || this.busy) return;
    this.busy = true; this.set('working', 'Loading the latest save');
    try { await this.absorbAll(await Folder.list()); this.finish(); } catch (e) { this.fail(e); } finally { this.busy = false; }
    if (this.dirty) await this.push();
  },
  markDirty() { this.dirty = true; Prefs.set('dirty', true); },
  // called after every change made on this device
  changed() {
    this.markDirty();
    clearTimeout(this.timer);
    if (Folder.dir && ['ok', 'pending', 'error'].includes(this.state)) {
      this.timer = setTimeout(() => this.push(), 3000);
      this.set('pending', 'Changes waiting to save');
    }
  },
  async push() {
    if (!Folder.dir || this.busy) return;
    this.busy = true; this.set('working', 'Saving');
    try {
      const list = await Folder.list();
      await this.absorbAll(list);
      const name = this.sessionFile || saveName();
      // Clear the flag before the copy is taken: a change made while the file is being written sets it again.
      this.dirty = false; Prefs.set('dirty', false);
      const body = JSON.stringify({ app: 'expense-ledger', v: 1, device: deviceId, savedAt: new Date().toISOString(), data: Store.getData() });
      await Folder.write(name, await gz(body));
      this.sessionFile = name;
      const names = [...new Set([name, ...list.map((f) => f.name)])].sort().reverse();
      for (const old of names.slice(KEEP)) await Folder.remove(old);
      this.finish();
    } catch (e) { this.markDirty(); this.fail(e); } finally { this.busy = false; }
    if (this.dirty && this.state === 'ok') { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 3000); this.set('pending', 'Changes waiting to save'); }
  },
  finish() { this.lastAt = Date.now(); Prefs.set('lastSync', this.lastAt); this.set('ok', ''); },
  fail(e) {
    if (e && e.name === 'NotAllowedError') { this.set('reconnect', 'Allow folder access to sync'); return; }
    this.set('error', (e && e.message) || 'Something went wrong');
  },
  async connect() { await Folder.pick(); Prefs.set('syncMode', 'folder'); this.dirty = true; await this.pull(); },
  async reconnect() { if (await Folder.resume(true)) { await this.pull(); } },
  stop() { Folder.disconnect(); clearTimeout(this.timer); Prefs.set('syncMode', null); this.sessionFile = null; this.seen = new Set(); this.set('off'); },
};
Store.onChange(() => Sync.changed());
document.addEventListener('visibilitychange', () => {
  if (!Folder.dir || ['reconnect', 'off'].includes(Sync.state)) return;
  if (document.hidden) { if (Sync.dirty) { clearTimeout(Sync.timer); Sync.push(); } } else Sync.pull();
});
