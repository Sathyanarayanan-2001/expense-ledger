'use strict';
// Import/export units: expectations worked out by hand, plus each defect an independent reviewer reproduced.
const C = require('../src/core.js'); global.Core = C;
const IO = require('../src/ioformat.js'); const XL = require('../src/xlsx.js');
let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (ok) pass++; else { fail++; console.log('FAIL', name, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)); } };
const cfg = C.normCfg(null);
const A = { hdfc: 'a_hdfc', uco: 'a_uco', ind: 'a_indian', cash: 'a_cash' };
const T = (id, date, type, acct, o) => ({ id, date, slot: 'morning', type, acct, toAcct: '', cat: '', desc: '', amt: 0, mode: '', ref: '', notes: '', group: '', demo: false, ts: +String(id).replace(/\D/g, '') || 1, ...o });
const run = (table, opts, ctx, existing) => {
  const t = IO.parseTable(table, opts || { csv: true });
  if (!t.ok) return { t };
  const res = IO.resolve(t.drafts, cfg, { provided: t.provided, today: '2026-11-01', autoCreate: true, ...(ctx || {}) });
  const rows = IO.plan(res.entries, existing || [], {});
  return { t, res, rows, st: rows.map((r) => r.status) };
};

// ---------- text and csv ----------
eq('csv basic', IO.parseCSV('a,b\r\n1,"x, y"\r\n"he said ""hi""",3\n'), [['a', 'b'], ['1', 'x, y'], ['he said "hi"', '3']]);
eq('csv two BOMs', IO.parseCSV('﻿﻿a,b\n1,2')[0], ['a', 'b']);
eq('csv semicolon', IO.parseCSV('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
eq('csv sep line', IO.parseCSV('sep=;\na;b\n1;2'), [['a', 'b'], ['1', '2']]);
eq('csv tab', IO.parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
eq('csv embedded newline', IO.parseCSV('a,b\n"x\ny",2')[1], ['x\ny', '2']);
eq('csv unterminated quote is flagged', IO.parseCSV('a,b\n1,"oops\n2,3\n').unterminated, true);
eq('csv fine file is not flagged', !!IO.parseCSV('a,b\n1,"ok"\n').unterminated, false);
eq('decode utf8', IO.decodeText(new TextEncoder().encode('₹ ü')), '₹ ü');
eq('decode BOM then cp1252 bytes', IO.decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x44, 0x61, 0x74, 0x65, 0x20, 0xe9])), 'Date é');
eq('decode utf16le', IO.decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00])), 'AB');

// ---------- dates ----------
const pd = IO.parseDate;
eq('iso', pd('2026-10-01', 'dmy'), '2026-10-01'); eq('dmy dash', pd('01-10-2026', 'dmy'), '2026-10-01'); eq('dmy slash short year', pd('1/10/26', 'dmy'), '2026-10-01');
eq('month name', pd('1-Oct-2026', 'dmy'), '2026-10-01'); eq('month first name', pd('Oct 1, 2026', 'dmy'), '2026-10-01'); eq('mdy order', pd('10/13/2026', 'mdy'), '2026-10-13');
eq('time suffix', pd('01-10-2026 10:30', 'dmy'), '2026-10-01'); eq('invalid day', pd('31-02-2026', 'dmy'), null); eq('garbage', pd('hello', 'dmy'), null);
eq('serial 1900 system', pd(46296, 'dmy', false), '2026-10-01'); eq('serial 1904 system', pd(46296 - 1462, 'dmy', true), '2026-10-01'); eq('text serial', pd('46296', 'dmy', false), '2026-10-01');
const H = ['Date', 'Withdrawal amount', 'Bank', 'Category'];
const orderOf = (dates) => { const t = IO.parseTable([H].concat(dates.map((d) => [d, '10', 'HDFC', 'Miscellaneous'])), { csv: true }); return [t.dateOrder, t.dateAmbiguous > 0]; };
eq('day above 12 proves day-first', orderOf(['13-10-2026', '05-10-2026']), ['dmy', false]);
eq('second part above 12 proves month-first', orderOf(['10/13/2026', '10/05/2026']), ['mdy', false]);
eq('time suffix still counts as evidence', orderOf(['10/13/2026 10:30', '10/5/2026 09:00']), ['mdy', false]);
eq('all ambiguous: day-first, flagged for the user', orderOf(['01-10-2026', '02-11-2026']), ['dmy', true]);

// ---------- money and references ----------
const pm = IO.parseMoney;
eq('plain', pm('215.76').v, 215.76); eq('thousands', pm('1,250.50').v, 1250.5); eq('lakh grouping', pm('1,23,456').v, 123456); eq('rupee sign', pm('₹ 500').v, 500);
eq('decimal comma is refused', pm('250,50').bad, true); eq('european is refused', pm('1.234,56').bad, true); eq('letters refused', pm('abc').bad, true);
eq('parentheses negative', pm('(250.00)').v, -250); eq('Dr suffix', [pm('500.00 Dr').v, pm('500.00 Dr').dc], [500, 'dr']); eq('dash is empty', pm('-').empty, true);
eq('three decimals rounds and warns', [pm('10.456').v, pm('10.456').extraDecimals], [10.46, true]);
eq('ref number cell', IO.cleanRef(627400000123, false).ref, '627400000123'); eq('ref lost to excel', IO.cleanRef('6.27401E+11', true).lost, true);
eq('ref guard unwrapped', IO.cleanRef('="627400000123"', true).ref, '627400000123'); eq('ref 12345.0 stays as written', IO.cleanRef('12345.0', true).ref, '12345.0'); eq('ref leading zeros kept', IO.cleanRef('000123', true).ref, '000123');

// ---------- csv writing guards ----------
const guard = (v) => C.toCSV([{ Date: '01-10-2026', _iso: '2026-10-01', Description: v }]).split('\r\n')[1];
eq('iso date is not guarded', guard('x').startsWith('2026-10-01,'), true);
const back = (v) => { const rows = IO.parseCSV(C.toCSV([{ _iso: '2026-10-01', Date: 'x', Description: v, 'Withdrawal amount': 5, Bank: 'HDFC' }])); const t = IO.parseTable(rows, { csv: true }); return t.drafts[0].desc; };
['=evil', "'=evil", "'-5 off", '-5 off', '@x', '5-10', '10,000', '1/2', 'Oct-2026', '000123', '627400000123', 'TRUE', 'plain', 'say "hi", ok'].forEach((v) => eq('csv text survives export and import: ' + v, back(v), v));

// ---------- pipeline ----------
const hdr = ['Date', 'Slot', 'Bank', 'Description', 'Category', 'Mode of payment', 'Withdrawal amount', 'Deposit amount', 'Bank reference no', 'Notes', 'Group', 'Month', 'CW', 'Type', 'Entry ID'];
const stored = [
  T('e1', '2026-10-01', 'expense', A.hdfc, { cat: 'c_groc', desc: 'Veg', amt: 250, group: 'needs', ref: '627400000123', mode: 'UPI', notes: 'weekly' }),
  T('e2', '2026-10-02', 'income', A.hdfc, { cat: 'c_sal', desc: 'Salary', amt: 50000 }),
  T('e3', '2026-10-03', 'transfer', A.hdfc, { toAcct: A.cash, amt: 3000, desc: 'Cash', ref: 'R1' }),
  T('e4', '2026-10-04', 'transferout', A.uco, { cat: 'c_fam', desc: 'Home', amt: 8000, group: 'needs' }),
  T('e5', '2026-10-05', 'investment', A.hdfc, { cat: 'c_sip', desc: 'SIP', amt: 5000, group: 'savings' }),
  T('e6', '2026-10-03', 'transfer', A.hdfc, { toAcct: A.cash, amt: 3000, desc: 'Cash again', ref: 'R2' }),
];
const exported = C.exportRows(cfg, stored);
const csvTable = IO.parseCSV(C.toCSV(exported));
let r = run(csvTable, { csv: true }, {}, stored);
eq('round trip csv: every entry unchanged', r.st, ['same', 'same', 'same', 'same', 'same', 'same']);
eq('round trip csv: 2 transfers joined from 4 rows', [r.t.drafts.length, r.res.entries.length], [8, 6]);
// 1 a partial row never blanks what the file did not say
r = run([['Entry ID', 'Date', 'Withdrawal amount', 'Bank'], ['e3', '03-10-2026', '3000', 'HDFC']], { csv: true }, {}, stored);
eq('partial row for a stored transfer changes nothing', r.st, ['same']);
r = run([['Entry ID', 'Date', 'Deposit amount', 'Bank'], ['e3', '03-10-2026', '3000', 'Cash wallet']], { csv: true }, {}, stored);
eq('deposit-only row for a stored transfer changes nothing', r.st, ['same']);
r = run([['Entry ID', 'Date', 'Withdrawal amount'], ['e1', '01-10-2026', '260']], { csv: true }, { defaultAcct: A.hdfc }, stored);
eq('amount-only update keeps ref, notes, category, bank, slot', [r.st, r.rows[0].changes, r.rows[0].merged.ref, r.rows[0].merged.notes, r.rows[0].merged.cat, r.rows[0].merged.acct, r.rows[0].merged.slot], [['update'], ['amt'], '627400000123', 'weekly', 'c_groc', 'a_hdfc', 'morning']);
r = run([['Entry ID', 'Date', 'Slot', 'Withdrawal amount', 'Notes', 'Bank'], ['e1', '01-10-2026', '', '250', '', 'HDFC']], { csv: true }, {}, stored);
eq('a blank Notes cell clears the note, a blank Slot keeps the slot', [r.rows[0].changes, r.rows[0].merged.slot], [['notes'], 'morning']);
// 2 legs with different references still pair when each names the other bank
r = run([['Date', 'Withdrawal amount', 'Deposit amount', 'Bank', 'Category', 'Bank reference no', 'Type'], ['03-10-2026', '3000', '', 'HDFC', 'Transfer to Cash wallet', 'AAA', 'Own-account transfer'], ['03-10-2026', '', '3000', 'Cash wallet', 'Transfer from HDFC', 'BBB', 'Own-account transfer']], { csv: true });
eq('different references on the two legs: one transfer', [r.res.entries.length, r.res.entries[0].merged, r.res.entries[0].acct, r.res.entries[0].toAcct], [1, true, A.hdfc, A.cash]);
// 8 unnamed same-day same-amount legs are not paired by guesswork
r = run([['Date', 'Withdrawal amount', 'Deposit amount', 'Bank', 'Type'], ['03-10-2026', '500', '', 'HDFC', 'Own-account transfer'], ['03-10-2026', '500', '', 'UCO Bank', 'Own-account transfer'], ['03-10-2026', '', '500', 'Cash wallet', 'Own-account transfer'], ['03-10-2026', '', '500', 'Indian Bank', 'Own-account transfer']], { csv: true });
eq('ambiguous transfer legs are flagged, not guessed', r.st, ['error', 'error', 'error', 'error']);
r = run([['Date', 'Withdrawal amount', 'Deposit amount', 'Bank', 'Type'], ['03-10-2026', '500', '', 'HDFC', 'Own-account transfer'], ['03-10-2026', '', '500', 'Cash wallet', 'Own-account transfer']], { csv: true });
eq('a single unnamed pair is joined', [r.st, r.res.entries[0].acct, r.res.entries[0].toAcct], [['new'], A.hdfc, A.cash]);
// 6 money out cannot land in an income category
r = run([['Date', 'Withdrawal amount', 'Bank', 'Category'], ['03-10-2026', '500', 'HDFC', 'Salary']], { csv: true });
eq('withdrawal with an income category is an error', r.st, ['error']);
r = run([['Date', 'Deposit amount', 'Bank', 'Category'], ['03-10-2026', '500', 'HDFC', 'Groceries and vegetables']], { csv: true });
eq('deposit with an expense category is an error', r.st, ['error']);
r = run([['Date', 'Withdrawal amount', 'Bank', 'Category'], ['03-10-2026', '500', 'HDFC', 'FD and RD']], { csv: true });
eq('withdrawal with a savings category becomes savings', [r.res.entries[0].type, r.res.entries[0].group], ['investment', 'savings']);
// 5 negative amounts and Dr/Cr
r = run([['Date', 'Withdrawal amount', 'Bank', 'Category'], ['03-10-2026', '(250)', 'HDFC', 'Miscellaneous']], { csv: true });
eq('negative withdrawal is an error', r.st, ['error']);
r = run([['Date', 'Amount', 'Bank', 'Category'], ['03-10-2026', '500.00 Dr', 'HDFC', 'Miscellaneous'], ['04-10-2026', '500.00 Cr', 'HDFC', 'Salary']], { csv: true });
eq('Dr and Cr decide the direction', r.res.entries.map((e) => [e.type, e.amt]), [['expense', 500], ['income', 500]]);
r = run([['Date', 'Withdrawal amount', 'Bank', 'Category'], ['03-10-2026', '250,50', 'HDFC', 'Miscellaneous']], { csv: true });
eq('decimal comma amount is refused, not read as 25,050', r.st, ['error']);
// 7 loose bank names are offered, never applied silently
r = run([['Date', 'Withdrawal amount', 'Bank', 'Category'], ['03-10-2026', '500', 'HDFC Credit Card', 'Miscellaneous']], { csv: true }, { autoCreate: false });
eq('near-match bank is a choice with a suggestion', [r.st, r.res.needs.banks.map((b) => [b.name, b.suggest])], [['error'], [['HDFC Credit Card', 'a_hdfc']]]);
r = run([['Date', 'Withdrawal amount', 'Bank', 'Category'], ['03-10-2026', '500', 'HDFC Credit Card', 'Miscellaneous']], { csv: true }, { bankMap: { hdfccreditcard: 'a_hdfc' } });
eq('after choosing, the choice stays listed and the row imports', [r.st, r.res.needs.banks.length], [['new'], 1]);
// wallets and savings accounts: a wallet imports like a bank, a savings account never receives entries
{
  const cfgS = C.normCfg({ ...cfg, accounts: [...cfg.accounts, { id: 'a_rail', name: 'RailOne', kind: 'wallet', opening: 0, active: true }, { id: 'a_epfo', name: 'EPFO', kind: 'savings', opening: 0, active: true }] });
  const tt = IO.parseTable([['Date', 'Withdrawal amount', 'Bank', 'Category', 'Mode of payment'], ['03-10-2026', '120', 'RailOne', 'Miscellaneous', 'Wallet'], ['04-10-2026', '500', 'EPFO', 'Miscellaneous', '']], { csv: true });
  const rs = IO.resolve(tt.drafts, cfgS, { provided: tt.provided, today: '2026-11-01', autoCreate: false });
  const pl = IO.plan(rs.entries, [], {});
  eq('a wallet name matches its account and the Wallet mode is read', [rs.entries[0].acct, rs.entries[0].mode, pl[0].status], ['a_rail', 'Wallet', 'new']);
  eq('a savings account name is not matched, so the row is held back and the bank is asked about', [pl[1].status, rs.needs.banks.map((b) => b.name)], ['error', ['EPFO']]);
  { const m = IO.parseTable([['Date', 'Withdrawal amount', 'Bank', 'Category', 'Mode of payment'], ['03-10-2026', '10', 'HDFC', 'Miscellaneous', 'wallet'], ['03-10-2026', '10', 'HDFC', 'Miscellaneous', 'E-Wallet']], { csv: true }); eq('mode aliases wallet and e-wallet read as Wallet', m.drafts.map((d) => d.mode), ['Wallet', 'Wallet']); }
}
// 10 category names that look like transfers
r = run([['Date', 'Withdrawal amount', 'Bank', 'Category', 'Type'], ['03-10-2026', '500', 'UCO Bank', 'Transfer to parents', 'Sent to others']], { csv: true }, { autoCreate: true });
eq('a typed category named like a transfer stays a category', [r.res.entries[0].type, r.res.newCats.map((c) => c.name)], ['transferout', ['Transfer to parents']]);
// ids
r = run([['Entry ID', 'Date', 'Withdrawal amount', 'Bank', 'Category'], ['n1', '03-10-2026', '5', 'HDFC', 'Miscellaneous'], ['n1', '03-10-2026', '6', 'HDFC', 'Miscellaneous']], { csv: true });
eq('an Entry ID used twice in the file is an error on the second', r.st, ['new', 'error']);
// duplicates against stored entries
r = run([['Date', 'Withdrawal amount', 'Bank', 'Description', 'Bank reference no', 'Category'], ['01-10-2026', '250', 'HDFC', 'Different words', '627400000123', 'Groceries and vegetables'], ['01-10-2026', '250', 'HDFC', 'Veg', '', 'Groceries and vegetables'], ['01-10-2026', '250', 'HDFC', 'Veg', '', 'Groceries and vegetables']], { csv: true }, {}, stored);
eq('same reference is a duplicate; the stored entry is used up, so identical rows after it are new', r.st, ['dup', 'new', 'new']);
r = run([['Date', 'Withdrawal amount', 'Bank', 'Description', 'Category'], ['01-10-2026', '250', 'HDFC', 'Veg', 'Groceries and vegetables'], ['01-10-2026', '250', 'HDFC', 'Veg', 'Groceries and vegetables']], { csv: true }, {}, stored);
eq('same date, amount, bank and description: probably stored, then one-to-one', r.st, ['maybe', 'new']);
r = run([['Date', 'Withdrawal amount', 'Bank', 'Description', 'Bank reference no', 'Category'], ['01-10-2026', '250', 'HDFC', 'Veg', '999999999999', 'Groceries and vegetables']], { csv: true }, {}, stored);
eq('a different reference means a different transaction', r.st, ['new']);
// commit
r = run([['Entry ID', 'Date', 'Withdrawal amount', 'Bank', 'Category', 'Description'], ['e1', '01-10-2026', '260', 'HDFC', 'Groceries and vegetables', 'Veg'], ['', '09-10-2026', '40', 'HDFC', 'Miscellaneous', 'Tea']], { csv: true }, {}, stored);
let n = 0; const out = IO.commit(r.rows, { newId: () => 'new' + ++n, now: 1000 });
eq('commit: update keeps id and ts, new row gets a fresh id and later ts', [out.map((t) => t.id), out[0].ts, out[1].ts, out[1].group, out[1].demo], [['e1', 'new1'], 1, 1000, 'wants', false]);
eq('commit without update leaves stored entries alone', IO.commit(r.rows, { update: false, newId: () => 'z', now: 5 }).map((t) => t.id), ['z']);
// statements: footers and merged headers
r = run([['Preamble line'], ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Balance'], ['02/04/2026', 'UPI/x', '40.00', '', '1,000.00'], ['', 'blank date no amount'], ['Total', '', '40.00', '0', ''], ['Note: NEFT means ...']], { csv: true }, { defaultAcct: A.hdfc });
eq('statement: header found below a preamble, footers ignored', [r.t.headerRow, r.t.drafts.length, r.t.ignored, r.st], [2, 1, 3, ['new']]);
const merged = [['', '', 'Tran. Date', '', 'Withdrawl', '', 'Deposit', '', 'Narration'], ['', '', '18/04/2026', '', '', '2,000.00', '', '', 'MPAY 1'], ['', '', '19/04/2026', '', '', '', '', '3,000.00', 'MPAY 2']];
r = run(merged, { csv: false }, { defaultAcct: A.uco });
eq('merged header cells: figures one column to the side are found', r.res.entries.map((e) => [e.type, e.amt]), [['expense', 2000], ['income', 3000]]);
r = run([['Date', 'Withdrawal amount', 'Deposit amount', 'Balance'], ['01-10-2026', '5', '', '100'], ['02-10-2026', '6', '', '94']], { csv: true }, { defaultAcct: A.hdfc });
eq('an empty Deposit column is not stolen by a Balance column', r.st, ['new', 'new']);
// robustness
eq('null and ragged rows do not throw', IO.parseTable([['Date', 'Withdrawal amount', 'Bank'], null, ['01-10-2026'], ['01-10-2026', '5', 'HDFC', 'extra', 'more']], { csv: true }).ok, true);
eq('header only', IO.parseTable([['Date', 'Withdrawal amount']], { csv: true }).drafts.length, 0);
eq('no header', IO.parseTable([['a', 'b'], ['1', '2']], { csv: true }).ok, false);
// scale
const big = [['Date', 'Withdrawal amount', 'Bank', 'Description', 'Category']]; for (let i = 0; i < 5000; i++) big.push(['0' + (1 + (i % 9)) + '-10-2026', String(10 + (i % 90)), 'HDFC', 'Item ' + i, 'Miscellaneous']);
const t0 = Date.now(); r = run(big, { csv: true }, {}, stored); const ms = Date.now() - t0;
eq('5,000 rows import in under 3 seconds', [r.st.length, ms < 3000], [5000, true]);

function summary() { console.log(`io unit tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
// minimal store-only zip used to hand-build a package
function zipOf(files) {
  const names = Object.keys(files); const parts = []; const central = []; let off = 0;
  const u16 = (v) => Buffer.from([v & 255, (v >> 8) & 255]); const u32 = (v) => Buffer.from([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
  names.forEach((n) => { const nb = Buffer.from(n); const d = Buffer.from(files[n]); const crc = XL.crc32(d);
    const lh = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(d.length), u32(d.length), u16(nb.length), u16(0), nb, d]);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(d.length), u32(d.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nb])); parts.push(lh); off += lh.length; });
  const cd = Buffer.concat(central);
  return new Uint8Array(Buffer.concat(parts.concat([cd, u32(0x06054b50), u16(0), u16(0), u16(names.length), u16(names.length), u32(cd.length), u32(off), u16(0)])));
}
const xb = XL.write(IO.exportWorkbook(cfg, stored, '2026-11-01'));
(async () => {
  const x = await XL.read(xb);
  eq('xlsx sheets', x.sheets.map((s) => s.name), ['Records', 'Monthly summary', 'Lists', 'Read me']);
  const rx = run(x.sheets[0].rows, { csv: false, date1904: x.date1904 }, {}, stored);
  eq('round trip xlsx: every entry unchanged', rx.st, ['same', 'same', 'same', 'same', 'same', 'same']);
  eq('xlsx date cell is a serial number', x.sheets[0].rows[1][0], 46296);
  eq('xlsx keeps a 12-digit reference as text', x.sheets[0].rows[1][8], '627400000123');

  // writer/reader edge cases
  const w = XL.write([{ name: 'A/B:C*?', cols: [{ header: 'x' }], rows: [['<&>"\'', ' pad ', 'line\nbreak', '₹ ü 😀'], [1.5, { d: '2026-02-28' }, null, 'z']] }]);
  const y = await XL.read(w);
  eq('sheet name cleaned', y.sheets[0].name, 'A B C  ');
  eq('special characters round trip', y.sheets[0].rows[1], ['<&>"\'', ' pad ', 'line\nbreak', '₹ ü 😀']);
  eq('number and date cells', [y.sheets[0].rows[2][0], y.sheets[0].rows[2][1], y.sheets[0].rows[2][3]], [1.5, 46081, 'z']);
  // a shared string table with an empty self-closing <si/> must not shift later strings: build a package by hand
  const enc = new TextEncoder();
  const base = await XL.unzip(XL.write([{ name: 'S', cols: [{ header: 'a' }], rows: [['one', 'two']] }]));
  const files = {};
  for (const nm of base.names) files[nm] = await base.get(nm);
  files['xl/sharedStrings.xml'] = enc.encode('<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3"><si><t>a</t></si><si/><si><t>two</t></si></sst>');
  const sheet = new TextDecoder().decode(files['xl/worksheets/sheet1.xml']).replace(/<c r="A2" t="s"><v>\d+<\/v><\/c>/, '<c r="A2" t="s"><v>2</v></c>').replace(/<c r="B2" t="s"><v>\d+<\/v><\/c>/, '<c r="B2" t="s"><v>1</v></c>');
  files['xl/worksheets/sheet1.xml'] = enc.encode(sheet);
  const pkg = zipOf(files);
  const z2 = await XL.read(pkg);
  eq('empty <si/> keeps later strings aligned', z2.sheets[0].rows[1], ['two']);
  summary();
})();

