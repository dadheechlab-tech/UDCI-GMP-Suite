'use strict';

/* =========================================================================
   Core application module. Defines window.App with:
   - h()      tiny hyperscript (safe: text is text, no innerHTML for data)
   - icon()   inline SVG icon set
   - api()    promise wrapper over the preload bridge
   - toast / modal / formModal / signModal / confirm  UI primitives
   - router + app shell
   View files attach themselves to App.views.*
   ========================================================================= */

const App = (window.App = {
  state: { user: null, route: 'dashboard', params: {} },
  views: {},
  _modalStack: [],
});

/* ---------- institutional identity / branding ---------- */
App.BRAND = {
  suite: 'GMP Manufacturing Suite',
  version: '26.0',
  initiative: 'Upstate Diabetes Cure Initiative',
  initiativeAbbr: 'UDCI',
  center: 'SUNY Centre for Advanced Cell Therapy',
  org: 'SUNY Upstate Medical University',
  udciLogo: 'icons/udci.png',
  sunyLogo: 'icons/suny.png',
};

/* ---------- native-free file picker (returns a File via callback) ---------- */
App.pickFile = function (onFile, accept) {
  const input = document.createElement('input');
  input.type = 'file';
  if (accept) input.accept = accept;
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    input.remove();
    if (f) onFile(f);
  });
  document.body.appendChild(input);
  input.click();
};

/* ---------- hyperscript ---------- */
function h(selector, attrs, ...children) {
  const parts = selector.split('.');
  const tag = parts[0] || 'div';
  const el = document.createElement(tag);
  if (parts.length > 1) el.className = parts.slice(1).join(' ');

  if (attrs && (attrs.nodeType || typeof attrs === 'string' || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = (el.className ? el.className + ' ' : '') + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && k !== 'list') { try { el[k] = v; } catch (_) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v);
    }
  }
  appendChildren(el, children);
  return el;
}
function appendChildren(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}
App.h = h;

/* ---------- icons (lucide-style, stroke=currentColor) ---------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  beaker: '<path d="M9 3h6M10 3v6L5 19a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V3"/><path d="M7 14h10"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  package: '<path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22" x2="12" y2="12"/>',
  branch: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  microscope: '<path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h4v4a2 2 0 0 1-2 2z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>',
  vial: '<path d="M8 2h8M9 2v14a3 3 0 0 0 6 0V2"/><path d="M9 9h6"/>',
  chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  thermometer: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
  dna: '<path d="M4 2c0 6 16 6 16 12M4 14c0 6 16 6 16 6"/><path d="M4 8c0-6 16-6 16-12"/>',
  flask: '<path d="M9 3h6M10 3v5L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-10V3"/><path d="M7.5 14h9"/>',
  snowflake: '<line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  box: '<path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><path d="m3.3 7 8.7 5 8.7-5"/><line x1="12" y1="22" x2="12" y2="12"/>',
};
function icon(name, size = 16) {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.innerHTML =
    `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span.firstChild;
}
App.icon = icon;

/* ---------- formatting helpers ---------- */
App.fmt = {
  dt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  },
  date(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  },
  num(n, dp) {
    if (n == null || n === '') return '—';
    const v = Number(n);
    if (isNaN(v)) return n;
    if (dp != null) return v.toFixed(dp);
    return v.toLocaleString();
  },
  sci(n) {
    if (n == null || n === '') return '—';
    const v = Number(n);
    if (isNaN(v)) return n;
    if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-2)) return v.toExponential(2);
    return v.toLocaleString();
  },
  title(s) { return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); },
  initials(name) {
    return String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  },
  nowLocal() {
    const d = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  toISO(localValue) { return localValue ? new Date(localValue).toISOString() : null; },
};

/* ---------- API ---------- */
App.api = async function (method, payload) {
  const res = await window.eln.call(method, payload);
  if (!res || !res.ok) throw new Error((res && res.error) || 'Request failed');
  return res.data;
};

/* ---------- toast ---------- */
App.toast = function (msg, type = 'info') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = h('div.toast-wrap'); document.body.appendChild(wrap); }
  const ic = type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'info';
  const t = h('div.toast.' + type, icon(ic, 17), h('div', msg));
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; setTimeout(() => t.remove(), 260); }, 3400);
};

/* ---------- modal ---------- */
App.closeModal = function () {
  const top = App._modalStack.pop();
  if (top) top.remove();
};
App.modal = function ({ title, body, footer, wide, onClose }) {
  const back = h('div.modal-back', { onClick: (e) => { if (e.target === back) { App.closeModal(); onClose && onClose(); } } });
  const xBtn = icon('x', 20); xBtn.classList.add('x');
  xBtn.addEventListener('click', () => { App.closeModal(); onClose && onClose(); });
  const modal = h('div.modal' + (wide ? '.wide' : ''),
    h('div.modal-head', h('h3', title), xBtn),
    h('div.modal-body', body),
    footer ? h('div.modal-foot', footer) : null
  );
  back.appendChild(modal);
  document.body.appendChild(back);
  App._modalStack.push(back);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { App.closeModal(); document.removeEventListener('keydown', esc); }
  });
  return { back, modal };
};

/* build a labelled input from a field spec */
function buildField(f, values) {
  let input;
  const id = 'f_' + f.name;
  const common = { id, name: f.name, value: f.value != null ? f.value : (values[f.name] != null ? values[f.name] : '') };
  if (f.type === 'select') {
    input = h('select', common, (f.options || []).map((o) => {
      const opt = typeof o === 'string' ? { value: o, label: App.fmt.title(o) } : o;
      const el = h('option', { value: opt.value }, opt.label);
      if (String(common.value) === String(opt.value)) el.selected = true;
      return el;
    }));
  } else if (f.type === 'textarea') {
    input = h('textarea', { ...common, placeholder: f.placeholder || '', rows: f.rows || 3 });
  } else if (f.type === 'checkbox') {
    input = h('input', { id, name: f.name, type: 'checkbox', style: { width: 'auto' } });
    input.checked = !!(f.value != null ? f.value : values[f.name]);
  } else {
    input = h('input', {
      ...common, type: f.type || 'text', placeholder: f.placeholder || '',
      step: f.step || (f.type === 'number' ? 'any' : null), class: f.mono ? 'mono' : null,
      autocomplete: f.type === 'password' ? 'current-password' : 'off',
    });
  }
  input.dataset.ftype = f.type || 'text';
  const wrap = h('div.field' + (f.full ? '.full' : ''),
    h('label', { for: id }, f.label, f.required ? h('span', { style: { color: 'var(--red)' } }, ' *') : null),
    input,
    f.hint ? h('div.hint', f.hint) : null
  );
  return { wrap, input };
}

function collectValues(fields, container) {
  const out = {};
  for (const f of fields) {
    const el = container.querySelector('[name="' + f.name + '"]');
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked ? 1 : 0;
    else {
      let v = el.value;
      if (f.type === 'number') v = v === '' ? null : Number(v);
      else if (f.type === 'datetime-local') v = v ? App.fmt.toISO(v) : null;
      else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
      out[f.name] = v;
    }
  }
  return out;
}

/* generic form modal: fields[] -> onSubmit(values). Throw inside onSubmit to show an error. */
App.formModal = function ({ title, fields, submitLabel = 'Save', note, wide, onSubmit }) {
  const grid = h('div.form-grid');
  const inputs = [];
  for (const f of fields) {
    if (f.section) { grid.appendChild(h('div.full', h('div.section-label', { style: { margin: '6px 0 0' } }, f.section))); continue; }
    const { wrap, input } = buildField(f, {});
    grid.appendChild(wrap);
    inputs.push(input);
  }
  const errBox = h('div', { style: { display: 'none' } });
  const body = h('div', errBox, grid);

  const submitBtn = h('button.btn.primary', submitLabel);
  const cancel = h('button.btn.ghost', 'Cancel', { onClick: () => App.closeModal() });
  const foot = h('div', { style: { display: 'flex', gap: '9px', width: '100%', alignItems: 'center' } },
    note ? h('div.modal-note', note) : h('div', { style: { marginRight: 'auto' } }),
    cancel, submitBtn);

  async function doSubmit() {
    const values = collectValues(fields, grid);
    for (const f of fields) {
      if (f.required && (values[f.name] == null || values[f.name] === '')) {
        showErr('“' + f.label + '” is required.');
        return;
      }
    }
    submitBtn.disabled = true; submitBtn.textContent = 'Saving…';
    try {
      await onSubmit(values);
      App.closeModal();
    } catch (err) {
      showErr(err.message || String(err));
      submitBtn.disabled = false; submitBtn.textContent = submitLabel;
    }
  }
  function showErr(msg) {
    errBox.innerHTML = '';
    errBox.appendChild(h('div.banner.warn', { style: { marginBottom: '16px' } }, icon('alert', 17), msg));
    errBox.style.display = 'block';
  }
  submitBtn.addEventListener('click', doSubmit);
  grid.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') doSubmit(); });

  App.modal({ title, body, footer: foot, wide });
  setTimeout(() => { if (inputs[0]) inputs[0].focus(); }, 40);
};

/* e-signature modal: password + optional comment, calls onSign({password, comment}) */
App.signModal = function ({ title, meaningLabel, statement, onSign }) {
  const pw = h('input', { type: 'password', placeholder: 'Your password', autocomplete: 'current-password' });
  const comment = h('textarea', { placeholder: 'Comment (optional)', rows: 2 });
  const errBox = h('div', { style: { display: 'none' } });
  const who = App.state.user;
  const body = h('div',
    errBox,
    h('div.banner.info', { style: { marginBottom: '16px' } }, icon('lock', 17),
      h('div', h('div', { style: { fontWeight: 600, marginBottom: '2px' } }, statement),
        h('div.mono-sm', who.full_name + '  ·  @' + who.username + '  ·  ' + who.role))),
    h('div.field', h('label', 'Re-enter password to sign'), pw),
    h('div.field', { style: { marginTop: '12px' } }, h('label', 'Comment'), comment)
  );
  const btn = h('button.btn.primary', icon('pen', 15), 'Sign');
  const foot = h('div', { style: { display: 'flex', gap: '9px' } },
    h('button.btn.ghost', 'Cancel', { onClick: () => App.closeModal() }), btn);
  btn.addEventListener('click', async () => {
    if (!pw.value) { showErr('Password is required to sign.'); return; }
    btn.disabled = true; btn.textContent = 'Signing…';
    try { await onSign({ password: pw.value, comment: comment.value.trim() || null }); App.closeModal(); }
    catch (err) { showErr(err.message); btn.disabled = false; btn.innerHTML = ''; btn.append(icon('pen', 15), 'Sign'); }
  });
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
  function showErr(m) { errBox.innerHTML = ''; errBox.appendChild(h('div.banner.warn', { style: { marginBottom: '16px' } }, icon('alert', 17), m)); errBox.style.display = 'block'; }
  App.modal({ title, body, footer: foot });
  setTimeout(() => pw.focus(), 40);
};

/* confirm dialog -> Promise<boolean> */
App.confirm = function ({ title = 'Confirm', message, confirmLabel = 'Confirm', danger, requireReason }) {
  return new Promise((resolve) => {
    let reason = null;
    const reasonInput = requireReason ? h('input', { placeholder: 'Reason (recorded in audit trail)' }) : null;
    const body = h('div',
      h('div', { style: { fontSize: '13.5px', marginBottom: requireReason ? '14px' : 0 } }, message),
      requireReason ? h('div.field', h('label', 'Reason'), reasonInput) : null);
    const ok = h('button.btn' + (danger ? '.danger' : '.primary'), confirmLabel);
    const foot = h('div', { style: { display: 'flex', gap: '9px' } },
      h('button.btn.ghost', 'Cancel', { onClick: () => { App.closeModal(); resolve(false); } }), ok);
    ok.addEventListener('click', () => { reason = reasonInput ? reasonInput.value.trim() : null; App.closeModal(); resolve(requireReason ? { reason } : true); });
    App.modal({ title, body, footer: foot, onClose: () => resolve(false) });
  });
};

/* small reusable status chip */
App.chip = function (status, kind) {
  const cls = kind ? kind + '-' + status : status;
  return h('span.chip.' + cls, App.fmt.title(status));
};

/* generic empty-state */
App.empty = function (msg, iconName = 'list') {
  return h('div.empty', icon(iconName, 34), h('div', msg));
};

/* ---------- router + shell ---------- */
App.go = function (route, params = {}) {
  App.state.route = route;
  App.state.params = params;
  App.render();
};

const NAV = [
  { route: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { route: 'batches', label: 'Batch Records', icon: 'beaker' },
  { route: 'inventory', label: 'Inventory', icon: 'flask' },
  { route: 'samples', label: 'Sample Repository', icon: 'snowflake' },
  { route: 'assays', label: 'Assays & Results', icon: 'scan' },
  { route: 'audit', label: 'Audit Trail', icon: 'shield' },
];
const NAV_ADMIN = [
  { route: 'users', label: 'Users', icon: 'users' },
  { route: 'settings', label: 'Settings', icon: 'settings' },
];

function brandMark(size) {
  // stylised islet: a ring of cells — the subject's signature glyph
  return h('span', { style: { display: 'inline-flex' }, html:
    `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" stroke="#234" stroke-width="1.5"/>
      <circle cx="20" cy="20" r="6.5" fill="#34d0c4"/>
      <circle cx="20" cy="9" r="3" fill="#5aa9f0"/>
      <circle cx="29.5" cy="14.5" r="3" fill="#34d0c4" opacity=".75"/>
      <circle cx="29.5" cy="25.5" r="3" fill="#a98bf0" opacity=".8"/>
      <circle cx="20" cy="31" r="3" fill="#4fc78a" opacity=".8"/>
      <circle cx="10.5" cy="25.5" r="3" fill="#34d0c4" opacity=".6"/>
      <circle cx="10.5" cy="14.5" r="3" fill="#e8b341" opacity=".7"/>
    </svg>` });
}
App.brandMark = brandMark;

App.render = function () {
  const root = document.getElementById('root');
  root.innerHTML = '';

  if (!App.state.user) { root.appendChild(App.views.auth()); return; }

  const u = App.state.user;
  const navItems = NAV.map((n) => navItem(n));
  const adminItems = u.role === 'admin' ? NAV_ADMIN.map((n) => navItem(n)) : [];

  const sidebar = h('div.sidebar',
    h('div.sb-brand',
      h('img.sb-logo', { src: App.BRAND.udciLogo, alt: App.BRAND.initiative }),
      h('div.sb-suite',
        h('div.t1', App.BRAND.suite),
        h('div.t2', 'v' + App.BRAND.version + ' · ' + App.BRAND.center))),
    h('div.sb-section', 'Records'),
    ...navItems,
    u.role === 'admin' ? h('div.sb-section', 'Administration') : null,
    ...adminItems,
    h('div.sb-spacer'),
    h('div.sb-user',
      h('div.who', h('div.avatar', App.fmt.initials(u.full_name)),
        h('div', h('div.nm', u.full_name), h('div.rl', (u.email || '@' + u.username) + ' · ' + u.role))),
      h('button.btn.ghost.sm', { style: { width: '100%', marginTop: '8px', justifyContent: 'flex-start' },
        onClick: signOut }, icon('logout', 15), 'Sign out'))
  );

  const content = h('div.content');
  const main = h('div.main', topbar(), content);
  root.appendChild(h('div.shell', sidebar, main));

  // render the active view into content
  const viewFn = App.views[App.state.route] || App.views.dashboard;
  Promise.resolve(viewFn(content)).catch((err) => {
    content.innerHTML = '';
    content.appendChild(h('div.banner.warn', icon('alert', 18), 'Could not load this view: ' + err.message));
  });
};

function navItem(n) {
  const active = App.state.route === n.route || (n.route === 'batches' && App.state.route === 'batch');
  const item = h('div.nav-item' + (active ? '.active' : ''), { onClick: () => App.go(n.route) },
    icon(n.icon, 17), n.label);
  return item;
}

function topbar() {
  const labels = { dashboard: 'Dashboard', batches: 'Batch Records', batch: 'Batch record', inventory: 'Inventory & Repository', samples: 'Sample Repository', assays: 'Assays & Results', audit: 'Audit trail', users: 'Team & Access', settings: 'Settings' };
  const crumb = h('div.crumb', h('b', labels[App.state.route] || ''));
  return h('div.topbar', crumb, h('div.grow'),
    h('div.pill', App.BRAND.initiativeAbbr + ' · ' + App.BRAND.org),
    h('div.pill', new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })));
}

async function signOut() {
  try { await App.api('auth.logout'); } catch (_) {}
  App.state.user = null;
  App.render();
}
App.signOut = signOut;
