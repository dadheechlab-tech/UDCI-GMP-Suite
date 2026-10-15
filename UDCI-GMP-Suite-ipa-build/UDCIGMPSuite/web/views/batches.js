'use strict';

/* =========================================================================
   Batches — list of all lots with a status filter, plus the New Batch modal
   (exposed as App.newBatchModal so the dashboard can call it too).
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, fmt = App.fmt, ui = App.ui;
  let currentFilter = 'all';

  const FILTERS = [
    ['all', 'All statuses'], ['in_process', 'In process'], ['on_hold', 'On hold'],
    ['quarantine', 'Quarantine'], ['released', 'Released'], ['rejected', 'Rejected'],
  ];

  App.views.batches = async function (root) {
    const batches = await App.api('batches.list', { status: currentFilter });

    const filter = h('select', { style: { width: 'auto', minWidth: '150px' } },
      FILTERS.map(([v, l]) => {
        const o = h('option', { value: v }, l);
        if (v === currentFilter) o.selected = true;
        return o;
      }));
    filter.addEventListener('change', () => { currentFilter = filter.value; App.go('batches'); });

    root.appendChild(h('div.page-head',
      h('div',
        h('h1', 'Batch records'),
        h('div.sub', batches.length + ' lot' + (batches.length === 1 ? '' : 's') +
          (currentFilter !== 'all' ? ' · ' + fmt.title(currentFilter) : ''))),
      h('div.grow'),
      filter,
      h('button.btn.primary', { onClick: () => App.newBatchModal() }, icon('plus', 16), 'New batch')));

    root.appendChild(ui.panel({
      flush: true,
      body: ui.table({
        head: ['Lot / batch', 'Product', 'Donor type', 'Cell line', { label: 'Stages', cls: 'num' }, 'Flags', { label: 'Status' }, 'Started'],
        rows: batches,
        empty: currentFilter === 'all'
          ? 'No batches yet. Create your first lot to begin recording production.'
          : 'No batches with this status.',
        emptyIcon: 'beaker',
        render: (b) => ({
          onClick: () => App.go('batch', { id: b.id }),
          cells: [
            ui.td(b.lot_number, 'mono'),
            b.product_name,
            fmt.title(b.donor_type),
            ui.td(b.cell_line || '—', 'mono'),
            ui.td(String(b._stages), 'num'),
            flagCell(b),
            App.chip(b.status),
            ui.td(fmt.date(b.started_at), 'mono'),
          ],
        }),
      }),
    }));
  };

  function flagCell(b) {
    const flags = [];
    if (b._qc_fail) flags.push(h('span.chip.fail', b._qc_fail + ' QC'));
    if (b._deviations) flags.push(h('span.chip.open', b._deviations + ' dev'));
    if (!flags.length) return h('span.muted', '—');
    return h('div', { style: { display: 'flex', gap: '6px' } }, flags);
  }

  App.newBatchModal = function () {
    App.formModal({
      title: 'New manufacturing batch',
      submitLabel: 'Create batch',
      wide: true,
      note: 'A unique lot / batch number is required.',
      fields: [
        { name: 'lot_number', label: 'Lot / batch number', required: true, mono: true, full: true, placeholder: 'e.g. ISL-AUTO-2026-014' },
        { name: 'product_name', label: 'Product', value: 'iPSC-derived islets (SC-islets)', full: true },
        { name: 'donor_type', label: 'Donor source', type: 'select', value: 'autologous',
          options: [{ value: 'autologous', label: 'Autologous' }, { value: 'allogeneic', label: 'Allogeneic' }] },
        { name: 'donor_id', label: 'Donor / subject ID', mono: true, placeholder: 'de-identified code' },
        { name: 'cell_line', label: 'iPSC line', mono: true, placeholder: 'e.g. clone ID' },
        { name: 'site', label: 'Manufacturing site', value: 'SUNY Upstate — IRM GMP' },
        { name: 'protocol_ref', label: 'Protocol / SOP ref', mono: true, placeholder: 'e.g. SOP-DIFF-007' },
        { name: 'target_dose', label: 'Target dose', placeholder: 'e.g. 0.5–1.0 ×10^6 IEQ/kg' },
        { name: 'started_at', label: 'Production start', type: 'datetime-local', value: fmt.nowLocal() },
        { name: 'description', label: 'Notes', type: 'textarea', full: true, placeholder: 'Indication, run intent, special handling…' },
      ],
      onSubmit: async (v) => {
        const b = await App.api('batches.create', v);
        App.toast('Batch ' + b.lot_number + ' created.', 'ok');
        App.go('batch', { id: b.id });
      },
    });
  };
})();
