'use strict';

/* =========================================================================
   Sample repository / biobank — aliquots and cryopreserved material:
   cell aliquots, iPSC lines, RNA/DNA, protein. Tracks vials, freezer location,
   cryo details and depletion.
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, fmt = App.fmt, ui = App.ui, td = App.ui.td;
  let typeFilter = 'all', statusFilter = 'all';

  const TYPES = [
    { value: 'cell_aliquot', label: 'Cell aliquot' },
    { value: 'ipsc_line', label: 'iPSC line' },
    { value: 'rna', label: 'RNA' },
    { value: 'dna', label: 'DNA' },
    { value: 'protein', label: 'Protein / lysate' },
    { value: 'tissue', label: 'Tissue' },
    { value: 'supernatant', label: 'Supernatant / media' },
    { value: 'other', label: 'Other' },
  ];
  const TEMPS = [
    { value: '-20C', label: '−20 °C' }, { value: '-80C', label: '−80 °C' },
    { value: '-150C', label: '−150 °C' }, { value: 'LN2', label: 'Liquid N₂' },
  ];
  const STATUSES = ['stored', 'in_use', 'reserved', 'depleted', 'discarded'];

  App.views.samples = async function (root) {
    const samples = await App.api('samples.list', { sample_type: typeFilter, status: statusFilter });

    const typeSel = filterSel([{ value: 'all', label: 'All types' }, ...TYPES], typeFilter, (v) => { typeFilter = v; App.go('samples'); });
    const statusSel = filterSel([{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: fmt.title(s) }))], statusFilter, (v) => { statusFilter = v; App.go('samples'); });

    root.appendChild(h('div.page-head',
      h('div', h('h1', 'Sample repository'),
        h('div.sub', samples.length + ' sample' + (samples.length === 1 ? '' : 's') + ' · cryopreserved cells, lines, RNA & aliquots')),
      h('div.grow'), typeSel, statusSel,
      h('button.btn.primary', { onClick: () => sampleForm(null) }, icon('plus', 16), 'Add sample')));

    root.appendChild(ui.panel({
      flush: true,
      body: ui.table({
        head: ['Sample', 'Type', 'Source', 'Passage', { label: 'Vials', cls: 'num' }, 'Location', 'Temp', 'Cryo date', { label: 'Status' }, { label: '', cls: 'actions' }],
        rows: samples,
        empty: 'No samples yet. Register cryopreserved aliquots, iPSC lines and RNA with their freezer location.',
        emptyIcon: 'snowflake',
        render: (s) => ({
          onClick: () => sampleDetail(s.id),
          cells: [
            td(h('div', h('span', { style: { fontWeight: 600 } }, s.sample_code || s.name || '—'), s.name && s.sample_code ? h('div', { style: { fontSize: '11px', color: 'var(--muted)' } }, s.name) : null)),
            fmt.title(s.sample_type),
            td(s.source_line || s.source_lot || '—', 'mono'),
            td(s.passage || '—', 'mono'),
            td(vialText(s), 'num'),
            td(locText(s), 'mono'),
            td(s.storage_temp || '—'),
            td(fmt.date(s.cryo_date), 'mono'),
            App.chip(s.status || 'stored'),
            td(h('div', { style: { display: 'flex', gap: '4px', justifyContent: 'flex-end' } },
              ui.iconBtn('snowflake', () => useVials(s), 'Withdraw vial(s)'),
              ui.iconBtn('edit', () => sampleForm(s), 'Edit'),
              ui.iconBtn('trash', () => ui.confirmDelete('sample', async (reason) => { await App.api('samples.delete', { id: s.id, reason }); App.go('samples'); }), 'Delete', true)), 'actions'),
          ],
        }),
      }),
    }));
  };

  function vialText(s) {
    if (s.n_vials == null && s.n_vials_remaining == null) return '—';
    const rem = s.n_vials_remaining != null ? s.n_vials_remaining : s.n_vials;
    return rem + (s.n_vials != null ? ' / ' + s.n_vials : '');
  }
  function locText(s) {
    const parts = [s.freezer, s.rack, s.box, s.position].filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
  }
  function filterSel(options, current, onChange) {
    const sel = h('select', { style: { width: 'auto', minWidth: '140px' } }, options.map((o) => {
      const el = h('option', { value: o.value }, o.label); if (o.value === current) el.selected = true; return el;
    }));
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function useVials(s) {
    App.formModal({
      title: 'Withdraw vials — ' + (s.sample_code || s.name || 'sample'), submitLabel: 'Withdraw',
      note: 'Remaining: ' + (s.n_vials_remaining != null ? s.n_vials_remaining : (s.n_vials || 0)),
      fields: [
        { name: 'n', label: 'Number of vials', type: 'number', step: '1', value: 1, required: true },
        { name: 'reason', label: 'Purpose / note', full: true, placeholder: 'e.g. thaw for differentiation run' },
      ],
      onSubmit: async (v) => { await App.api('samples.useVials', { id: s.id, n: Number(v.n), reason: v.reason }); App.toast('Vials withdrawn.', 'ok'); App.go('samples'); },
    });
  }

  function sampleForm(s) {
    const editing = !!s;
    const fields = [
      { name: 'sample_code', label: 'Sample ID / code', mono: true, value: editing ? s.sample_code : '', placeholder: 'e.g. ISL14-S7-A03' },
      { name: 'sample_type', label: 'Type', type: 'select', options: TYPES, value: editing ? s.sample_type : 'cell_aliquot' },
      { name: 'name', label: 'Name / description', full: true, value: editing ? s.name : '' },
      { name: 'source_lot', label: 'Source lot', mono: true, value: editing ? s.source_lot : '' },
      { name: 'source_line', label: 'Source iPSC line', mono: true, value: editing ? s.source_line : '' },
      { name: 'passage', label: 'Passage', mono: true, value: editing ? s.passage : '' },
      { name: 'concentration', label: 'Concentration', value: editing ? s.concentration : '', placeholder: 'e.g. 1×10⁶/mL, 250 ng/µL' },
      { name: 'cell_count', label: 'Cell count / vial', type: 'number', step: 'any', value: editing ? s.cell_count : null },
      { name: 'volume_ml', label: 'Volume (mL)', type: 'number', step: 'any', value: editing ? s.volume_ml : null },
      { name: 'n_vials', label: 'Number of vials', type: 'number', step: '1', value: editing ? s.n_vials : null },
      { name: 'n_vials_remaining', label: 'Vials remaining', type: 'number', step: '1', value: editing ? s.n_vials_remaining : null, hint: editing ? null : 'Leave blank to match total.' },
      { name: 'section', section: 'Storage location' },
      { name: 'freezer', label: 'Freezer / tank', value: editing ? s.freezer : '' },
      { name: 'rack', label: 'Rack / tower', value: editing ? s.rack : '' },
      { name: 'box', label: 'Box', value: editing ? s.box : '' },
      { name: 'position', label: 'Position', mono: true, value: editing ? s.position : '', placeholder: 'e.g. A3' },
      { name: 'storage_temp', label: 'Storage temp', type: 'select', options: TEMPS, value: editing ? s.storage_temp : '-150C' },
      { name: 'section2', section: 'Cryopreservation' },
      { name: 'cryo_date', label: 'Cryo date', type: 'date', value: editing ? dOnly(s.cryo_date) : '' },
      { name: 'cryo_media', label: 'Cryo medium', value: editing ? s.cryo_media : '', placeholder: 'e.g. CryoStor CS10' },
      { name: 'thaw_viability_pct', label: 'Thaw viability (%)', type: 'number', step: '0.1', value: editing ? s.thaw_viability_pct : null },
      { name: 'prepared_by', label: 'Prepared by', value: editing ? s.prepared_by : '' },
      { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((x) => ({ value: x, label: fmt.title(x) })), value: editing ? s.status : 'stored' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, value: editing ? s.notes : '' },
    ];
    if (editing) fields.push({ name: '__reason', label: 'Reason for change', full: true, placeholder: 'Recorded in audit trail' });
    App.formModal({
      title: editing ? 'Edit sample' : 'Register sample / aliquot', submitLabel: editing ? 'Save changes' : 'Add sample', wide: true, fields,
      onSubmit: async (v) => {
        if (editing) { const reason = v.__reason; delete v.__reason; await App.api('samples.update', { id: s.id, changes: v, reason }); App.toast('Sample updated.', 'ok'); }
        else { await App.api('samples.create', v); App.toast('Sample registered.', 'ok'); }
        App.go('samples');
      },
    });
  }

  async function sampleDetail(id) {
    let data;
    try { data = await App.api('samples.get', { id }); } catch (e) { App.toast(e.message, 'err'); return; }
    const s = data.sample;
    const body = h('div',
      ui.kv([
        ['Sample ID', s.sample_code, true], ['Type', fmt.title(s.sample_type)], ['Name', s.name],
        ['Source lot', s.source_lot, true], ['Source line', s.source_line, true], ['Passage', s.passage, true],
        ['Concentration', s.concentration], ['Cell count / vial', fmt.sci(s.cell_count), true], ['Volume', s.volume_ml != null ? s.volume_ml + ' mL' : null, true],
        ['Vials', vialText(s), true], ['Location', locText(s), true], ['Storage temp', s.storage_temp],
        ['Cryo date', fmt.date(s.cryo_date), true], ['Cryo medium', s.cryo_media], ['Thaw viability', s.thaw_viability_pct != null ? s.thaw_viability_pct + ' %' : null, true],
        ['Prepared by', s.prepared_by], ['Status', fmt.title(s.status)],
      ]),
      s.notes ? h('div', { style: { marginTop: '12px', fontSize: '13px', whiteSpace: 'pre-wrap' } }, s.notes) : null,
      h('div', { style: { height: '16px' } }),
      ui.panel({
        title: 'Assays on this sample', icon: 'scan', flush: true,
        body: ui.table({
          head: ['Type', 'Title', 'Performed', 'Conclusion'], rows: data.assays, empty: 'No assays linked to this sample.', emptyIcon: 'scan',
          render: (a) => ({ cells: [a.assay_type, a.title, td(fmt.date(a.performed_at), 'mono'), a.conclusion ? App.chip(a.conclusion) : '—'] }),
        }),
      }),
      h('div', { style: { height: '16px' } }),
      ui.attachmentsPanel('sample', id, data.attachments, () => sampleDetail(id)));
    App.closeModal();
    App.modal({ title: (s.sample_code || s.name || 'Sample') + ' — record', body, wide: true });
  }

  function dOnly(s) { return s ? String(s).slice(0, 10) : ''; }
})();
