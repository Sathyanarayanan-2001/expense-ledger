'use strict';
/* XL: a small .xlsx writer and reader with no outside library (zip container + OOXML). Pure functions, no DOM.
   write(sheets) -> Uint8Array          read(arrayBuffer) -> Promise<{sheets:[{name,rows}], date1904}>        */
const XL = (function () {
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');

  // ---------- zip ----------
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zipStore(files) {
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const items = files.map((f) => ({ name: enc.encode(f.name), data: f.data, crc: crc32(f.data) }));
    let size = 22;
    items.forEach((i) => { size += 30 + i.name.length + i.data.length + 46 + i.name.length; });
    const out = new Uint8Array(size), dv = new DataView(out.buffer);
    let p = 0;
    const u16 = (v) => { dv.setUint16(p, v, true); p += 2; };
    const u32 = (v) => { dv.setUint32(p, v, true); p += 4; };
    items.forEach((i) => {
      i.off = p;
      u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(dosTime); u16(dosDate); u32(i.crc); u32(i.data.length); u32(i.data.length); u16(i.name.length); u16(0);
      out.set(i.name, p); p += i.name.length; out.set(i.data, p); p += i.data.length;
    });
    const cdStart = p;
    items.forEach((i) => {
      u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(dosTime); u16(dosDate); u32(i.crc); u32(i.data.length); u32(i.data.length); u16(i.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(i.off);
      out.set(i.name, p); p += i.name.length;
    });
    const cdLen = p - cdStart;
    u32(0x06054b50); u16(0); u16(0); u16(items.length); u16(items.length); u32(cdLen); u32(cdStart); u16(0);
    return out;
  }
  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed Excel files.');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('This is not an Excel (.xlsx) file.');
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    if (n === 0xffff || p === 0xffffffff) throw new Error('This Excel file is too large to open here.');
    const files = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The Excel file looks damaged.');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;
      files[name] = { method, csize, off };
    }
    const get = async (name) => {
      const f = files[name];
      if (!f) return null;
      const lh = f.off, nl = dv.getUint16(lh + 26, true), xl = dv.getUint16(lh + 28, true);
      const raw = u8.subarray(lh + 30 + nl + xl, lh + 30 + nl + xl + f.csize);
      if (f.method === 0) return raw;
      if (f.method === 8) return inflateRaw(raw);
      throw new Error('This Excel file uses a compression method that is not supported.');
    };
    return { names: Object.keys(files), get };
  }

  // ---------- xml helpers ----------
  const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const unesc = (s) => s
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const attrsOf = (s) => { const o = {}; const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let m; while ((m = re.exec(s))) o[m[1]] = unesc(m[2] !== undefined ? m[2] : m[3]); return o; };
  const colName = (i) => { let s = ''; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const colIndex = (letters) => { let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n - 1; };
  const serialOf = (iso) => { const p = iso.split('-'); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000); };

  // ---------- writer ----------
  // cell values: string, number, {d:'YYYY-MM-DD'}, {s:'text', st:'bold'|'title'|'wrap'}, null/'' for empty
  // column style: 'text' (kept as text), 'money', 'date'
  const STYLE = { header: 1, date: 2, money: 3, text: 4, wrap: 5, title: 6, bold: 7 };
  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mm\\-yyyy"/></numFmts>'
    + '<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font></fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF4"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF7A8794"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="8">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>'
    + '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function write(sheets) {
    const sst = []; const sstMap = new Map();
    const sid = (s) => { let i = sstMap.get(s); if (i === undefined) { i = sst.length; sst.push(s); sstMap.set(s, i); } return i; };
    const clip = (s) => (s.length > 32000 ? s.slice(0, 32000) : s);
    const sheetXml = sheets.map((sh) => {
      const cols = sh.cols || [];
      const hasHeader = sh.header !== false && cols.some((c) => c.header);
      const allRows = (hasHeader ? [cols.map((c) => ({ s: c.header || '', st: 'header' }))] : []).concat(sh.rows || []);
      let maxC = cols.length;
      allRows.forEach((r) => { if (r.length > maxC) maxC = r.length; });
      const rowsXml = allRows.map((r, ri) => {
        const cells = [];
        for (let ci = 0; ci < r.length; ci++) {
          const v = r[ci];
          if (v === null || v === undefined || v === '') continue;
          const ref = colName(ci) + (ri + 1);
          const col = cols[ci] || {};
          const colSt = ri === 0 && hasHeader ? 0 : STYLE[col.style] || 0;
          if (typeof v === 'number') { if (isFinite(v)) cells.push('<c r="' + ref + '"' + (colSt ? ' s="' + colSt + '"' : '') + '><v>' + v + '</v></c>'); }
          else if (typeof v === 'string') cells.push('<c r="' + ref + '"' + (colSt ? ' s="' + colSt + '"' : '') + ' t="s"><v>' + sid(clip(v)) + '</v></c>');
          else if (v.d) cells.push('<c r="' + ref + '" s="' + STYLE.date + '"><v>' + serialOf(v.d) + '</v></c>');
          else if (typeof v.s === 'string') { if (v.s !== '') cells.push('<c r="' + ref + '" s="' + (STYLE[v.st] || colSt || 0) + '" t="s"><v>' + sid(clip(v.s)) + '</v></c>'); }
        }
        return '<row r="' + (ri + 1) + '"' + (ri === 0 && hasHeader ? ' ht="30" customHeight="1"' : '') + '>' + cells.join('') + '</row>';
      }).join('');
      const last = allRows.length;
      const freeze = sh.freeze !== false && hasHeader;
      let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      x += '<dimension ref="A1:' + colName(Math.max(maxC - 1, 0)) + Math.max(last, 1) + '"/>';
      x += '<sheetViews><sheetView workbookViewId="0"' + (sh.showGrid === false ? ' showGridLines="0"' : '') + (sh.first ? ' tabSelected="1"' : '') + '>' + (freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '') + '</sheetView></sheetViews>';
      x += '<sheetFormatPr defaultRowHeight="15"/>';
      if (cols.some((c) => c.width)) x += '<cols>' + cols.map((c, i) => (c.width ? '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + c.width + '" customWidth="1"/>' : '')).join('') + '</cols>';
      x += '<sheetData>' + rowsXml + '</sheetData>';
      if (sh.filter && hasHeader && last > 1) x += '<autoFilter ref="A1:' + colName(cols.length - 1) + last + '"/>';
      const dvs = cols.map((c, i) => (c.list ? { i, ref: c.list } : null)).filter(Boolean);
      if (dvs.length) {
        const lastDv = Math.max(sh.validateRows || 0, last, 2);
        x += '<dataValidations count="' + dvs.length + '">' + dvs.map((d) => '<dataValidation type="list" errorStyle="warning" allowBlank="1" showErrorMessage="1" errorTitle="Not in the list" error="This value is not in the list. It can still be used, but the import will ask what to do with it." sqref="' + colName(d.i) + '2:' + colName(d.i) + lastDv + '"><formula1>' + esc(d.ref) + '</formula1></dataValidation>').join('') + '</dataValidations>';
      }
      x += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
      return x;
    });
    const ssXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + sst.length + '" uniqueCount="' + sst.length + '">'
      + sst.map((s) => '<si><t' + (/^\s|\s$|[\n\r\t]/.test(s) ? ' xml:space="preserve"' : '') + '>' + esc(s) + '</t></si>').join('') + '</sst>';
    const names = sheets.map((s) => String(s.name).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31));
    const files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>'
        + names.map((n, i) => '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
        + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId' + (sheets.length + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'],
      ['xl/styles.xml', STYLES_XML],
      ['xl/sharedStrings.xml', ssXml],
    ].concat(sheetXml.map((x, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', x]));
    return zipStore(files.map((f) => ({ name: f[0], data: enc.encode(f[1]) })));
  }

  // ---------- reader ----------
  function parseSheet(xml, sst) {
    const sd = /<sheetData[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml);
    const rows = [];
    if (!sd) return rows;
    const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
    let rm, autoRow = 0;
    while ((rm = rowRe.exec(sd[1]))) {
      const ra = attrsOf(rm[1]);
      const ri = ra.r ? +ra.r - 1 : autoRow;
      autoRow = ri + 1;
      if (!rm[2]) continue;
      const row = rows[ri] || (rows[ri] = []);
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm, autoCol = 0;
      while ((cm = cellRe.exec(rm[2]))) {
        const ca = attrsOf(cm[1]);
        let ci = autoCol;
        if (ca.r) { const mm = /^([A-Z]+)/.exec(ca.r); if (mm) ci = colIndex(mm[1]); }
        autoCol = ci + 1;
        const body = cm[2] || '';
        let val = '';
        const vm = /<v[^>]*>([\s\S]*?)<\/v>/.exec(body);
        const t = ca.t || 'n';
        if (t === 's') val = vm ? sst[+vm[1]] : '';
        else if (t === 'inlineStr') { const parts = []; body.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (m, x) => { parts.push(unesc(x)); return ''; }); val = parts.join(''); }
        else if (t === 'str' || t === 'd') val = vm ? unesc(vm[1]) : '';
        else if (t === 'b') val = vm ? vm[1] === '1' : false;
        else if (t === 'e') val = '';
        else if (vm && vm[1] !== '') { const n = Number(vm[1]); val = isFinite(n) ? n : unesc(vm[1]); }
        if (val !== '') row[ci] = val;
      }
    }
    for (let i = 0; i < rows.length; i++) { rows[i] = rows[i] || []; for (let j = 0; j < rows[i].length; j++) if (rows[i][j] === undefined) rows[i][j] = ''; }
    return rows;
  }
  async function read(buf) {
    const z = await unzip(buf);
    const text = async (n) => { const d = await z.get(n); return d ? dec.decode(d) : null; };
    const wbXml = await text('xl/workbook.xml');
    if (!wbXml) throw new Error('This is not an Excel (.xlsx) file.');
    const relsXml = (await text('xl/_rels/workbook.xml.rels')) || '';
    const rels = {};
    relsXml.replace(/<Relationship\b([^>]*?)\/?>/g, (m, a) => { const o = attrsOf(a); rels[o.Id] = o.Target; return ''; });
    const sstXml = await text('xl/sharedStrings.xml');
    const sst = [];
    if (sstXml) sstXml.replace(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g, (m, si) => {
      const parts = [];
      (si || '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (mm, x) => { parts.push(unesc(x)); return ''; });
      sst.push(parts.join('')); return '';
    });
    const date1904 = /<workbookPr\b[^>]*date1904\s*=\s*"(1|true)"/i.test(wbXml);
    const sheets = [];
    const list = [];
    wbXml.replace(/<sheet\b([^>]*?)\/?>/g, (m, a) => { list.push(attrsOf(a)); return ''; });
    for (const s of list) {
      let target = rels[s['r:id']];
      if (!target) continue;
      target = target.replace(/^\//, '');
      const path = target.startsWith('xl/') ? target : 'xl/' + target;
      const xml = await text(path);
      if (xml === null) continue;
      sheets.push({ name: s.name, hidden: s.state === 'hidden' || s.state === 'veryHidden', rows: parseSheet(xml, sst) });
    }
    return { sheets, date1904 };
  }

  return { write, read, crc32, colName, serialOf, unzip };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = XL;
