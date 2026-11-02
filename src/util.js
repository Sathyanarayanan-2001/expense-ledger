'use strict';
/* DOM helpers, icons, tooltip, toasts, safe local preferences. All user text goes through textContent. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'line', 'circle', 'text', 'title', 'defs', 'polyline', 'polygon']);
function h(tag, attrs, ...kids) {
  const isSvg = SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach((k) => {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.keys(v).forEach((d) => (el.dataset[d] = v[d]));
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' && !isSvg) el.value = v;
      else if (k === 'checked' && !isSvg) el.checked = !!v;
      else if (k === 'disabled' && !isSvg) el.disabled = !!v;
      else if (k === 'selected' && !isSvg) el.selected = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}
const $ = (sel, root) => (root || document).querySelector(sel);
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
const mount = (el, ...kids) => { clear(el); kids.forEach((k) => { if (k) el.appendChild(k); }); return el; };

const ICONS = {
  check: 'M4 12l5 5L20 6',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  auto: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 3v18M12 12h9',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  info: 'M12 11v6M12 7.5v.5M12 21a9 9 0 100-18 9 9 0 000 18z',
  home: 'M4 11l8-7 8 7M6 10v10h12V10',
  dash: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  add: 'M12 5v14M5 12h14',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  minus: 'M5 12h14',
};
function icon(name, size) {
  const s = size || 16;
  return h('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: ICONS[name] || '' }));
}

// ---------- preferences kept only in this browser (never required) ----------
const Prefs = {
  get(k, d) { try { const v = localStorage.getItem('expense-ledger.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('expense-ledger.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

// ---------- tooltip ----------
const Tip = (function () {
  let el = null;
  const ensure = () => { if (!el) { el = h('div', { class: 'tip', role: 'tooltip', id: 'tip' }); document.body.appendChild(el); } return el; };
  return {
    show(content, x, y) {
      const t = ensure();
      mount(t, content);
      t.classList.add('on');
      const r = t.getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      let left = x + 14, top = y + 14;
      if (left + r.width > vw - 8) left = Math.max(8, x - r.width - 14);
      if (top + r.height > vh - 8) top = Math.max(8, y - r.height - 14);
      t.style.left = left + 'px'; t.style.top = top + 'px';
    },
    hide() { if (el) el.classList.remove('on'); },
  };
})();
function tipRows(title, rows) { // rows: [{color, name, value}]
  return h('div', null,
    h('div', { class: 't' }, title),
    rows.map((r) => h('div', { class: 'r' }, h('span', { class: 'n' }, r.color ? h('i', { class: 'k', style: { background: r.color } }) : null, r.name), h('b', null, r.value))));
}

// ---------- toasts ----------
const Toast = (function () {
  let box = null;
  return {
    show(msg, kind) {
      if (!box) { box = h('div', { class: 'toasts', 'aria-live': 'polite', role: 'status' }); document.body.appendChild(box); }
      const t = h('div', { class: 'toast' + (kind === 'bad' ? ' bad' : '') }, msg);
      box.appendChild(t);
      setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, kind === 'bad' ? 7000 : 3200);
    },
  };
})();
