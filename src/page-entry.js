'use strict';
/* Add entries: day + slot picker, draft rows, day summary, calendar and catch-up list. */
function firstAcct() { const a = Store.derive().cfg.accounts.filter((x) => x.active && !Core.isHolding(x)); return a.length ? a[0].id : ''; }
function newDraft(o) {
  const d = Store.derive();
  const last = Prefs.get('lastEntry', {});
  const acct = last.acct && d.cfg.accounts.some((a) => a.id === last.acct && a.active) ? last.acct : firstAcct();
  return { id: Store.uid(), type: 'expense', acct, toAcct: '', cat: '', desc: '', amt: '', mode: last.mode || 'UPI', ref: '', notes: '', group: '', date: null, slot: null, showWhen: false, err: {}, touched: {}, ...(o || {}) };
}
const effWhen = (dr) => ({ date: dr.date || ui.entry.date, slot: dr.slot || ui.entry.slot });
const KIND_OF_TYPE = { expense: 'expense', income: 'income', investment: 'investment', transferout: 'transferout' };
function catOptions(kind, selectedId) {
  const cfg = Store.derive().cfg;
  const list = cfg.cats.filter((c) => c.kind === kind && (c.active || c.id === selectedId));
  const opt = (c) => ({ value: c.id, label: c.name + (c.active ? '' : ' (archived)') });
  const first = { value: '', label: 'Choose…' };
  if (kind === 'expense' || kind === 'transferout') {
    const out = [first];
    Core.GROUPS.forEach((g) => { const items = list.filter((c) => c.group === g.id).map(opt); if (items.length) out.push({ group: g.label, items }); });
    return out;
  }
  return [first].concat(list.map(opt));
}
function groupFor(dr) {
  const cfg = Store.derive().cfg; const c = Core.catMap(cfg)[dr.cat];
  if (dr.type === 'investment') return 'savings';
  if (dr.type === 'expense') return dr.group === 'needs' || dr.group === 'wants' ? dr.group : c && (c.group === 'needs' || c.group === 'wants') ? c.group : 'wants';
  if (dr.type === 'transferout') return Core.GROUPS.some((g) => g.id === dr.group) ? dr.group : c && c.group ? c.group : 'needs';
  return '';
}
function draftErrors(dr) {
  const e = {};
  if (!(Core.parseAmt(dr.amt) > 0)) e.amt = 'Enter an amount above zero, like 250 or 120+80';
  if (!dr.acct) e.acct = 'Choose an account';
  if (dr.type === 'transfer') { if (!dr.toAcct) e.toAcct = 'Choose the receiving account'; else if (dr.toAcct === dr.acct) e.toAcct = 'Pick a different account'; }
  else if (!dr.cat) e.cat = 'Choose a category';
  const w = effWhen(dr);
  if (!Core.isDate(w.date)) e.date = 'Enter a valid date'; else if (w.date > today()) e.date = 'Future dates are not allowed';
  return e;
}
const isBlankDraft = (dr) => !String(dr.amt).trim() && !dr.desc.trim() && !dr.ref.trim() && !dr.notes.trim();
function toTxn(dr) {
  const w = effWhen(dr);
  return { id: dr.editId || dr.txnId || (dr.txnId = Store.uid()), date: w.date, slot: w.slot, type: dr.type, acct: dr.acct, toAcct: dr.type === 'transfer' ? dr.toAcct : '', cat: dr.type === 'transfer' ? '' : dr.cat, desc: dr.desc.trim(), amt: Core.parseAmt(dr.amt), mode: dr.mode, ref: dr.ref.trim(), notes: dr.notes.trim(), group: groupFor(dr), ts: dr.ts || Date.now(), demo: false };
}
// Repeat entries are pre-filled from the last one with the same description. Only blanks are filled, and the
// account and mode move together and only when the person has not picked either (never while editing a saved entry).
function suggestFor(dr) {
  const v = dr.desc.trim().toLowerCase();
  if (!v) return false;
  const txns = Store.derive().txns;
  for (let i = txns.length - 1; i >= 0; i--) {
    const t = txns[i];
    if (t.type === dr.type && t.desc.toLowerCase() === v) {
      const before = [dr.cat, dr.group, dr.acct, dr.mode].join('|');
      if (!dr.cat && t.cat) dr.cat = t.cat;
      if (t.group && !dr.group) dr.group = t.group;
      if (!dr.editId && !dr.touched.acct && !dr.touched.mode && t.acct && t.type !== 'transfer') { dr.acct = t.acct; if (t.mode) dr.mode = t.mode; }
      return [dr.cat, dr.group, dr.acct, dr.mode].join('|') !== before;
    }
  }
  return false;
}

// one editable row (used on the Add page and inside the edit dialog)
function rowForm(dr, o) {
  const host = h('div', { class: 'draft-host' });
  const paint = () => mount(host, build());
  function build() {
    const cfg = Store.derive().cfg, am = Core.acctMap(cfg), cm = Core.catMap(cfg);
    const id = (k) => 'd-' + dr.id + '-' + k;
    const t = dr.type, e = dr.err || {};
    const accts = cfg.accounts.filter((a) => (a.active && !Core.isHolding(a)) || a.id === dr.acct || a.id === dr.toAcct);
    const aOpts = accts.map((a) => ({ value: a.id, label: a.name + (a.kind === 'card' ? ' (card)' : a.kind === 'wallet' ? ' (wallet)' : '') + (a.active ? '' : ' (archived)') }));
    const errFor = (k) => (e[k] ? h('span', { class: 'err-text', role: 'alert' }, e[k]) : null);
    const inv = (k) => (e[k] ? { 'aria-invalid': 'true' } : {});
    const acct = am[dr.acct];
    const modeWarn = dr.mode === 'Credit card' && acct && acct.kind !== 'card' ? 'Credit-card spends belong on a card account so bank balances stay right. Add a card in Setup, then pick it here.'
      : acct && acct.kind === 'card' && dr.mode !== 'Credit card' && t !== 'transfer' ? 'This account is a card. Use mode Credit card, or record the bill payment as an own-account transfer.' : '';
    const w = effWhen(dr);
    const typeSeg = segmented(Core.TYPES.map((x) => ({ value: x.id, label: x.short })), t, (v) => {
      dr.type = v; dr.err = {};
      const kind = KIND_OF_TYPE[v];
      if (!kind || !cm[dr.cat] || cm[dr.cat].kind !== kind) { dr.cat = ''; dr.group = ''; }
      if (v === 'transfer' && !dr.toAcct) { const other = cfg.accounts.find((a) => a.active && a.id !== dr.acct); dr.toAcct = other ? other.id : ''; }
      paint();
    }, 'Entry type', 'sm scroll');
    const amtLabel = t === 'transfer' ? 'Amount moved (₹)' : t === 'income' ? 'Amount received (₹)' : 'Amount (₹)';
    const amtField = field(amtLabel, h('input', { id: id('amt'), class: 'in', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 250 or 120+80', value: dr.amt, ...inv('amt'), onInput: (ev) => (dr.amt = ev.target.value) }), 'c3', null);
    const acctLabel = t === 'income' ? 'Received in' : t === 'transfer' ? 'From account' : 'Paid from';
    const acctField = field(acctLabel, select(id('acct'), aOpts, dr.acct, (v) => { dr.acct = v; dr.touched.acct = true; const a = am[v]; if (a && a.kind === 'card') dr.mode = 'Credit card'; else if (a && a.kind === 'wallet') dr.mode = 'Wallet'; else if (dr.mode === 'Credit card' || dr.mode === 'Wallet') dr.mode = 'UPI'; paint(); }, inv('acct')), 'c4');
    const catKind = KIND_OF_TYPE[t];
    const catLabel = t === 'income' ? 'Source' : t === 'investment' ? 'Goes into' : t === 'transferout' ? 'Purpose' : 'Category';
    const catField = t === 'transfer'
      ? field('To account', select(id('to'), aOpts.filter((a) => a.value !== dr.acct), dr.toAcct, (v) => { dr.toAcct = v; paint(); }, inv('toAcct')), 'c5')
      : field(catLabel, select(id('cat'), catOptions(catKind, dr.cat), dr.cat, (v) => { dr.cat = v; const c = cm[v]; if (c && (t === 'expense' || t === 'transferout')) dr.group = c.group; paint(); }, inv('cat')), 'c5');
    const descLabel = t === 'transferout' ? 'Sent to (name or note)' : 'Description';
    const descField = field(descLabel, h('input', { id: id('desc'), class: 'in', list: 'descs', autocomplete: 'off', value: dr.desc, onInput: (ev) => (dr.desc = ev.target.value), onChange: () => { if (suggestFor(dr)) paint(); } }), 'c6');
    const modeField = field('Mode of payment', select(id('mode'), Core.MODES.map((m) => ({ value: m, label: m })), dr.mode, (v) => {
      dr.mode = v; dr.touched.mode = true;
      if (v === 'Credit card' && !(am[dr.acct] && am[dr.acct].kind === 'card')) { const card = cfg.accounts.find((a) => a.active && a.kind === 'card'); if (card) dr.acct = card.id; }
      paint();
    }), 'c3');
    const refField = field('Bank ref no. (optional)', h('input', { id: id('ref'), class: 'in', autocomplete: 'off', value: dr.ref, onInput: (ev) => (dr.ref = ev.target.value) }), 'c3');
    const notesField = field('Notes', h('input', { id: id('notes'), class: 'in', autocomplete: 'off', value: dr.notes, onInput: (ev) => (dr.notes = ev.target.value) }), t === 'expense' || t === 'transferout' ? 'c6' : 'c12');
    let groupField = null;
    if (t === 'expense' || t === 'transferout') {
      const items = (t === 'expense' ? Core.GROUPS.slice(0, 2) : Core.GROUPS).map((g) => ({ value: g.id, label: g.label }));
      const cur = groupFor(dr);
      groupField = h('div', { class: 'f c6', style: { fontSize: '13px', color: 'var(--ink2)', fontWeight: 500, display: 'flex', flexDirection: 'column', gap: '5px' } }, 'Counts as', segmented(items, cur, (v) => { dr.group = v; paint(); }, 'Needs, Wants or Savings'));
    }
    const whenRow = h('div', { class: 'row-sb' },
      o && o.modal ? h('strong', null, 'Entry details') : h('button', { type: 'button', class: 'btn ghost sm', 'aria-expanded': String(!!dr.showWhen), onClick: () => { dr.showWhen = !dr.showWhen; paint(); } }, icon('edit', 14), Core.dayLabel(w.date) + ' · ' + Core.slotLabel(w.slot) + (dr.date || dr.slot ? ' (this row)' : ''), ' · change'),
      o && o.onRemove ? h('button', { type: 'button', class: 'btn ghost sm icon', 'aria-label': 'Remove this row', onClick: o.onRemove }, icon('trash', 16)) : null);
    const whenFields = dr.showWhen || (o && o.modal) ? h('div', { class: 'fgrid' },
      field('Date', h('input', { id: id('date'), class: 'in', type: 'date', max: today(), value: w.date, ...inv('date'), onChange: (ev) => { dr.date = ev.target.value || null; paint(); } }), 'c4', e.date || null),
      field('Slot', select(id('slot'), Core.SLOTS.map((s) => ({ value: s.id, label: s.label })), w.slot, (v) => { dr.slot = v; paint(); }), 'c4'),
      !(o && o.modal) ? h('div', { class: 'c4', style: { alignSelf: 'end' } }, h('button', { type: 'button', class: 'btn sm', onClick: () => { dr.date = null; dr.slot = null; dr.showWhen = false; paint(); } }, 'Follow the page day and slot')) : null) : null;
    const top = [acctField, catField, amtField, descField, modeField, refField, groupField, notesField];
    return h('div', { class: 'draft' + (Object.keys(e).length ? ' bad' : ''), 'data-row': dr.id },
      whenRow, whenFields, typeSeg,
      h('div', { class: 'fgrid' }, top),
      modeWarn ? h('p', { class: 'small', role: 'status', style: { color: 'var(--warn-ink)' } }, modeWarn) : null,
      Object.keys(e).length ? h('p', { class: 'err-text', role: 'alert' }, 'Fix: ' + Object.values(e).join(' · ')) : null,
      t === 'transfer' ? h('p', { class: 'xs muted' }, 'Counted on both accounts and left out of income and expense. Use this for cash withdrawals and credit-card bill payments.') : null);
  }
  paint();
  host._paint = paint;
  return host;
}

function paintDrafts() {
  const host = $('#draftsHost'); if (!host) return;
  const rows = ui.entry.rows;
  mount(host, ...rows.map((r) => rowForm(r, { onRemove: () => { if (rows.length === 1) ui.entry.rows = [newDraft({ acct: r.acct, mode: r.mode })]; else ui.entry.rows = rows.filter((x) => x !== r); paintDrafts(); updateSaveLabel(); } })));
}
function updateSaveLabel() {
  const b = $('#saveAll'); if (!b) return;
  const n = ui.entry.rows.filter((r) => !isBlankDraft(r)).length;
  b.textContent = n > 1 ? 'Save ' + n + ' entries' : 'Save entry';
}
let savingNow = false;
async function saveDrafts() {
  if (savingNow) return;
  const rows = ui.entry.rows;
  const filled = rows.filter((r) => !isBlankDraft(r));
  if (!filled.length) { Toast.show('Type an amount first', 'bad'); const a = rows[0] && $('#d-' + rows[0].id + '-amt'); if (a) a.focus(); return; }
  let bad = 0;
  filled.forEach((r) => { r.err = draftErrors(r); if (Object.keys(r.err).length) bad++; else r.err = {}; });
  if (bad) { paintDrafts(); Toast.show(bad + (bad > 1 ? ' rows need' : ' row needs') + ' fixing before saving', 'bad'); const bd = $('.draft.bad'); if (bd) bd.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const list = filled.map(toTxn);
  const btn = $('#saveAll'); if (btn) btn.disabled = true;
  savingNow = true;
  try {
    await Store.putTxns(list);
    const last = filled[filled.length - 1];
    Prefs.set('lastEntry', { acct: last.acct, mode: last.mode });
    const days = [...new Set(list.map((t) => t.date))];
    Toast.show('Saved ' + list.length + (list.length > 1 ? ' entries' : ' entry') + ' for ' + (days.length === 1 ? Core.dayLabel(days[0]) : days.length + ' days'));
    ui.entry.rows = [newDraft({ acct: last.acct, mode: last.mode })];
    paintDrafts(); updateSaveLabel();
    const a = $('#d-' + ui.entry.rows[0].id + '-amt'); if (a) a.focus();
  } catch (e) { /* surfaced by the store */ }
  savingNow = false;
  const btn2 = $('#saveAll'); if (btn2) btn2.disabled = false;
}
function openEditor(t) {
  const dr = newDraft({ type: t.type, acct: t.acct, toAcct: t.toAcct, cat: t.cat, desc: t.desc, amt: String(t.amt), mode: t.mode, ref: t.ref, notes: t.notes, group: t.group, date: t.date, slot: t.slot, editId: t.id, ts: t.ts, showWhen: true });
  const msg = h('p', { class: 'err-text', role: 'alert' });
  const body = rowForm(dr, { modal: true });
  openModal(h('div', { class: 'stack' },
    h('div', { class: 'row-sb' }, h('h2', null, 'Edit entry'), h('button', { type: 'button', class: 'btn ghost icon', 'aria-label': 'Close', onClick: closeModal }, icon('x'))),
    body, msg,
    h('div', { class: 'row-sb' },
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onClick: async () => {
        dr.err = draftErrors(dr);
        if (Object.keys(dr.err).length) { body._paint(); return; }
        try { await Store.putTxns([toTxn(dr)]); closeModal(); Toast.show('Entry updated'); } catch (e) { msg.textContent = 'Could not save. Try again.'; }
      } }, 'Save changes'), h('button', { type: 'button', class: 'btn', onClick: closeModal }, 'Cancel')),
      confirmButton('del-' + t.id, 'Delete entry', 'Click again to delete', async () => { try { await Store.removeTxns([t.id]); closeModal(); Toast.show('Entry deleted'); } catch (e) { /* surfaced */ } }, 'btn danger'))), 'Edit entry');
}
function dupToDraft(t) {
  const dr = newDraft({ type: t.type, acct: t.acct, toAcct: t.toAcct, cat: t.cat, desc: t.desc, amt: String(t.amt), mode: t.mode, ref: '', notes: t.notes, group: t.group });
  if (ui.entry.rows.length === 1 && isBlankDraft(ui.entry.rows[0])) ui.entry.rows = [dr]; else ui.entry.rows.push(dr);
  if (ui.page !== 'entry') go('entry'); else { paintDrafts(); updateSaveLabel(); }
  Toast.show('Copied into a new row on the Add page');
}

// ---------- live panels ----------
function dayEntries(d, date) { return d.txns.filter((t) => t.date === date); }
function slotsView() {
  const e = ui.entry, d = Store.derive();
  const day = dayEntries(d, e.date);
  const pre = e.date < d.cfg.start ? h('p', { class: 'small', role: 'status', style: { color: 'var(--warn-ink)', marginTop: '10px' } }, 'This day is before your tracking start (' + Core.dateLabel(d.cfg.start) + '). It will show in reports, but balances begin on the start date.') : null;
  return h('div', null, h('div', { class: 'slots', role: 'group', 'aria-label': 'Slot of the day' }, Core.SLOTS.map((s) => {
    const n = day.filter((t) => t.slot === s.id).length;
    const mk = !!d.marks[e.date + '|' + s.id];
    return h('button', { type: 'button', class: 'slot', 'aria-pressed': String(e.slot === s.id), onClick: () => { e.slot = s.id; repaintLive(); paintDrafts(); } },
      h('b', null, s.label), h('span', null, s.hint),
      h('div', { class: 'st' }, n ? icon('check', 14) : mk ? icon('minus', 14) : icon('alert', 14), n ? n + (n > 1 ? ' entries' : ' entry') : mk ? 'No spend' : 'Not logged'));
  })), pre);
}
function entryLine(t, d) {
  const am = Core.acctMap(d.cfg), cm = Core.catMap(d.cfg);
  const cat = t.type === 'transfer' ? 'Transfer to ' + (am[t.toAcct] || {}).name : (cm[t.cat] || {}).name || 'Uncategorised';
  const sign = t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '−';
  const prefix = { income: 'Income', investment: 'Invested', transferout: 'Sent', transfer: '', expense: '' }[t.type];
  return h('div', { class: 'dayrow' },
    h('div', { style: { minWidth: 0 } }, h('div', { style: { fontWeight: 500, overflowWrap: 'anywhere' } }, t.desc || cat), h('div', { class: 'xs muted' }, [prefix ? prefix + ' · ' : '', t.desc ? cat + ' · ' : '', (am[t.acct] || {}).name, t.mode ? ' · ' + t.mode : ''].join(''))),
    h('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } },
      h('span', { class: 'm', style: { marginRight: '6px' } }, sign + INR2(t.amt)),
      h('button', { type: 'button', class: 'btn ghost sm icon', 'aria-label': 'Edit ' + (t.desc || cat), onClick: () => openEditor(t) }, icon('edit')),
      h('button', { type: 'button', class: 'btn ghost sm icon', 'aria-label': 'Copy ' + (t.desc || cat) + ' into a new row', onClick: () => dupToDraft(t) }, icon('copy'))));
}
function dayCard() {
  const e = ui.entry, d = Store.derive(), date = e.date, t = today();
  const day = dayEntries(d, date);
  const sp = Core.summarize(day, date, date);
  const empties = Core.missingSlots(d.cov, date);
  const slotBlocks = Core.SLOTS.map((s) => {
    const items = day.filter((x) => x.slot === s.id);
    const mk = !!d.marks[date + '|' + s.id];
    return h('div', { style: { borderTop: '1px solid var(--line)', paddingTop: '10px' } },
      h('div', { class: 'row-sb' }, h('strong', null, s.label),
        !items.length ? (mk ? h('div', { class: 'row', style: { gap: '8px' } }, pill('neutral', 'No spend'), h('button', { type: 'button', class: 'btn sm ghost', onClick: () => Store.setMarks({ [date + '|' + s.id]: false }) }, 'Undo')) : h('button', { type: 'button', class: 'btn sm', onClick: () => Store.setMarks({ [date + '|' + s.id]: true }) }, 'Mark no spend')) : null),
      items.length ? items.map((x) => entryLine(x, d)) : (mk ? null : h('p', { class: 'xs muted' }, 'Nothing logged for this slot yet.')));
  });
  return h('section', { class: 'card', 'aria-label': 'Entries for the chosen day' },
    h('header', null, h('div', null, h('h3', null, Core.dayLabel(date) + (date === t ? ' · today' : '') + ' ' + date.slice(0, 4)), h('p', null, day.length ? 'Spent ' + INR2(sp.spend) + (sp.income ? ' · Income ' + INR2(sp.income) : '') + (sp.invest ? ' · Invested ' + INR2(sp.invest) : '') : 'No entries yet for this day.'))),
    slotBlocks,
    empties.length ? h('div', null, h('button', { type: 'button', class: 'btn', onClick: () => { const m = {}; empties.forEach((s) => (m[date + '|' + s] = true)); Store.setMarks(m); Toast.show('Empty slots marked as no spend'); } }, 'Mark all empty slots as no spend')) : null);
}
function calCard() {
  const e = ui.entry, d = Store.derive(), t = today();
  const ym = e.calMonth, y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const first = ym + '-01';
  const lead = (Core.dow(first) + 6) % 7; // Monday first
  const dim = Core.daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('button', { type: 'button', class: 'out', disabled: true, 'aria-hidden': 'true', tabindex: -1 }, '0'));
  for (let day = 1; day <= dim; day++) {
    const date = ym + '-' + Core.pad(day);
    const miss = Core.missingSlots(d.cov, date);
    const set = d.cov.get(date) || new Set();
    cells.push(h('button', { type: 'button', class: date === t ? 'today' : '', disabled: date > t, 'aria-pressed': String(date === e.date), 'aria-label': Core.dateLabel(date) + ', ' + (4 - miss.length) + ' of 4 slots covered', onClick: () => { setEntryDate(date); } },
      String(day), h('span', { class: 'segs', 'aria-hidden': 'true' }, Core.SLOT_IDS.map((s) => h('i', { class: set.has(s) ? 'on' : '' })))));
  }
  const years = []; for (let yy = Math.min(+d.cfg.start.slice(0, 4) - 1, y); yy <= +t.slice(0, 4); yy++) years.push({ value: String(yy), label: String(yy) });
  const shift = (n) => { e.calMonth = Core.addMonths(ym, n); repaintLive(); };
  return h('section', { class: 'card', 'aria-label': 'Calendar of logged days' },
    h('header', null, h('div', null, h('h3', null, 'Calendar'), h('p', null, 'Each day shows four bars, one per slot. Filled means logged or marked no spend.')),
      h('div', { class: 'row', style: { gap: '4px' } }, h('button', { type: 'button', class: 'btn sm icon', 'aria-label': 'Previous month', onClick: () => shift(-1) }, icon('left')), h('button', { type: 'button', class: 'btn sm icon', 'aria-label': 'Next month', disabled: ym >= t.slice(0, 7), onClick: () => shift(1) }, icon('right')))),
    h('div', { class: 'row' },
      select('cal-m', Core.MONTHS.map((x, i) => ({ value: Core.pad(i + 1), label: x })), Core.pad(m), (v) => { e.calMonth = y + '-' + v; repaintLive(); }, { class: 'in auto' }),
      select('cal-y', years, String(y), (v) => { e.calMonth = v + '-' + Core.pad(m); repaintLive(); }, { class: 'in auto' })),
    h('div', { class: 'cal', role: 'group', 'aria-label': Core.monthLabel(ym) }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => h('div', { class: 'dh' }, x)), cells));
}
function gapCard() {
  const e = ui.entry, d = Store.derive(), t = today();
  const to = Core.addDays(t, -1);
  const from = e.gapWin === 'all' ? d.cfg.start : Core.maxD(d.cfg.start, Core.addDays(t, -e.gapWin));
  const list = Core.gaps(d.cov, from, to).reverse();
  const shown = list.slice(0, e.gapLimit || 40);
  const markDay = (g) => { const m = {}; g.missing.forEach((s) => (m[g.date + '|' + s] = true)); Store.setMarks(m); };
  return h('section', { class: 'card', 'aria-label': 'Catch up on missed days' },
    h('header', null, h('div', null, h('h3', null, 'Catch up'), h('p', null, from > to ? 'Tracking starts today, so nothing can be missing yet.' : 'Days between ' + Core.dateLabel(from) + ' and ' + Core.dateLabel(to) + ' with unlogged slots.'))),
    segmented([{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 'all', label: 'Since start' }], e.gapWin, (v) => { e.gapWin = v; e.gapLimit = 40; repaintLive(); }, 'Catch-up window', 'sm scroll'),
    list.length ? h('div', { class: 'row-sb' }, h('span', { class: 'small' }, list.length + (list.length > 1 ? ' days need' : ' day needs') + ' attention'),
      confirmButton('markall', 'Mark all as no spend', 'Confirm: mark ' + list.length + ' days', () => { const m = {}; list.forEach((g) => g.missing.forEach((s) => (m[g.date + '|' + s] = true))); Store.setMarks(m); Toast.show('Marked ' + list.length + ' days as no spend'); }, 'btn sm')) : null,
    list.length ? h('div', { class: 'gaplist' }, shown.map((g) => h('div', { class: 'gap' },
      h('div', null, h('div', { style: { fontWeight: 500 } }, Core.dayLabel(g.date) + (g.date.slice(0, 4) !== t.slice(0, 4) ? ' ' + g.date.slice(0, 4) : '')), h('div', { class: 'xs muted' }, h('span', { class: 'mini', 'aria-hidden': 'true' }, Core.SLOT_IDS.map((s) => h('i', { class: g.missing.includes(s) ? '' : 'on' }))), ' Missing: ' + g.missing.map(Core.slotLabel).join(', '))),
      h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, h('button', { type: 'button', class: 'btn sm', onClick: () => setEntryDate(g.date, g.missing[0]) }, 'Fill'), h('button', { type: 'button', class: 'btn sm ghost', onClick: () => markDay(g) }, 'No spend'))))) : h('p', { class: 'small', style: { color: 'var(--good-ink)' } }, from > to ? '' : 'Every slot is accounted for in this window.'),
    list.length > shown.length ? h('button', { type: 'button', class: 'btn sm', onClick: () => { e.gapLimit = (e.gapLimit || 40) + 60; repaintLive(); } }, 'Show more (' + (list.length - shown.length) + ' left)') : null);
}
function setEntryDate(date, slot) {
  const e = ui.entry; e.date = date; e.calMonth = date.slice(0, 7); if (slot) e.slot = slot;
  const inp = $('#e-date'); if (inp) inp.value = date;
  repaintLive(); paintDrafts(); updateWhenLabel();
  const w = $('#whenCard'); if (w && ui.page === 'entry') w.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function updateWhenLabel() { const n = $('#whenLabel'); if (n) n.textContent = Core.dateLabel(ui.entry.date); const nx = $('#nextDay'); if (nx) nx.disabled = ui.entry.date >= today(); }
function repaintLive() {
  const s = $('#slotsHost'), side = $('#sideHost');
  if (s) mount(s, slotsView());
  if (side) mount(side, dayCard(), calCard(), gapCard());
  const dl = $('#descs');
  if (dl) { const seen = new Set(); const out = []; const txns = Store.derive().txns; for (let i = txns.length - 1; i >= 0 && out.length < 150; i--) { const v = txns[i].desc; if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); } } mount(dl, ...out.map((v) => h('option', { value: v }))); }
}
function pageEntry() {
  const e = ui.entry;
  if (!e.rows.length) e.rows = [newDraft()];
  const t = today();
  const step = (n) => setEntryDate(Core.addDays(e.date, n));
  const when = h('section', { class: 'card', id: 'whenCard', 'aria-label': 'Choose day and slot' },
    h('div', { class: 'when' },
      field('Day', h('input', { id: 'e-date', class: 'in', type: 'date', max: t, value: e.date, onChange: (ev) => { if (Core.isDate(ev.target.value) && ev.target.value <= t) setEntryDate(ev.target.value); else ev.target.value = e.date; } }), null),
      h('div', { class: 'row', style: { gap: '6px' } },
        h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Previous day', onClick: () => step(-1) }, icon('left')),
        h('button', { type: 'button', class: 'btn icon', id: 'nextDay', 'aria-label': 'Next day', disabled: e.date >= t, onClick: () => step(1) }, icon('right')),
        h('button', { type: 'button', class: 'btn', onClick: () => setEntryDate(t) }, 'Today'),
        h('button', { type: 'button', class: 'btn', onClick: () => setEntryDate(Core.addDays(t, -1)) }, 'Yesterday'))),
    h('div', { id: 'slotsHost' }, slotsView()));
  const drafts = h('div', { id: 'draftsHost', class: 'stack' });
  const left = h('div', { class: 'stack' }, when, drafts,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', onClick: () => { const last = e.rows[e.rows.length - 1]; e.rows.push(newDraft({ acct: last.acct, mode: last.mode })); paintDrafts(); updateSaveLabel(); const a = $('#d-' + e.rows[e.rows.length - 1].id + '-amt'); if (a) a.focus(); } }, icon('plus', 16), 'Add another row'),
      h('button', { type: 'button', class: 'btn primary', id: 'saveAll', onClick: saveDrafts }, 'Save entry')),
    h('p', { class: 'xs muted' }, 'Each row is saved to its own day and slot, which follow the picker above unless you change them on the row. Ctrl or Cmd+Enter saves.'));
  const root = h('div', { onKeydown: (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); saveDrafts(); } }, onInput: updateSaveLabel },
    pageHead('Add entries', 'Pick any day and slot, in any order. Late entries and whole missed weeks work the same way.'),
    h('div', { id: 'demoHost' }, demoBanner()),
    h('datalist', { id: 'descs' }),
    h('div', { class: 'cols', style: { marginTop: '16px' } }, left, h('div', { class: 'stack', id: 'sideHost' })));
  Promise.resolve().then(() => { paintDrafts(); updateSaveLabel(); repaintLive(); });
  return root;
}
