'use strict';
/* Charts: hand-drawn SVG, one shared scale per chart, hover + keyboard tooltips, table view for every chart. */
const Charts = (function () {
  const INR = (x) => Core.fmtINR(x, { dec: 0 });
  function niceStep(raw) {
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function scaleMax(maxVal) {
    if (!(maxVal > 0)) return { max: 4000, step: 1000 };
    const step = niceStep(maxVal / 4);
    return { max: step * Math.ceil(maxVal / step - 1e-9), step };
  }
  const S = (tag, attrs, ...kids) => h(tag, attrs, ...kids);
  function watchSize(host, redraw) {
    if (host._ro) return;
    if (typeof ResizeObserver === 'undefined') return;
    let w = host.clientWidth;
    host._ro = new ResizeObserver(() => { if (Math.abs(host.clientWidth - w) > 2) { w = host.clientWidth; redraw(); } });
    host._ro.observe(host);
  }
  function legend(items) {
    return h('div', { class: 'legend' }, items.map((i) => h('span', null, h('i', { class: i.line ? 'line' : '', style: { background: i.color } }), i.name)));
  }

  // grouped columns: cfg {labels, series:[{name,color,values}], height, annotate (series index), tipTitle(i), fmt}
  function columns(host, cfg) {
    const draw = () => {
      clear(host);
      const W = Math.max(280, host.clientWidth || 320);
      const H = cfg.height || 230;
      const m = { l: 48, r: 8, t: 14, b: 28 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const n = cfg.labels.length, k = cfg.series.length;
      const maxVal = Math.max(0, ...cfg.series.map((s) => Math.max(0, ...s.values)));
      const sc = scaleMax(maxVal);
      const y = (v) => m.t + ih - (v / sc.max) * ih;
      const band = iw / n;
      const th = Math.max(2, Math.min(24, (band * 0.78 - 2 * (k - 1)) / k));
      const gw = k * th + (k - 1) * 2;
      const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cfg.aria || 'Column chart' });
      for (let v = 0; v <= sc.max + 1e-6; v += sc.step) {
        svg.appendChild(S('line', { class: v === 0 ? 'axis' : 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
        svg.appendChild(S('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, v === 0 ? '0' : Core.fmtCompact(v)));
      }
      const every = band < 26 ? Math.ceil(26 / band) : 1;
      cfg.labels.forEach((lb, i) => {
        if (i % every === 0) svg.appendChild(S('text', { x: m.l + band * i + band / 2, y: H - 8, 'text-anchor': 'middle' }, lb));
      });
      cfg.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          if (!(v > 0)) return;
          const x = m.l + band * i + (band - gw) / 2 + si * (th + 2);
          const top = y(v), base = y(0), hgt = base - top, r = Math.min(4, th / 2, hgt);
          const d = hgt <= 1 ? 'M' + x + ',' + base + 'h' + th + 'v-1h-' + th + 'z'
            : 'M' + x + ',' + base + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top + 'H' + (x + th - r) + 'Q' + (x + th) + ',' + top + ' ' + (x + th) + ',' + (top + r) + 'V' + base + 'Z';
          svg.appendChild(S('path', { d, style: { fill: s.color } }));
        });
      });
      if (cfg.annotate !== undefined && n <= 16) {
        let si = cfg.annotate, mx = 0, i = -1;
        cfg.series.forEach((s, k) => s.values.forEach((v, j) => { if (v > mx && (cfg.annotate === 'max' || k === cfg.annotate)) { mx = v; i = j; si = k; } }));
        if (mx > 0) {
          const x = m.l + band * i + (band - gw) / 2 + si * (th + 2) + th / 2;
          svg.appendChild(S('text', { class: 'lbl', x: Math.min(Math.max(x, m.l + 14), W - m.r - 14), y: y(mx) - 6, 'text-anchor': 'middle' }, Core.fmtCompact(mx)));
        }
      }
      cfg.labels.forEach((lb, i) => {
        const rows = cfg.series.map((s) => ({ color: s.color, name: s.name, value: INR(s.values[i]) }));
        const title = cfg.tipTitle ? cfg.tipTitle(i) : lb;
        const hit = S('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ih, tabindex: 0, role: 'img', 'aria-label': title + ': ' + rows.map((r) => r.name + ' ' + r.value).join(', ') });
        const show = (e) => { const b = hit.getBoundingClientRect(); Tip.show(tipRows(title, rows), e && e.clientX !== undefined && e.type !== 'focus' ? e.clientX : b.left + b.width / 2, e && e.clientY !== undefined && e.type !== 'focus' ? e.clientY : b.top + 20); };
        hit.addEventListener('pointermove', show); hit.addEventListener('focus', show);
        hit.addEventListener('pointerleave', Tip.hide); hit.addEventListener('blur', Tip.hide);
        svg.appendChild(hit);
      });
      if (!cfg.series.some((s) => s.values.some((v) => v > 0))) svg.appendChild(S('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }, cfg.emptyText || 'No entries in this range yet'));
      host.appendChild(svg);
    };
    draw();
    watchSize(host, draw);
  }

  // lines over days: cfg {days, series:[{name,color,points:[{day,value}]}], height, endLabel}
  function lines(host, cfg) {
    const draw = () => {
      clear(host);
      const W = Math.max(280, host.clientWidth || 320), H = cfg.height || 230;
      const m = { l: 48, r: 56, t: 14, b: 28 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const maxVal = Math.max(0, ...cfg.series.map((s) => Math.max(0, ...s.points.map((p) => p.value))));
      const sc = scaleMax(maxVal);
      const x = (d) => m.l + (iw * (d - 1)) / Math.max(1, cfg.days - 1);
      const y = (v) => m.t + ih - (v / sc.max) * ih;
      const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cfg.aria || 'Line chart' });
      for (let v = 0; v <= sc.max + 1e-6; v += sc.step) {
        svg.appendChild(S('line', { class: v === 0 ? 'axis' : 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
        svg.appendChild(S('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, v === 0 ? '0' : Core.fmtCompact(v)));
      }
      for (let d = 1; d <= cfg.days; d++) if (d === 1 || d === cfg.days || (cfg.days <= 12 ? true : d % 5 === 0)) svg.appendChild(S('text', { x: x(d), y: H - 8, 'text-anchor': 'middle' }, String(d)));
      cfg.series.forEach((s) => {
        if (!s.points.length) return;
        svg.appendChild(S('path', { d: s.points.map((p, i) => (i ? 'L' : 'M') + x(p.day).toFixed(1) + ',' + y(p.value).toFixed(1)).join(''), fill: 'none', style: { stroke: s.color }, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        const last = s.points[s.points.length - 1];
        svg.appendChild(S('circle', { cx: x(last.day), cy: y(last.value), r: 5, style: { fill: s.color, stroke: 'var(--surface)' }, 'stroke-width': 2 }));
        svg.appendChild(S('text', { class: 'lbl', x: Math.min(x(last.day) + 9, W - 4), y: y(last.value) + 4, 'text-anchor': 'start' }, Core.fmtCompact(last.value)));
      });
      const cross = S('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, 'stroke-width': 1, style: { stroke: 'var(--axis)', display: 'none' } });
      svg.appendChild(cross);
      const hit = S('rect', { class: 'hit', x: m.l, y: m.t, width: iw, height: ih, tabindex: 0, 'aria-label': cfg.aria || 'Chart values', style: { fill: 'transparent' } });
      const at = (clientX) => {
        const b = svg.getBoundingClientRect();
        const px = ((clientX - b.left) / b.width) * W;
        return Math.min(cfg.days, Math.max(1, Math.round(1 + ((px - m.l) / iw) * (cfg.days - 1))));
      };
      const show = (d, cx, cy) => {
        cross.setAttribute('x1', x(d)); cross.setAttribute('x2', x(d)); cross.style.display = '';
        const rows = cfg.series.map((s) => { const p = s.points.find((q) => q.day === d); return { color: s.color, name: s.name, value: p ? INR(p.value) : '–' }; });
        Tip.show(tipRows(cfg.tipTitle ? cfg.tipTitle(d) : 'Day ' + d, rows), cx, cy);
      };
      hit.addEventListener('pointermove', (e) => show(at(e.clientX), e.clientX, e.clientY));
      hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; Tip.hide(); });
      hit.addEventListener('focus', () => { const b = hit.getBoundingClientRect(); show(cfg.focusDay || 1, b.left + 20, b.top + 20); });
      hit.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); cfg.focusDay = Math.min(cfg.days, Math.max(1, (cfg.focusDay || 1) + (e.key === 'ArrowRight' ? 1 : -1))); const b = hit.getBoundingClientRect(); show(cfg.focusDay, b.left + 20, b.top + 20); } });
      hit.addEventListener('blur', () => { cross.style.display = 'none'; Tip.hide(); });
      svg.appendChild(hit);
      host.appendChild(svg);
    };
    draw();
    watchSize(host, draw);
  }

  // horizontal bars as HTML rows: items [{name, value, pct, sub}]
  function hbars(host, items, color) {
    clear(host);
    const max = Math.max(1, ...items.map((i) => i.value));
    const box = h('div', { class: 'hbars' });
    items.forEach((it) => {
      const w = Math.max(0.5, (it.value / max) * 100);
      const row = h('div', { class: 'hb', tabindex: 0, role: 'img', 'aria-label': it.name + ': ' + INR(it.value) + (it.pct !== undefined ? ', ' + Core.fmtPct(it.pct) + ' of expense' : '') },
        h('div', { class: 'nm', title: it.name }, it.name),
        h('div', { class: 'tr' }, h('div', { class: 'bar', style: { width: 'calc((100% - 92px) * ' + w / 100 + ')', background: color || 'var(--exp)' } }), h('span', { class: 'v' }, INR(it.value))));
      const show = (e) => { const b = row.getBoundingClientRect(); const focus = e.type === 'focus'; Tip.show(tipRows(it.name, [{ color: color || 'var(--exp)', name: 'Spent', value: Core.fmtINR(it.value) }].concat(it.pct !== undefined ? [{ name: 'Share of expense', value: Core.fmtPct(it.pct) }] : [])), focus ? b.left + 40 : e.clientX, focus ? b.top + 10 : e.clientY); };
      row.addEventListener('pointermove', show); row.addEventListener('focus', show);
      row.addEventListener('pointerleave', Tip.hide); row.addEventListener('blur', Tip.hide);
      box.appendChild(row);
    });
    if (!items.length) box.appendChild(h('p', { class: 'muted small' }, 'No spending in this period yet.'));
    host.appendChild(box);
  }

  // chart card with Chart | Table toggle. tableEl is a function returning a table element
  function card(opts) {
    let view = 'chart';
    const body = h('div', null);
    const chartHost = h('div', { class: 'chart' });
    const tableHost = h('div', { class: 'tw' });
    const seg = h('div', { class: 'seg sm', role: 'group', 'aria-label': 'View ' + opts.title });
    const bChart = h('button', { type: 'button', 'aria-pressed': 'true', onClick: () => set('chart') }, 'Chart');
    const bTable = h('button', { type: 'button', 'aria-pressed': 'false', onClick: () => set('table') }, 'Table');
    seg.appendChild(bChart); seg.appendChild(bTable);
    function set(v) {
      view = v;
      bChart.setAttribute('aria-pressed', v === 'chart'); bTable.setAttribute('aria-pressed', v === 'table');
      chartHost.hidden = v !== 'chart'; tableHost.hidden = v !== 'table';
      if (v === 'table') mount(tableHost, opts.table());
      else opts.draw(chartHost);
    }
    const el = h('section', { class: 'card', 'aria-label': opts.title },
      h('header', null, h('div', null, h('h3', null, opts.title), opts.sub ? h('p', null, opts.sub) : null), seg),
      opts.legend ? legend(opts.legend) : null, chartHost, tableHost, body);
    tableHost.hidden = true;
    opts.draw(chartHost);
    return el;
  }
  return { columns, lines, hbars, card, legend };
})();
