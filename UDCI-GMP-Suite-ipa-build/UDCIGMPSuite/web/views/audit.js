'use strict';

/* =========================================================================
   Audit trail — the append-only, tamper-evident record of every action.
   Also exposes App.auditTable / App.auditActionBadge for other views.
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, fmt = App.fmt, ui = App.ui;

  const ACTION_COLOR = {
    CREATE: 'var(--green)', UPDATE: 'var(--blue)', DELETE: 'var(--red)', SIGN: 'var(--accent)',
    LOGIN: 'var(--ink-3)', LOGOUT: 'var(--ink-3)', EXPORT: 'var(--violet)', LOGIN_FAIL: 'var(--amber)',
  };

  App.auditActionBadge = function (action) {
    const c = ACTION_COLOR[action] || 'var(--ink-2)';
    return h('span', { style: { fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, color: c } }, action);
  };

  App.auditTable = function (rows, opts) {
    const showEntity = !opts || opts.showEntity !== false;
    return ui.table({
      head: ['Timestamp', 'User', 'Action', showEntity ? 'Entity' : null, 'Field', 'Change', 'Reason'],
      rows,
      empty: 'No audit entries.',
      emptyIcon: 'shield',
      render: (a) => ({
        cells: [
          ui.td(fmt.dt(a.ts), 'mono'),
          a.username || '—',
          App.auditActionBadge(a.action),
          showEntity ? ui.td(entityText(a)) : null,
          a.field || '—',
          ui.td(changeText(a), 'mono'),
          a.reason || a.detail || '—',
        ].filter((c) => c !== null),
      }),
    });
  };

  App.views.audit = async function (root) {
    const rows = await App.api('audit.list', { limit: 500 });

    root.appendChild(h('div.page-head',
      h('div',
        h('h1', 'Audit trail'),
        h('div.sub', rows.length + ' most recent ' + (rows.length === 1 ? 'entry' : 'entries') + ' · append-only, tamper-evident')),
      h('div.grow'),
      h('button.btn.sm', { onClick: () => App.go('audit') }, icon('refresh', 14), 'Refresh')));

    root.appendChild(h('div.banner.info', { style: { marginBottom: '18px' } }, icon('shield', 16),
      h('div', 'Every create, change, deletion, sign-off, export and login is recorded automatically with the responsible user and a timestamp. Entries cannot be edited or removed.')));

    root.appendChild(ui.panel({ flush: true, body: App.auditTable(rows) }));
  };

  function entityText(a) {
    if (!a.entity_type) return '—';
    return a.entity_type;
  }
  function changeText(a) {
    if (a.old_value != null && a.new_value != null) return trunc(a.old_value) + ' → ' + trunc(a.new_value);
    if (a.new_value != null) return trunc(a.new_value);
    if (a.old_value != null) return trunc(a.old_value);
    return '—';
  }
  function trunc(s) { s = String(s); return s.length > 40 ? s.slice(0, 40) + '…' : s; }
})();
