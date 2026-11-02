'use strict';
/* IO: moving records in and out through Excel and CSV files. Pure functions: no DOM, no storage.
   Export:  IO.exportWorkbook(cfg, txns) / IO.templateWorkbook(cfg)  -> sheet specs for XL.write
   Import:  IO.parseCSV -> IO.parseTable -> IO.resolve -> IO.plan -> IO.commit                          */
const IO = (function () {
  const C = typeof Core !== 'undefined' ? Core : require('./core.js');
  const norm = (s) => String(s === null || s === undefined ? '' : s).normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const normName = (s) => norm(String(s === null || s === undefined ? '' : s).replace(/&/g, ' and '));
  const toP = C.toP;

  // ================= export =================
  function lists(cfg) {
    const am = cfg.accounts;
    const cats = cfg.cats.filter((c) => c.active !== false).map((c) => c.name);
    am.forEach((a) => { cats.push('Transfer to ' + a.name); cats.push('Transfer from ' + a.name); });
    return {
      slot: C.SLOTS.map((s) => s.label), bank: am.map((a) => a.name), cat: cats, mode: C.MODES.slice(),
      group: C.GROUPS.map((g) => C.groupTag(g.id, cfg)), type: C.TYPES.map((t) => t.label),
    };
  }
  const RECORD_COLS = [
    { key: 'Date', width: 12, style: 'date' }, { key: 'Slot', width: 11, list: 'slot' }, { key: 'Bank', width: 15, list: 'bank' },
    { key: 'Description', width: 32 }, { key: 'Category', width: 30, list: 'cat' }, { key: 'Mode of payment', width: 16, list: 'mode' },
    { key: 'Withdrawal amount', width: 14, style: 'money' }, { key: 'Deposit amount', width: 14, style: 'money' }, { key: 'Bank reference no', width: 20, style: 'text' },
    { key: 'Notes', width: 30 }, { key: 'Group', width: 14, list: 'group' }, { key: 'Month', width: 10, style: 'text' }, { key: 'CW', width: 7, style: 'text' },
    { key: 'Type', width: 22, list: 'type' }, { key: 'Entry ID', width: 18, style: 'text' },
  ];
  function listsSheet(cfg) {
    const L = lists(cfg);
    const keys = ['slot', 'bank', 'cat', 'mode', 'group', 'type'];
    const heads = ['Slot', 'Bank', 'Category', 'Mode of payment', 'Group', 'Type'];
    const n = Math.max.apply(null, keys.map((k) => L[k].length));
    const rows = [];
    for (let i = 0; i < n; i++) rows.push(keys.map((k) => L[k][i] || ''));
    return { sheet: { name: 'Lists', filter: false, cols: heads.map((h, i) => ({ header: h, width: [11, 16, 32, 18, 14, 24][i] })), rows }, L, keys };
  }
  function recordsSheet(cfg, rows, extraRows) {
    const ls = listsSheet(cfg);
    const colLetter = (k) => XLcol(ls.keys.indexOf(k));
    const cols = RECORD_COLS.map((c) => ({
      header: c.key, width: c.width, style: c.style,
      list: c.list ? 'Lists!$' + colLetter(c.list) + '$2:$' + colLetter(c.list) + '$' + (ls.L[c.list].length + 1) : undefined,
    }));
    const data = rows.map((r) => RECORD_COLS.map((c) => {
      const v = r[c.key];
      if (c.key === 'Date') return { d: r._iso };
      if (v === '' || v === null || v === undefined) return null;
      return v;
    }));
    return { sheet: { name: 'Records', first: true, filter: true, validateRows: Math.max(rows.length + 1, 3000), cols, rows: data.concat(extraRows || []) }, lists: ls.sheet };
  }
  function XLcol(i) { let s = ''; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  const READ_ME = [
    [{ s: 'How to add or change records in this file, then bring them back', st: 'title' }],
    [''],
    ['1. Keep the first row of the Records sheet as it is (the column names). Add one row for each transaction.'],
    ['2. Date: type a real date such as 15-10-2026. Slot, Bank, Category, Mode of payment, Group and Type have drop-down lists. A name that is not in your ledger is not lost: the import asks whether to add it or map it to an existing one.'],
    ['3. Put the money in Withdrawal amount (spent, sent or saved) or in Deposit amount (received). One row has one of them, never both.'],
    ['4. An own-account transfer is two rows: Category "Transfer to <bank>" with the withdrawal, and "Transfer from <bank>" with the deposit, on the same date for the same amount. The import joins the two rows into one transfer.'],
    ['5. Entry ID: leave it empty on new rows. A row that keeps its Entry ID changes the stored entry instead of adding another one. Do not edit this column.'],
    ['6. Month and CW are filled in for you and are ignored when importing.'],
    ['7. Keep bank reference numbers as text. In an .xlsx they are already text. If you save this file as CSV from Excel, Excel itself shortens long numbers to forms like 6.27E+11 and the original is lost, so prefer importing the .xlsx.'],
    ['8. In the app: open Records, choose Import, pick this file, check the preview, then confirm. Nothing is saved until you confirm.'],
  ].map((r) => (typeof r[0] === 'string' && r[0] ? [{ s: r[0], st: 'wrap' }] : r));
  function readMeSheet() { return { name: 'Read me', header: false, freeze: false, showGrid: false, cols: [{ width: 130 }], rows: READ_ME }; }

  function monthsBetween(a, b) {
    const out = []; let m = a.slice(0, 7); const end = b.slice(0, 7);
    while (m <= end && out.length < 600) { out.push(m); m = C.addMonths(m, 1); }
    return out;
  }
  function summarySheet(txns, today) {
    const dates = txns.map((t) => t.date).sort();
    const months = dates.length ? monthsBetween(dates[0], dates[dates.length - 1]) : [today.slice(0, 7)];
    const ms = C.monthlySeries(txns, months);
    const rows = ms.map((m) => [C.monthLabel(m.key), m.income, m.expense, m.tout, m.invest, m.net, m.rate === null ? '' : Math.round(m.rate * 1000) / 10 + '%']);
    return { name: 'Monthly summary', filter: false, cols: [{ header: 'Month', width: 12, style: 'text' }, { header: 'Income', width: 14, style: 'money' }, { header: 'Expense', width: 14, style: 'money' }, { header: 'Sent to others', width: 16, style: 'money' }, { header: 'Savings and investments', width: 22, style: 'money' }, { header: 'Left after Needs and Wants', width: 24, style: 'money' }, { header: 'Savings rate', width: 12, style: 'text' }], rows };
  }
  function exportWorkbook(cfg, txns, today) {
    const r = recordsSheet(cfg, C.exportRows(cfg, txns));
    return [r.sheet, summarySheet(txns, today), r.lists, readMeSheet()];
  }
  function templateWorkbook(cfg) {
    const r = recordsSheet(cfg, []);
    return [r.sheet, r.lists, readMeSheet()];
  }

  // ================= reading text =================
  function decodeText(u8) {
    if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) u8 = u8.subarray(3);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { return new TextDecoder('windows-1252').decode(u8); }
  }
  function guessDelim(text) {
    const cnt = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    let q = false;
    for (let i = 0; i < text.length && i < 20000; i++) {
      const ch = text[i];
      if (ch === '"') q = !q;
      else if (!q && (ch === '\n' || ch === '\r')) break;
      else if (!q && ch in cnt) cnt[ch]++;
    }
    let best = ',';
    Object.keys(cnt).forEach((k) => { if (cnt[k] > cnt[best]) best = k; });
    return best;
  }
  // RFC 4180 reader that also copes with what Excel writes: BOMs (even two), "sep=" line, ; or tab separators, any line ending
  function parseCSV(text) {
    text = String(text).replace(/^﻿+/, '');
    let delim = null;
    const hint = /^sep=(.)\r?\n/i.exec(text);
    if (hint) { delim = hint[1]; text = text.slice(hint[0].length); }
    if (!delim) delim = guessDelim(text);
    const rows = []; let row = []; let f = ''; let q = false; let had = false;
    const n = text.length;
    for (let i = 0; i < n; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch;
      } else if (ch === '"' && !had) { q = true; had = true; }
      else if (ch === delim) { row.push(f); f = ''; had = false; }
      else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; had = false; }
      else { f += ch; had = true; }
    }
    if (f !== '' || had || row.length) { row.push(f); rows.push(row); }
    if (q) rows.unterminated = true;
    return rows;
  }

  // ================= columns =================
  const HEAD = {
    id: ['entryid', 'id', 'recordid'],
    date: ['date', 'transactiondate', 'txndate', 'trandate', 'postingdate', 'bookingdate'],
    valueDate: ['valuedate', 'valuedt', 'valdate'],
    slot: ['slot', 'timeslot', 'timeofday'],
    bank: ['bank', 'account', 'bankaccount', 'accountname', 'bankname', 'acct'],
    desc: ['description', 'desc', 'narration', 'particulars', 'transactiondetails', 'details', 'payee'],
    cat: ['category', 'cat', 'categoryname'],
    mode: ['modeofpayment', 'mode', 'paymentmode', 'paymentmethod'],
    wd: ['withdrawalamount', 'withdrawal', 'withdrawalamt', 'withdrawals', 'withdrawl', 'withdrawlamt', 'withdraw', 'amountwithdrawn', 'debit', 'debitamount', 'debitamt', 'dr', 'paidout'],
    dep: ['depositamount', 'deposit', 'depositamt', 'deposits', 'credit', 'creditamount', 'creditamt', 'cr', 'paidin'],
    amount: ['amount', 'amt', 'amountinr'],
    ref: ['bankreferenceno', 'bankreference', 'bankrefno', 'referenceno', 'referencenumber', 'reference', 'refno', 'ref', 'chqrefno', 'chequerefno', 'chqno', 'utr', 'utrno', 'transactionref', 'transactionreference'],
    notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'remark'],
    group: ['group', 'bucket', 'countsas'],
    type: ['type', 'entrytype', 'kind'],
    month: ['month'], cw: ['cw', 'week', 'calendarweek'],
  };
  const HEAD_LOOKUP = {};
  Object.keys(HEAD).forEach((k) => HEAD[k].forEach((a) => { if (!(a in HEAD_LOOKUP)) HEAD_LOOKUP[a] = k; }));
  function mapHeader(cells) {
    const map = {}; const unknown = [];
    cells.forEach((c, i) => {
      const k = HEAD_LOOKUP[norm(c)];
      if (k && !(k in map)) map[k] = i; else if (String(c).trim()) unknown.push(String(c).trim());
    });
    if (!('date' in map) && 'valueDate' in map) map.date = map.valueDate;
    return { map, unknown };
  }
  function findHeader(rows) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const { map, unknown } = mapHeader(rows[i] || []);
      if ('date' in map && ('wd' in map || 'dep' in map || 'amount' in map)) return { row: i, map, unknown };
    }
    return null;
  }

  // ================= cell parsers =================
  const MONTH_NUM = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function serialToDate(n, date1904) {
    const base = Math.floor(n) + (date1904 ? 1462 : 0);
    if (!(base > 20000 && base < 80000)) return null;
    return C.addDays('1899-12-30', base);
  }
  function mkDate(y, m, d) {
    if (y < 100) y += 2000;
    const s = C.ymd(y, m, d);
    return y >= 2000 && y <= 2100 && C.isDate(s) ? s : null;
  }
  function parseDate(raw, order, date1904) {
    if (typeof raw === 'number') return serialToDate(raw, date1904);
    const s = String(raw === null || raw === undefined ? '' : raw).trim();
    if (!s) return null;
    let m;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s))) return mkDate(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2}|\d{4})(?:[T\s].*)?$/.exec(s))) return order === 'mdy' ? mkDate(+m[3], +m[1], +m[2]) : mkDate(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})[-/.\s,]*([A-Za-z]{3,9})[-/.\s,]*(\d{2}|\d{4})$/.exec(s)) && MONTH_NUM[m[2].slice(0, 3).toLowerCase()]) return mkDate(+m[3], MONTH_NUM[m[2].slice(0, 3).toLowerCase()], +m[1]);
    if ((m = /^([A-Za-z]{3,9})[-/.\s,]*(\d{1,2})[-/.\s,]+(\d{4})$/.exec(s)) && MONTH_NUM[m[1].slice(0, 3).toLowerCase()]) return mkDate(+m[3], MONTH_NUM[m[1].slice(0, 3).toLowerCase()], +m[2]);
    if (/^\d{5}(\.\d+)?$/.test(s)) return serialToDate(Number(s), date1904);
    return null;
  }
  const NUM_DATE = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2}|\d{4})(?:[T\s].*)?$/;
  function inferDateOrder(values) {
    let dmy = 0, mdy = 0, ambiguous = 0;
    values.forEach((v) => {
      const m = typeof v === 'string' ? NUM_DATE.exec(v.trim()) : null;
      if (m) { if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; if (+m[1] <= 12 && +m[2] <= 12 && +m[1] !== +m[2]) ambiguous++; }
    });
    return { order: mdy > 0 && dmy === 0 ? 'mdy' : 'dmy', ambiguous: dmy === 0 && mdy === 0 ? ambiguous : 0 };
  }
  // -> {v, empty, bad, extraDecimals, dc}. Commas are accepted only as thousands separators (1,234 or 1,23,456).
  function parseMoney(raw) {
    if (raw === null || raw === undefined || raw === '') return { v: 0, empty: true };
    if (typeof raw === 'number') return isFinite(raw) ? { v: Math.round(raw * 100) / 100, empty: false, extraDecimals: Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-6 } : { v: 0, bad: true };
    let t = String(raw).trim();
    if (!t || /^[-–—]+$/.test(t)) return { v: 0, empty: true };
    t = t.replace(/[₹\s]/g, '').replace(/^(rs\.?|inr)/i, '');
    let dc = '';
    t = t.replace(/(dr|cr)\.?$/i, (m) => { dc = m[0].toLowerCase() + 'r'; return ''; });
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t[0] === '-') { neg = !neg; t = t.slice(1); }
    if (t.includes(',')) {
      if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) && !/^\d{1,2}(,\d{2})+,\d{3}(\.\d+)?$/.test(t)) return { v: 0, bad: true };
      t = t.replace(/,/g, '');
    }
    if (!/^\d+(\.\d+)?$/.test(t)) return { v: 0, bad: true };
    const n = Number(t);
    return { v: (neg ? -1 : 1) * Math.round(n * 100) / 100, empty: false, dc, extraDecimals: /\.\d{3,}/.test(t) && Math.abs(n * 100 - Math.round(n * 100)) > 1e-6 };
  }
  function cleanText(v, csv) {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'number' ? String(v) : String(v);
    s = s.trim();
    if (csv) {
      const m = /^="([\s\S]*)"$/.exec(s);
      if (m) s = m[1].replace(/""/g, '"');
      else if (/^'(?:'?[=+\-@\t\r])/.test(s)) s = s.slice(1); // undo the apostrophe the CSV writer put in front of formula-like text
    }
    return s;
  }
  // A bank reference that Excel has already shortened (6.27401E+11) cannot be recovered
  function cleanRef(v, csv) {
    if (typeof v === 'number') {
      if (Number.isInteger(v) && Math.abs(v) < 1e15) return { ref: String(v) };
      return { ref: '', lost: true, shown: String(v) };
    }
    const s = cleanText(v, csv);
    if (/^\d(\.\d+)?e\+?\d+$/i.test(s) && Number(s.split(/e/i)[1]) >= 9) return { ref: '', lost: true, shown: s };
    return { ref: s };
  }
  const parseSlot = (raw) => { const n = norm(raw); const s = C.SLOTS.find((x) => norm(x.id) === n || norm(x.label) === n); return s ? s.id : null; };
  const TYPE_ALIAS = { expense: 'expense', expenses: 'expense', income: 'income', investment: 'investment', investments: 'investment', savingsandinvestment: 'investment', savingsandinvestments: 'investment', savings: 'investment', saving: 'investment', invest: 'investment', transfer: 'transfer', owntransfer: 'transfer', ownaccounttransfer: 'transfer', transferout: 'transferout', sentout: 'transferout', senttoothers: 'transferout' };
  const parseType = (raw) => TYPE_ALIAS[norm(raw)] || null;
  const parseGroup = (raw) => { const m = /^\s*(needs?|wants?|savings?)\b/i.exec(String(raw || '')); return m ? { n: 'needs', w: 'wants', s: 'savings' }[m[1][0].toLowerCase()] : ''; };
  const MODE_ALIAS = { upi: 'UPI', gpay: 'UPI', phonepe: 'UPI', paytm: 'UPI', debitcard: 'Debit card', atm: 'Debit card', creditcard: 'Credit card', cash: 'Cash', neft: 'NEFT/IMPS/RTGS', imps: 'NEFT/IMPS/RTGS', rtgs: 'NEFT/IMPS/RTGS', neftimpsrtgs: 'NEFT/IMPS/RTGS', cheque: 'Cheque', check: 'Cheque', netbanking: 'Net banking', internetbanking: 'Net banking', autodebit: 'Auto-debit', ecs: 'Auto-debit', nach: 'Auto-debit', emandate: 'Auto-debit' };
  const parseMode = (raw) => { const s = String(raw || '').trim(); if (!s) return ''; return C.MODES.find((m) => norm(m) === norm(s)) || MODE_ALIAS[norm(s)] || s.slice(0, 40); };

  // ================= table -> drafts =================
  // rows: array of arrays (strings or numbers). opts: {csv:boolean, date1904:boolean}
  function parseTable(rows, opts) {
    opts = opts || {};
    const csv = !!opts.csv;
    rows = (rows || []).map((r) => (Array.isArray(r) ? r : []));
    const hd = findHeader(rows);
    if (!hd) return { ok: false, error: 'I could not find the column names. The first row needs at least Date and Withdrawal amount or Deposit amount (or Amount).', drafts: [] };
    const map = hd.map;
    const body = rows.slice(hd.row + 1);
    // Bank statements often have merged header cells, which leaves a heading one column away from its figures
    const filled = (c) => body.reduce((n, r) => n + (r && r[c] !== undefined && r[c] !== '' && String(r[c]).trim() !== '' ? 1 : 0), 0);
    ['date', 'wd', 'dep', 'amount', 'ref', 'desc'].forEach((k) => {
      if (!(k in map) || filled(map[k]) > 0) return;
      const used = Object.keys(map).map((x) => map[x]);
      const blankHead = (c) => String(rows[hd.row][c] === undefined || rows[hd.row][c] === null ? '' : rows[hd.row][c]).trim() === '';
      const alt = [map[k] + 1, map[k] - 1].find((c) => c >= 0 && !used.includes(c) && blankHead(c) && filled(c) > 0);
      if (alt !== undefined) map[k] = alt;
    });
    const cell = (r, k) => (k in map ? r[map[k]] : undefined);
    const dateVals = body.map((r) => cell(r, 'date')).filter((v) => v !== undefined && v !== '');
    const inferred = inferDateOrder(dateVals.map((v) => (typeof v === 'string' ? cleanText(v, csv) : v)));
    const order = opts.dateOrder || inferred.order;
    const drafts = [];
    let ignored = 0;
    body.forEach((r, bi) => {
      const line = hd.row + bi + 2;
      if (!r || r.every((v) => v === '' || v === null || v === undefined || String(v).trim() === '')) return;
      const errors = [], warns = [];
      const rawDate = cell(r, 'date');
      const w = 'wd' in map ? parseMoney(typeof cell(r, 'wd') === 'string' ? cleanText(cell(r, 'wd'), csv) : cell(r, 'wd')) : { v: 0, empty: true };
      const dp = 'dep' in map ? parseMoney(typeof cell(r, 'dep') === 'string' ? cleanText(cell(r, 'dep'), csv) : cell(r, 'dep')) : { v: 0, empty: true };
      const am = 'amount' in map ? parseMoney(typeof cell(r, 'amount') === 'string' ? cleanText(cell(r, 'amount'), csv) : cell(r, 'amount')) : { v: 0, empty: true };
      const noDate = rawDate === undefined || rawDate === '' || String(rawDate).trim() === '';
      let date = null;
      if (!noDate) date = parseDate(typeof rawDate === 'string' ? cleanText(rawDate, csv) : rawDate, order, opts.date1904);
      const noAmount = w.empty && dp.empty && am.empty;
      // notes under a statement, "Total" lines and empty rows are not transactions
      if ((noAmount && !date) || (!noDate && !date && /^\s*(grand\s+)?(total|closing|opening|balance|statement)\b/i.test(String(rawDate)))) { ignored++; return; }
      if (noDate) errors.push('No date');
      else if (!date) errors.push('Date "' + String(rawDate).trim() + '" is not a date I can read');
      if (w.bad) errors.push('Withdrawal amount "' + String(cell(r, 'wd')).trim() + '" is not a number');
      if (dp.bad) errors.push('Deposit amount "' + String(cell(r, 'dep')).trim() + '" is not a number');
      if (am.bad) errors.push('Amount "' + String(cell(r, 'amount')).trim() + '" is not a number');
      if (w.extraDecimals || dp.extraDecimals || am.extraDecimals) warns.push('Amount rounded to paise');
      if (w.v < 0) errors.push('The Withdrawal amount is negative. Put money received in the Deposit column instead.');
      if (dp.v < 0) errors.push('The Deposit amount is negative. Put money spent in the Withdrawal column instead.');
      if (am.dc === 'dr') am.v = -Math.abs(am.v); else if (am.dc === 'cr') am.v = Math.abs(am.v);
      const d = { line, errors, warns, date };
      d.wd = w.v > 0 ? w.v : 0; d.dep = dp.v > 0 ? dp.v : 0;
      d.amountOnly = false;
      if (!w.empty || !dp.empty) { /* explicit columns win */ } else if (!am.empty) { d.amountOnly = true; d.signed = am.v; }
      const idc = cleanText(cell(r, 'id'), csv);
      d.id = /^[A-Za-z0-9_-]{1,40}$/.test(idc) ? idc : '';
      if (idc && !d.id) warns.push('Entry ID "' + idc.slice(0, 20) + '" is not valid and was ignored');
      const sl = cleanText(cell(r, 'slot'), csv);
      d.slot = sl ? parseSlot(sl) : null; d.slotGiven = !!d.slot;
      if (sl && !d.slot) warns.push('Slot "' + sl + '" not recognised');
      d.bankRaw = cleanText(cell(r, 'bank'), csv);
      d.desc = cleanText(cell(r, 'desc'), csv).slice(0, 1000);
      const ty = cleanText(cell(r, 'type'), csv);
      d.type = ty ? parseType(ty) || '' : '';
      if (ty && !d.type) warns.push('Type "' + ty + '" not recognised, so it was worked out from the amount');
      const catRaw = cleanText(cell(r, 'cat'), csv);
      d.catFull = catRaw;
      const xm = !d.type || d.type === 'transfer' ? /^transfer\s+(to|from)\s+(.+)$/i.exec(catRaw) : null;
      if (xm) { d.xdir = xm[1].toLowerCase(); d.xbank = xm[2].trim(); d.catRaw = ''; } else { d.xdir = ''; d.xbank = ''; d.catRaw = catRaw; }
      d.mode = parseMode(cleanText(cell(r, 'mode'), csv));
      const rf = cleanRef(cell(r, 'ref'), csv);
      d.ref = rf.ref.slice(0, 100); d.refLost = !!rf.lost;
      if (rf.lost) warns.push('Reference "' + rf.shown + '" was shortened by Excel and cannot be recovered');
      d.notes = cleanText(cell(r, 'notes'), csv).slice(0, 5000);
      const gr = cleanText(cell(r, 'group'), csv);
      d.group = parseGroup(gr); d.groupGiven = !!d.group;
      drafts.push(d);
    });
    const provided = {};
    ['id', 'slot', 'bank', 'desc', 'cat', 'mode', 'ref', 'notes', 'group', 'type'].forEach((k) => { provided[k] = k in map; });
    const READ_LABEL = { id: 'Entry ID', date: 'Date', slot: 'Slot', bank: 'Bank', desc: 'Description', cat: 'Category', mode: 'Mode of payment', wd: 'Withdrawal amount', dep: 'Deposit amount', amount: 'Amount', ref: 'Bank reference no', notes: 'Notes', group: 'Group', type: 'Type' };
    const columnsRead = Object.keys(READ_LABEL).filter((k) => k in map).map((k) => READ_LABEL[k]);
    return { ok: true, drafts, ignored, dateOrder: order, headerRow: hd.row + 1, fields: map, columnsRead, provided, dateAmbiguous: inferred.ambiguous, unknownHeaders: hd.unknown.filter((x) => !HEAD_LOOKUP[norm(x)]), hasBankCol: 'bank' in map };
  }

  // ================= drafts -> entries =================
  const slug = (s) => String(s).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'cat';
  function resolve(drafts, cfg, ctx) {
    ctx = ctx || {};
    const bankMap = ctx.bankMap || {}, catMapOv = ctx.catMap || {};
    const accts = cfg.accounts, cats = cfg.cats;
    const today = ctx.today || '9999-12-31';
    const bankNeeds = new Map(), catNeeds = new Map(), newCats = new Map();
    const exactBank = (name) => { const k = norm(name); return k ? accts.find((x) => norm(x.name) === k || norm(x.id) === k) : null; };
    function findBank(name) {
      const k = norm(name);
      if (!k) return { id: '' };
      const a = exactBank(name);
      if (a) return { id: a.id };
      // anything that is not an exact match is shown as a choice (with a suggestion when one bank fits), never applied silently
      const near = accts.filter((x) => { const n = norm(x.name); return n.length >= 3 && k.length >= 3 && (n.includes(k) || k.includes(n)); });
      const o = bankNeeds.get(k) || { key: k, name, count: 0, suggest: near.length === 1 ? near[0].id : '' };
      o.count++; bankNeeds.set(k, o);
      const ov = bankMap[k];
      if (ov) return ov === 'skip' ? { skip: true } : { id: ov };
      return { id: '', unknown: true };
    }
    const findCatAny = (name) => cats.find((c) => normName(c.name) === normName(name));
    const entries = [];
    const legs = [];
    drafts.forEach((d0) => {
      // "Transfer to parents" can also be the name of a category: with no Type given, a category of that name wins unless it names one of your banks
      const asCat = d0.xdir && !d0.type && d0.catFull && findCatAny(d0.catFull) && !exactBank(d0.xbank);
      const d = asCat ? { ...d0, xdir: '', xbank: '', catRaw: d0.catFull } : d0;
      const xdir = d.xdir, xbank = d.xbank;
      const e = {
        line: d.line, lines: [d.line], id: d.id, date: d.date, slot: d.slot || ctx.defaultSlot || 'morning', slotGiven: d.slotGiven, type: '', acct: '', toAcct: '', cat: '', desc: d.desc, amt: 0,
        mode: d.mode, ref: d.ref, refLost: d.refLost, notes: d.notes, group: '', groupGiven: d.groupGiven, errors: d.errors.slice(), warns: d.warns.slice(), provided: ctx.provided || null, merged: false,
        bankRaw: d.bankRaw, catRaw: d.catRaw,
      };
      entries.push(e);
      if (e.errors.length) return;
      // direction and type
      let type = d.type;
      if (!type && xdir) type = 'transfer';
      let dir = null;
      if (d.amountOnly) {
        const s = d.signed;
        const t0 = type || (s < 0 ? 'expense' : 'income');
        dir = t0 === 'income' ? 'dep' : t0 === 'transfer' ? (xdir === 'from' ? 'dep' : xdir === 'to' ? 'wd' : s < 0 ? 'wd' : 'dep') : 'wd';
        e.amt = Math.abs(s);
      } else if (d.wd > 0 && d.dep > 0) { e.errors.push('Both Withdrawal and Deposit are filled in on this row'); return; }
      else if (d.wd > 0) { dir = 'wd'; e.amt = d.wd; }
      else if (d.dep > 0) { dir = 'dep'; e.amt = d.dep; }
      else { e.errors.push('No amount on this row'); return; }
      if (!(e.amt > 0)) { e.errors.push('No amount on this row'); return; }
      if (e.amt >= 1e9) { e.errors.push('Amount is too large'); return; }
      const typeGiven = !!type;
      let catHit = null;
      if (!type) {
        catHit = d.catRaw ? findCatAny(d.catRaw) : null;
        if (dir === 'dep') type = 'income';
        else type = catHit && (catHit.kind === 'investment' || catHit.kind === 'transferout') ? catHit.kind : 'expense';
      }
      if (type === 'income' && dir !== 'dep') { e.errors.push('The type is Income but the amount is in the Withdrawal column'); return; }
      if (type !== 'income' && type !== 'transfer' && dir !== 'wd') { e.errors.push('The type is ' + C.typeLabel(type) + ' but the amount is in the Deposit column'); return; }
      e.type = type;
      // bank
      let bankName = d.bankRaw;
      let acct = '';
      if (!bankName) { if (ctx.defaultAcct) acct = ctx.defaultAcct; else { e.errors.push('No bank on this row. Choose a default bank.'); return; } }
      else {
        const b = findBank(bankName);
        if (b.skip) { e.errors.push('Rows for the bank "' + bankName + '" were left out'); return; }
        if (b.unknown) { e.pendingBank = true; e.errors.push('Bank "' + bankName + '" is not set up yet'); return; }
        acct = b.id;
      }
      e.acct = acct;
      if (type === 'transfer') {
        let other = '';
        if (xbank) {
          const b = findBank(xbank);
          if (b.skip) { e.errors.push('Transfer to or from "' + xbank + '" was left out'); return; }
          if (b.unknown) { e.pendingBank = true; e.errors.push('Bank "' + xbank + '" is not set up yet'); return; }
          other = b.id;
        }
        if (xdir === 'to' && dir === 'dep') { e.errors.push('The category says "Transfer to ' + xbank + '" but the amount is in the Deposit column'); return; }
        if (xdir === 'from' && dir === 'wd') { e.errors.push('The category says "Transfer from ' + xbank + '" but the amount is in the Withdrawal column'); return; }
        if (other && other === acct) { e.errors.push('A transfer needs two different banks'); return; }
        legs.push({ e, acct, other, dir: dir === 'wd' ? 'out' : 'in' });
        return;
      }
      // category
      const kind = type;
      if (d.catRaw) {
        const key = kind + '|' + normName(d.catRaw);
        const ov = catMapOv[key];
        const same = cats.find((c) => c.kind === kind && normName(c.name) === normName(d.catRaw));
        const mapped = ov && ov !== 'new' && ov !== 'none' ? ov : '';
        let cat = '';
        if (mapped) cat = mapped;
        else if (same && !ov) cat = same.id;
        else {
          const other = !ov ? findCatAny(d.catRaw) : null;
          if (other && other.kind !== kind) {
            if (!typeGiven && dir === 'wd' && other.kind !== 'income') { e.type = other.kind; cat = other.id; }
            else { e.errors.push('"' + d.catRaw + '" is a ' + C.typeLabel(other.kind) + ' category, not ' + C.typeLabel(kind)); return; }
          } else {
            const o = catNeeds.get(key) || { key, name: d.catRaw, kind, count: 0, choice: ov || (ctx.autoCreate ? 'new' : '') };
            o.count++; catNeeds.set(key, o);
            if (ov === 'none') cat = '';
            else if (ov === 'new' || ctx.autoCreate) {
              let nc = newCats.get(key);
              if (!nc) {
                let id = 'c_' + slug(d.catRaw); let i = 2;
                while (cats.some((c) => c.id === id) || [...newCats.values()].some((c) => c.id === id)) id = 'c_' + slug(d.catRaw) + '_' + i++;
                nc = { id, name: d.catRaw.slice(0, 60), kind, group: '', active: true, _g: { needs: 0, wants: 0, savings: 0 } };
                newCats.set(key, nc);
              }
              cat = nc.id; e._newCat = nc;
            } else { e.pendingCat = true; e.errors.push('Category "' + d.catRaw + '" is not set up yet'); return; }
          }
        }
        e.cat = cat;
      } else e.warns.push('No category');
      // group, as the Add form decides it
      const cm = cats.find((c) => c.id === e.cat) || (e._newCat || null);
      const kindNow = e.type;
      if (kindNow === 'investment') e.group = 'savings';
      else if (kindNow === 'expense') e.group = d.group === 'needs' || d.group === 'wants' ? d.group : cm && (cm.group === 'needs' || cm.group === 'wants') ? cm.group : 'wants';
      else if (kindNow === 'transferout') e.group = d.group ? d.group : cm && cm.group ? cm.group : 'needs';
      else e.group = '';
      if (e._newCat && e.group) e._newCat._g[e.group]++;
    });

    // ---- join own-account transfer rows ----
    const used = new Set();
    const finish = (out, inn, other) => {
      const e = out ? out.e : inn.e;
      e.acct = out ? out.acct : (inn.other || other);
      e.toAcct = out ? (inn ? inn.acct : out.other) : inn.acct;
      if (out && inn) {
        e.lines = [out.e.line, inn.e.line].sort((a, b) => a - b);
        e.id = out.e.id || inn.e.id; e.desc = out.e.desc || inn.e.desc; e.ref = out.e.ref || inn.e.ref; e.notes = out.e.notes || inn.e.notes;
        e.mode = out.e.mode || inn.e.mode; e.refLost = out.e.refLost && inn.e.refLost; e.slotGiven = out.e.slotGiven || inn.e.slotGiven;
        e.slot = out.e.slotGiven ? out.e.slot : inn.e.slotGiven ? inn.e.slot : out.e.slot;
        e.merged = true;
        inn.e.hidden = true; inn.e.errors = [];
      }
      e.group = ''; e.cat = '';
    };
    const byId = new Map();
    legs.forEach((l) => { if (l.e.id) { if (!byId.has(l.e.id)) byId.set(l.e.id, []); byId.get(l.e.id).push(l); } });
    byId.forEach((ls) => {
      const outs = ls.filter((l) => l.dir === 'out'), ins = ls.filter((l) => l.dir === 'in');
      if (outs.length === 1 && ins.length === 1 && outs[0].acct !== ins[0].acct && (!outs[0].other || outs[0].other === ins[0].acct) && (!ins[0].other || ins[0].other === outs[0].acct)) {
        const o = outs[0], i = ins[0];
        if (C.toP(o.e.amt) === C.toP(i.e.amt) && o.e.date === i.e.date) { used.add(o); used.add(i); finish(o, i); }
      }
    });
    const rest = legs.filter((l) => !used.has(l));
    const groups = new Map();
    rest.forEach((l) => { const k = l.e.date + '|' + C.toP(l.e.amt); if (!groups.has(k)) groups.set(k, { outs: [], ins: [] }); groups.get(k)[l.dir === 'out' ? 'outs' : 'ins'].push(l); });
    groups.forEach((g) => {
      // legs that name each other's bank pair even when the references differ; legs that name nothing pair only when exactly one fits
      const compat = (o, i, strict) => {
        if (used.has(i) || o.acct === i.acct) return false;
        if ((o.other && o.other !== i.acct) || (i.other && i.other !== o.acct)) return false;
        const both = o.other === i.acct && i.other === o.acct, named = o.other === i.acct || i.other === o.acct;
        const refOk = !o.e.ref || !i.e.ref || o.e.ref === i.e.ref;
        if (strict) return !!(o.e.ref && o.e.ref === i.e.ref);
        return (both || (refOk && (named || (g.outs.length === 1 && g.ins.length === 1))));
      };
      [true, false].forEach((strict) => {
        g.outs.forEach((o) => {
          if (used.has(o)) return;
          const m = g.ins.find((i) => compat(o, i, strict));
          if (m) { used.add(o); used.add(m); finish(o, m); }
        });
      });
    });
    legs.forEach((l) => {
      if (used.has(l)) return;
      if (!l.other) { l.e.errors.push('I cannot tell which bank this transfer went ' + (l.dir === 'out' ? 'to' : 'from') + ' (several transfers of the same amount on one day, or no matching row). Write "Transfer ' + (l.dir === 'out' ? 'to' : 'from') + ' <bank>" in Category.'); return; }
      used.add(l);
      if (l.dir === 'out') finish(l, null); else finish(null, l);
      l.e.type = 'transfer';
    });
    // ---- repeated IDs ----
    const seen = new Set();
    entries.forEach((e) => {
      if (e.hidden || e.errors.length || !e.id) return;
      if (seen.has(e.id)) { e.errors.push('Entry ID ' + e.id + ' is used by more than one row'); return; }
      seen.add(e.id);
    });
    entries.forEach((e) => {
      if (e.hidden || e.errors.length || !e.date) return;
      if (ctx.start && e.date < ctx.start) e.warns.push('Before the tracking start date, so balances ignore it');
      if (e.date > today) e.warns.push('Date is in the future');
    });
    // ---- new categories: group chosen by how the rows using them are counted ----
    const made = [...newCats.values()].map((c) => {
      const g = c._g; delete c._g;
      c.group = c.kind === 'investment' ? 'savings' : c.kind === 'income' ? '' : (g.needs > g.wants ? 'needs' : g.wants > 0 || c.kind === 'expense' ? 'wants' : 'needs');
      if (c.kind === 'transferout' && g.savings > g.needs && g.savings > g.wants) c.group = 'savings';
      return c;
    });
    entries.forEach((e) => { delete e._newCat; });
    const list = entries.filter((e) => !e.hidden);
    // an error that is only "not set up yet" is not final: it is shown as a choice
    return { entries: list, needs: { banks: [...bankNeeds.values()], cats: [...catNeeds.values()] }, newCats: made };
  }

  // ================= entries vs stored entries =================
  const FIELD_LABEL = { date: 'Date', slot: 'Slot', type: 'Type', acct: 'Bank', toAcct: 'To bank', cat: 'Category', desc: 'Description', amt: 'Amount', mode: 'Mode', ref: 'Reference', notes: 'Notes', group: 'Group' };
  const sameTxt = (a, b) => String(a || '').trim() === String(b || '').trim();
  function mergedOnto(e, old, provided) {
    const has = (k) => (provided ? provided[k] !== false : true);
    const type = has('type') || e.type === 'transfer' ? e.type : old.type;
    const m = {
      id: old.id, date: e.date, amt: e.amt, ts: old.ts, demo: old.demo || false, type,
      slot: e.slotGiven ? e.slot : old.slot,
      acct: type === 'transfer' ? (e.type === 'transfer' && e.toAcct ? e.acct : old.acct) : has('bank') ? e.acct : old.acct,
      toAcct: type === 'transfer' ? (e.type === 'transfer' && e.toAcct ? e.toAcct : old.toAcct) : '',
      cat: type === 'transfer' ? '' : has('cat') ? e.cat : old.cat,
      desc: has('desc') ? e.desc : old.desc,
      mode: has('mode') ? e.mode : old.mode,
      ref: has('ref') && !(e.refLost && old.ref) ? e.ref : old.ref,
      notes: has('notes') ? e.notes : old.notes,
      group: type === 'transfer' ? '' : e.groupGiven ? e.group : old.type === type ? old.group : e.group,
    };
    return m;
  }
  function changesOf(m, old) {
    const out = [];
    Object.keys(FIELD_LABEL).forEach((k) => {
      const a = m[k], b = old[k];
      if (k === 'amt' ? toP(a) !== toP(b) : !sameTxt(a, b)) out.push(k);
    });
    return out;
  }
  // existing: stored entries (Core.flatten output). opts: {update: bool (default true)}
  function plan(entries, existing, opts) {
    opts = opts || {};
    const byId = new Map(existing.map((t) => [t.id, t]));
    const claimed = new Set();
    const idx = new Map();
    const keyOf = (t) => (t.type === 'transfer' ? t.date + '|' + toP(t.amt) + '|T|' + t.acct + '|' + t.toAcct : t.date + '|' + toP(t.amt) + '|' + (t.type === 'income' ? 'in' : 'out') + '|' + t.acct);
    existing.forEach((t) => { const k = keyOf(t); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(t); });
    const rows = [];
    // ids first so a natural-key match can never steal an entry another row names by id
    entries.forEach((e) => { if (!e.errors.length && e.id && byId.has(e.id)) claimed.add(e.id); });
    entries.forEach((e) => {
      const row = { entry: e, status: 'new', existing: null, merged: null, changes: [], note: '' };
      rows.push(row);
      if (e.errors.length) { row.status = 'error'; row.note = e.errors[0]; return; }
      const old = e.id ? byId.get(e.id) : null;
      if (old) {
        const m = mergedOnto(e, old, e.provided);
        row.existing = old; row.merged = m; row.changes = changesOf(m, old);
        row.status = row.changes.length ? 'update' : 'same';
        if (e.refLost && old.ref) row.note = 'Kept the stored reference (Excel had shortened it)';
        return;
      }
      const cand = (idx.get(keyOf(e)) || []).filter((t) => !claimed.has(t.id));
      const eDesc = norm(e.desc);
      let hit = null, strong = false;
      if (e.ref) { hit = cand.find((t) => t.ref === e.ref); strong = !!hit; }
      if (!hit) hit = cand.find((t) => (!e.ref || !t.ref) && norm(t.desc) === eDesc);
      if (hit) { claimed.add(hit.id); row.existing = hit; row.status = strong ? 'dup' : 'maybe'; row.note = strong ? 'Same date, amount, bank and reference as a stored entry' : 'Same date, amount, bank and description as a stored entry'; }
    });
    return rows;
  }
  const countBy = (rows) => { const c = { new: 0, update: 0, same: 0, dup: 0, maybe: 0, error: 0 }; rows.forEach((r) => { c[r.status]++; }); return c; };

  // rows -> entries to store. opts: {update, importDups, now, newId}
  function commit(rows, opts) {
    opts = opts || {};
    const update = opts.update !== false;
    const now = opts.now || Date.now();
    const out = []; let i = 0;
    rows.forEach((r) => {
      const e = r.entry;
      if (r.status === 'update' && update) { out.push({ ...r.merged, demo: false }); return; }
      const isNew = r.status === 'new' || ((r.status === 'dup' || r.status === 'maybe') && opts.importDups);
      if (!isNew) return;
      out.push({
        id: e.id && !(opts.usedIds && opts.usedIds.has(e.id)) ? e.id : opts.newId(), date: e.date, slot: e.slot, type: e.type, acct: e.acct, toAcct: e.type === 'transfer' ? e.toAcct : '',
        cat: e.type === 'transfer' ? '' : e.cat, desc: e.desc, amt: e.amt, mode: e.mode, ref: e.ref, notes: e.notes, group: e.type === 'transfer' ? '' : e.group, demo: false, ts: now + i++,
      });
    });
    return out;
  }

  return {
    norm, normName, decodeText, parseCSV, parseTable, parseDate, parseMoney, cleanRef, resolve, plan, countBy, commit, mergedOnto, changesOf, FIELD_LABEL,
    exportWorkbook, templateWorkbook, lists, RECORD_COLS,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = IO;
