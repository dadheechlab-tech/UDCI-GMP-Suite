'use strict';

/* =========================================================================
   Assays & results — FACS, qPCR, RNA-seq, imaging and other analyses, with
   result summaries and attached raw-data / analysis files (hashed on import).
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, fmt = App.fmt, ui = App.ui, td = App.ui.td;
  let typeFilter = 'all';

  const TYPES = [
    { value: 'FACS', label: 'Flow cytometry (FACS)' },
    { value: 'qPCR', label: 'qPCR / RT-PCR' },
    { value: 'RNAseq', label: 'RNA-seq' },
    { value: 'imaging', label: 'Imaging / IF' },
    { value: 'ELISA', label: 'ELISA' },
    { value: 'sequencing', label: 'Sequencing' },
    { value: 'karyotype', label: 'Karyotype / CNV' },
    { value: 'other', label: 'Other' },
  ];
  const CONCLUSIONS = ['pass', 'fail', 'inconclusive', 'informational'];

  App.views.assays = async function (root) {
    const assays = await App.api('assays.list', { assay_type: typeFilter });

    const typeSel = h('select', { style: { width: 'auto', minWidth: '160px' } },
      [{ value: 'all', label: 'All assay types' }, ...TYPES].map((o) => {
        const el = h('option', { value: o.value }, o.label); if (o.value === typeFilter) el.selected = true; return el;
      }));
    typeSel.addEventListener('change', () => { typeFilter = typeSel.value; App.go('assays'); });

    root.appendChild(h('div.page-head',
      h('div', h('h1', 'Assays & results'),
        h('div.sub', assays.length + ' record' + (assays.length === 1 ? '' : 's') + ' · FACS, PCR, sequencing & analysis data')),
      h('div.grow'), typeSel,
      h('button.btn.primary', { onClick: () => assayForm(null) }, icon('plus', 16), 'Add assay')));

    root.appendChild(ui.panel({
      flush: true,
      body: ui.table({
        head: ['Type', 'Title', 'Source', 'Markers / targets', 'Instrument', 'Performed', { label: 'Files', cls: 'num' }, { label: 'Result' }, { label: '', cls: 'actions' }],
        rows: assays,
        empty: 'No assays yet. Record FACS, qPCR, RNA-seq and imaging results and attach the raw data files.',
        emptyIcon: 'scan',
        render: (a) => ({
          onClick: () => assayDetail(a.id),
          cells: [
            td(h('span.chip.assay-type', a.assay_type)),
            td(h('span', { style: { fontWeight: 600 } }, a.title)),
            td(a.source_ref || '—', 'mono'),
            a.target_markers || '—',
            a.instrument || '—',
            td(fmt.date(a.performed_at), 'mono'),
            td(String(a._files || 0), 'num'),
            a.conclusion ? App.chip(a.conclusion) : '—',
            td(h('div', { style: { display: 'flex', gap: '4px', justifyContent: 'flex-end' } },
              ui.iconBtn('edit', () => assayForm(a), 'Edit'),
              ui.iconBtn('trash', () => ui.confirmDelete('assay', async (reason) => { await App.api('assays.delete', { id: a.id, reason }); App.go('assays'); }), 'Delete', true)), 'actions'),
          ],
        }),
      }),
    }));
  };

  function assayForm(a) {
    const editing = !!a;
    const fields = [
      { name: 'assay_type', label: 'Assay type', type: 'select', options: TYPES, value: editing ? a.assay_type : 'FACS' },
      { name: 'assay_code', label: 'Assay ID / code', mono: true, value: editing ? a.assay_code : '' },
      { name: 'title', label: 'Title', required: true, full: true, value: editing ? a.title : '', placeholder: 'e.g. S7 islet identity panel — C-peptide / NKX6.1' },
      { name: 'source_ref', label: 'Source (lot / sample)', mono: true, value: editing ? a.source_ref : '' },
      { name: 'target_markers', label: 'Markers / gene targets', full: true, value: editing ? a.target_markers : '', placeholder: 'C-peptide, NKX6.1, PDX1, MAFA / INS, GCG…' },
      { name: 'instrument', label: 'Instrument', mono: true, value: editing ? a.instrument : '', placeholder: 'e.g. BD FACSymphony, QuantStudio 7' },
      { name: 'performed_by', label: 'Performed by', value: editing ? a.performed_by : '' },
      { name: 'performed_at', label: 'Performed at', type: 'datetime-local', value: editing ? '' : fmt.nowLocal(), hint: editing ? 'Leave blank to keep existing.' : null },
      { name: 'result_summary', label: 'Result summary', type: 'textarea', full: true, value: editing ? a.result_summary : '', placeholder: 'e.g. 78% C-peptide+ / NKX6.1+ double-positive; INS 2^-ΔΔCt = 3.4×' },
      { name: 'conclusion', label: 'Conclusion', type: 'select', options: [{ value: '', label: '—' }, ...CONCLUSIONS.map((c) => ({ value: c, label: fmt.title(c) }))], value: editing ? a.conclusion : '' },
      { name: 'data_location', label: 'Raw data location', value: editing ? a.data_location : '', placeholder: 'path / server / notebook ref' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, value: editing ? a.notes : '' },
    ];
    if (editing) fields.push({ name: '__reason', label: 'Reason for change', full: true, placeholder: 'Recorded in audit trail' });
    App.formModal({
      title: editing ? 'Edit assay' : 'Add assay / result', submitLabel: editing ? 'Save changes' : 'Add assay', wide: true, fields,
      onSubmit: async (v) => {
        if (editing) { const reason = v.__reason; delete v.__reason; if (v.performed_at == null) delete v.performed_at; await App.api('assays.update', { id: a.id, changes: v, reason }); App.toast('Assay updated.', 'ok'); }
        else { await App.api('assays.create', v); App.toast('Assay recorded.', 'ok'); }
        App.go('assays');
      },
    });
  }

  async function assayDetail(id) {
    let data;
    try { data = await App.api('assays.get', { id }); } catch (e) { App.toast(e.message, 'err'); return; }
    const a = data.assay;
    const body = h('div',
      ui.kv([
        ['Type', a.assay_type], ['Assay ID', a.assay_code, true], ['Title', a.title],
        ['Source', a.source_ref, true], ['Markers / targets', a.target_markers], ['Instrument', a.instrument, true],
        ['Performed by', a.performed_by], ['Performed at', fmt.dt(a.performed_at), true],
        ['Conclusion', a.conclusion ? fmt.title(a.conclusion) : null], ['Raw data location', a.data_location, true],
      ]),
      a.result_summary ? h('div', { style: { marginTop: '12px' } }, h('div.section-label', 'Result summary'), h('div', { style: { fontSize: '13px', whiteSpace: 'pre-wrap', marginTop: '6px' } }, a.result_summary)) : null,
      a.notes ? h('div', { style: { marginTop: '12px', fontSize: '13px', whiteSpace: 'pre-wrap', color: 'var(--ink-2)' } }, a.notes) : null,
      h('div', { style: { height: '16px' } }),
      ui.attachmentsPanel('assay', id, data.attachments, () => assayDetail(id)));
    App.closeModal();
    App.modal({ title: a.title + ' — ' + a.assay_type, body, wide: true });
  }
})();
