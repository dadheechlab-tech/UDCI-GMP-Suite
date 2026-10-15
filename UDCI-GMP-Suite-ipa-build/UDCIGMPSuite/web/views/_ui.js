'use strict';

/* =========================================================================
   Shared UI building blocks layered on top of App (app.js).
   Loaded immediately after app.js, before the individual views.
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon;
  const ui = (App.ui = {});

  /* a titled panel; pass flush:true when the body is a full-bleed table */
  ui.panel = function ({ title, icon: ic, sub, actions, body, flush, style }) {
    const showHead = title || actions || ic;
    const head = showHead
      ? h('div.panel-head',
          ic ? icon(ic, 16) : null,
          title ? h('h3', title) : null,
          sub ? h('span.muted', { style: { fontSize: '12px' } }, sub) : null,
          h('div.grow'),
          actions || null)
      : null;
    return h('div.panel', style ? { style } : null, head,
      h('div.panel-body' + (flush ? '.flush' : ''), body));
  };

  /* wrap a cell value to give the <td> a class (e.g. 'num', 'mono') */
  ui.td = function (content, cls) { return { __td: true, content, cls: cls || null }; };

  /* data table. render(item) -> array of cells, or { cells, onClick } */
  ui.table = function ({ head, rows, render, empty, emptyIcon }) {
    if (!rows || rows.length === 0) return App.empty(empty || 'No records yet.', emptyIcon || 'list');
    const cols = head.filter((c) => c != null);
    const thead = h('thead', h('tr', cols.map((col) => {
      const c = typeof col === 'string' ? { label: col } : col;
      return h('th' + (c.cls ? '.' + c.cls : ''), c.label);
    })));
    const tbody = h('tbody', rows.map((item, i) => {
      const r = render(item, i);
      const cells = Array.isArray(r) ? r : r.cells;
      const onClick = Array.isArray(r) ? null : r.onClick;
      return h('tr' + (onClick ? '.clickable' : ''), onClick ? { onClick } : null,
        cells.map((cell) => {
          if (cell && cell.__td) return h('td' + (cell.cls ? '.' + cell.cls : ''), cell.content);
          return h('td', cell);
        }));
    }));
    return h('table.tbl', thead, tbody);
  };

  /* definition list. pairs: [ [label, value, mono?], ... ]  (null entries skipped) */
  ui.kv = function (pairs) {
    const nodes = [];
    for (const p of pairs) {
      if (!p) continue;
      const [k, v, mono] = p;
      nodes.push(h('dt', k));
      nodes.push(h('dd' + (mono ? '.mono' : ''), v == null || v === '' ? '—' : v));
    }
    return h('dl.kv', nodes);
  };

  ui.statCard = function ({ label, value, accent, foot }) {
    return h('div.card.stat',
      h('div.label', label),
      h('div.value' + (accent ? '.accent' : ''), String(value)),
      foot ? h('div.foot', foot) : null);
  };

  /* small ghost icon button for table row actions */
  ui.iconBtn = function (ic, onClick, title, danger) {
    return h('button.btn.ghost.sm' + (danger ? '.danger' : ''),
      { title: title || '', onClick: (e) => { e.stopPropagation(); onClick(); } }, icon(ic, 14));
  };

  /* ISO -> 'YYYY-MM-DDTHH:mm' for datetime-local inputs */
  ui.toLocal = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  /* confirm + delete, capturing a reason into the audit trail */
  ui.confirmDelete = async function (label, fn) {
    const res = await App.confirm({
      title: 'Delete ' + label,
      message: 'This permanently removes the record. The deletion is recorded in the audit trail with your reason.',
      confirmLabel: 'Delete', danger: true, requireReason: true,
    });
    if (res) {
      try { await fn(res.reason || null); App.toast(label + ' deleted.', 'ok'); }
      catch (e) { App.toast(e.message, 'err'); }
    }
  };

  ui.fmtBytes = function (n) {
    if (n == null) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };

  /* shared attachments panel for any entity (inventory / sample / assay) */
  ui.attachmentsPanel = function (entityType, entityId, items, onChange) {
    const icon = App.icon;
    const attach = () => {
      App.pickFile((file) => {
        App.formModal({
          title: 'Attach file', submitLabel: 'Attach', note: file.name,
          fields: [{ name: 'description', label: 'Description (optional)', full: true, placeholder: 'e.g. Certificate of Analysis, raw FACS export…' }],
          onSubmit: async (v) => {
            await App.api('attachments.add', { entity_type: entityType, entity_id: entityId, file, description: v.description });
            App.toast('File attached & hashed.', 'ok'); onChange && onChange();
          },
        });
      });
    };
    return ui.panel({
      title: 'Attachments & data files', icon: 'file',
      actions: h('button.btn.sm.primary', { onClick: attach }, icon('plus', 14), 'Attach file'),
      flush: true,
      body: ui.table({
        head: ['File', 'Description', { label: 'Size', cls: 'num' }, 'SHA-256', 'Uploaded', { label: '', cls: 'actions' }],
        rows: items, empty: 'No files attached. CoAs, raw instrument data, images — each is hashed on import.', emptyIcon: 'file',
        render: (a) => ({
          cells: [
            ui.td(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, icon('file', 14), h('span', a.filename))),
            a.description || '—',
            ui.td(ui.fmtBytes(a.size_bytes), 'num'),
            ui.td((a.sha256 || '').slice(0, 12) + '…', 'mono'),
            ui.td(App.fmt.date(a.uploaded_at) + ' · ' + (a.uploaded_by || ''), 'mono'),
            ui.td(h('div', { style: { display: 'flex', gap: '4px', justifyContent: 'flex-end' } },
              ui.iconBtn('eye', async () => { try { await App.api('attachments.open', { id: a.id }); } catch (e) { App.toast(e.message, 'err'); } }, 'Open'),
              ui.iconBtn('shield', async () => {
                try { const r = await App.api('attachments.verify', { id: a.id }); App.toast(r.ok ? 'Integrity verified.' : 'WARNING: file does not match its recorded hash.', r.ok ? 'ok' : 'err'); }
                catch (e) { App.toast(e.message, 'err'); }
              }, 'Verify integrity'),
              ui.iconBtn('trash', () => ui.confirmDelete('attachment', async (reason) => { await App.api('attachments.delete', { id: a.id, reason }); onChange && onChange(); }), 'Delete', true)), 'actions'),
          ],
        }),
      }),
    });
  };
})();
