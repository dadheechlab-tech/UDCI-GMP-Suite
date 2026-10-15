'use strict';

/* =========================================================================
   Dashboard — manufacturing overview: stat cards, recent batches, activity.
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, fmt = App.fmt, ui = App.ui;

  App.views.dashboard = async function (root) {
    const B = App.BRAND;
    const [batches, audit, inventory, samples] = await Promise.all([
      App.api('batches.list', { status: 'all' }),
      App.api('audit.list', { limit: 8 }),
      App.api('inventory.list', {}).catch(() => []),
      App.api('samples.list', {}).catch(() => []),
    ]);
    const count = (f) => batches.filter(f).length;
    const openDev = batches.reduce((s, b) => s + (b._deviations || 0), 0);
    const lowStock = inventory.filter((i) => i._low || i.status === 'low' || i.status === 'out').length;
    const stored = samples.filter((s) => s.status === 'stored').length;

    // institutional brand banner
    root.appendChild(h('div.brand-banner',
      h('img.bb-logo', { src: B.udciLogo, alt: B.initiative }),
      h('div.bb-text',
        h('div.bb-1', B.initiative),
        h('div.bb-2', B.center + ' — ' + B.suite + ' ' + B.version)),
      h('div.grow'),
      h('img.bb-logo.bb-suny', { src: B.sunyLogo, alt: B.center })));

    root.appendChild(h('div.page-head',
      h('div',
        h('h1', 'Manufacturing overview'),
        h('div.sub', 'Autologous iPSC-derived islet production · GMP Manufacturing Suite ' + B.version)),
      h('div.grow'),
      h('button.btn.primary', { onClick: () => App.newBatchModal() }, icon('plus', 16), 'New batch')));

    root.appendChild(h('div.cards',
      ui.statCard({ label: 'Total lots', value: batches.length, foot: 'All manufacturing records' }),
      ui.statCard({ label: 'In process', value: count((b) => b.status === 'in_process'), accent: true, foot: 'Currently in production' }),
      ui.statCard({ label: 'Released', value: count((b) => b.status === 'released'), foot: 'Dispositioned for use' }),
      ui.statCard({ label: 'Open deviations', value: openDev, foot: openDev ? 'Require follow-up' : 'None outstanding' }),
      ui.statCard({ label: 'Samples stored', value: stored, foot: samples.length + ' in repository' }),
      ui.statCard({ label: 'Low / out of stock', value: lowStock, accent: lowStock > 0, foot: inventory.length + ' inventory items' })));

    root.appendChild(spacer());
    root.appendChild(ui.panel({
      title: 'Recent batches', icon: 'beaker',
      actions: h('button.btn.sm', { onClick: () => App.go('batches') }, 'View all'),
      flush: true,
      body: ui.table({
        head: ['Lot / batch', 'Product', 'Donor', { label: 'Status' }, 'Started'],
        rows: batches.slice(0, 6),
        empty: 'No batches recorded yet. Create your first lot to begin.',
        emptyIcon: 'beaker',
        render: (b) => ({
          onClick: () => App.go('batch', { id: b.id }),
          cells: [
            ui.td(b.lot_number, 'mono'),
            b.product_name,
            fmt.title(b.donor_type),
            App.chip(b.status),
            ui.td(fmt.date(b.started_at), 'mono'),
          ],
        }),
      }),
    }));

    root.appendChild(spacer());
    root.appendChild(ui.panel({
      title: 'Recent activity', icon: 'shield',
      actions: h('button.btn.sm', { onClick: () => App.go('audit') }, 'Full audit trail'),
      flush: true,
      body: ui.table({
        head: ['Time', 'User', 'Action', 'Detail'],
        rows: audit,
        empty: 'No activity yet.',
        emptyIcon: 'shield',
        render: (a) => ({
          cells: [
            ui.td(fmt.dt(a.ts), 'mono'),
            a.username || '—',
            App.auditActionBadge(a.action),
            ui.td(detailText(a), 'mono'),
          ],
        }),
      }),
    }));
  };

  function spacer() { return h('div', { style: { height: '18px' } }); }

  function detailText(a) {
    const parts = [];
    if (a.entity_type) parts.push(a.entity_type);
    if (a.field) parts.push(a.field);
    let t = parts.join(' · ');
    if (a.new_value != null && a.field) t += ' = ' + trunc(a.new_value);
    else if (a.detail) t = a.detail;
    return t || '—';
  }
  function trunc(s) { s = String(s); return s.length > 44 ? s.slice(0, 44) + '…' : s; }
})();
