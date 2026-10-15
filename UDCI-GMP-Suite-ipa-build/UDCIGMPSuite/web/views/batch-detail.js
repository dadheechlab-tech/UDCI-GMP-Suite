'use strict';

/* =========================================================================
   Batch record — the working surface of the notebook.
   Header + disposition control, then tabs:
   Overview · Stages · Bioreactor & counts · QC · Materials · Deviations ·
   Attachments · Sign-off · Audit.  Plus a print-only batch record.
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, fmt = App.fmt, ui = App.ui, td = App.ui.td;

  let activeTab = 'overview';
  let lastId = null;

  /* ---- canonical 7-stage SC-islet differentiation ---- */
  const STAGE_OPTS = [
    { value: 'iPSC', label: 'iPSC — Undifferentiated' },
    { value: 'S1', label: 'S1 — Definitive endoderm' },
    { value: 'S2', label: 'S2 — Primitive gut tube' },
    { value: 'S3', label: 'S3 — Posterior foregut' },
    { value: 'S4', label: 'S4 — Pancreatic endoderm' },
    { value: 'S5', label: 'S5 — Endocrine progenitor' },
    { value: 'S6', label: 'S6 — Immature endocrine / β' },
    { value: 'S7', label: 'S7 — Maturing SC-islets' },
  ];
  const STAGE_NAMES = STAGE_OPTS.reduce((m, o) => {
    m[o.value] = o.label.replace(/^[^—]+—\s*/, '');
    return m;
  }, {});
  const VESSELS = [
    { value: 'PBS-MINI 0.1L', label: 'PBS-MINI 0.1 L' },
    { value: 'PBS 0.5L', label: 'PBS 0.5 L' },
    { value: 'PBS 3L', label: 'PBS 3 L' },
    { value: 'Other', label: 'Other' },
  ];
  const COUNT_METHODS = [
    { value: 'NC-200', label: 'NucleoCounter NC-200' },
    { value: 'Vi-CELL', label: 'Vi-CELL' },
    { value: 'Hemocytometer', label: 'Manual hemocytometer' },
    { value: 'Flow', label: 'Flow cytometry' },
    { value: 'Other', label: 'Other' },
  ];

  App.views.batch = async function (root) {
    const id = App.state.params.id;
    if (id !== lastId) { activeTab = 'overview'; lastId = id; }
    await paint(root, id);
  };

  async function paint(root, id) {
    const data = await App.api('batches.get', { id });
    root.innerHTML = '';
    const ctx = { data, id, reload: () => paint(root, id) };

    const screen = h('div.screen-only');
    screen.appendChild(buildHeader(ctx));
    screen.appendChild(statusControl(ctx));
    screen.appendChild(tabBar(ctx));
    const body = h('div');
    screen.appendChild(body);
    renderTab(body, ctx);

    root.appendChild(screen);
    root.appendChild(printBlock(data));
  }

  /* ---------------- header + disposition ---------------- */
  function buildHeader(ctx) {
    const b = ctx.data.batch;
    return h('div',
      h('div', { style: { marginBottom: '10px' } },
        h('button.btn.ghost.sm', { onClick: () => App.go('batches') }, icon('back', 15), 'All batches')),
      h('div.spread',
        h('div',
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('h1', { style: { fontSize: '22px', margin: 0, fontFamily: 'var(--mono)' } }, b.lot_number),
            App.chip(b.status)),
          h('div.sub', { style: { color: 'var(--muted)', marginTop: '4px' } },
            b.product_name + ' · ' + fmt.title(b.donor_type) + (b.cell_line ? ' · ' + b.cell_line : ''))),
        h('div.grow'),
        h('div.btn-row',
          btn('edit', 'Edit', () => editBatch(ctx)),
          btn('download', 'Export JSON', async () => {
            try { const r = await App.api('system.exportBatchJson', { id: b.id }); if (r && r.ok) App.toast('Exported to ' + r.path, 'ok'); }
            catch (e) { App.toast(e.message, 'err'); }
          }),
          btn('file', 'Print record', () => window.print()))));
  }
  function btn(ic, label, onClick) { return h('button.btn.sm', { onClick }, icon(ic, 14), label); }

  function statusControl(ctx) {
    const b = ctx.data.batch;
    const u = App.state.user;
    const canDisposition = u.role === 'qa' || u.role === 'admin';
    const S = b.status;

    const set = async (status, reason) => {
      try {
        await App.api('batches.setStatus', { id: b.id, status, reason: reason || null });
        App.toast('Status updated to ' + fmt.title(status) + '.', 'ok');
        ctx.reload();
      } catch (e) { App.toast(e.message, 'err'); }
    };
    const withReason = async (status, title, danger) => {
      const res = await App.confirm({
        title, message: 'This changes the disposition of lot ' + b.lot_number + '. A reason is recorded in the audit trail.',
        confirmLabel: title, danger, requireReason: true,
      });
      if (res) set(status, res.reason);
    };

    const actions = [];
    if (S !== 'released' && S !== 'rejected') {
      if (S === 'in_process') actions.push(btn('clock', 'Place on hold', () => withReason('on_hold', 'Place batch on hold')));
      if (S === 'on_hold') actions.push(btn('refresh', 'Resume', () => set('in_process')));
      if (S !== 'quarantine') actions.push(btn('lock', 'Quarantine', () => withReason('quarantine', 'Move to quarantine')));
      if (S === 'quarantine') actions.push(btn('refresh', 'Return to process', () => set('in_process')));
      if (canDisposition) {
        actions.push(h('button.btn.sm.primary', { onClick: () => withReason('released', 'Release batch') }, icon('check', 14), 'Release'));
        actions.push(h('button.btn.sm.danger', { onClick: () => withReason('rejected', 'Reject batch', true) }, icon('x', 14), 'Reject'));
      }
    }
    const note = (S === 'released' || S === 'rejected')
      ? h('span.muted', { style: { fontSize: '12.5px' } }, 'Final disposition recorded' + (b.completed_at ? ' · ' + fmt.dt(b.completed_at) : ''))
      : (!canDisposition ? h('span.muted', { style: { fontSize: '12px' } }, 'Release / reject is restricted to QA.') : null);

    return h('div.panel', { style: { marginTop: '16px' } },
      h('div.panel-body', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
        h('span', { style: { fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.7px', fontWeight: 600 } }, 'Disposition'),
        App.chip(b.status),
        h('div.grow'),
        ...actions,
        note));
  }

  function editBatch(ctx) {
    const b = ctx.data.batch;
    App.formModal({
      title: 'Edit batch details', submitLabel: 'Save changes', wide: true,
      note: 'Changes are recorded in the audit trail.',
      fields: [
        { name: 'product_name', label: 'Product', value: b.product_name, full: true },
        { name: 'donor_type', label: 'Donor source', type: 'select', value: b.donor_type,
          options: [{ value: 'autologous', label: 'Autologous' }, { value: 'allogeneic', label: 'Allogeneic' }] },
        { name: 'donor_id', label: 'Donor / subject ID', mono: true, value: b.donor_id },
        { name: 'cell_line', label: 'iPSC line', mono: true, value: b.cell_line },
        { name: 'site', label: 'Manufacturing site', value: b.site },
        { name: 'protocol_ref', label: 'Protocol / SOP ref', mono: true, value: b.protocol_ref },
        { name: 'target_dose', label: 'Target dose', value: b.target_dose },
        { name: 'description', label: 'Notes', type: 'textarea', full: true, value: b.description },
        { name: '__reason', label: 'Reason for change', full: true, placeholder: 'Recorded in audit trail' },
      ],
      onSubmit: async (v) => {
        const reason = v.__reason; delete v.__reason;
        await App.api('batches.update', { id: b.id, changes: v, reason });
        App.toast('Batch updated.', 'ok');
        ctx.reload();
      },
    });
  }

  /* ---------------- tabs ---------------- */
  function tabBar(ctx) {
    const d = ctx.data;
    const tabs = [
      ['overview', 'Overview', 'clipboard', null],
      ['stages', 'Process stages', 'branch', d.stages.length],
      ['monitoring', 'Bioreactor & counts', 'activity', d.reactor.length + d.counts.length],
      ['qc', 'Quality control', 'microscope', d.qc.length],
      ['materials', 'Materials', 'package', d.materials.length],
      ['deviations', 'Deviations', 'alert', d.deviations.length],
      ['files', 'Attachments', 'file', d.attachments.length],
      ['signoff', 'Sign-off', 'pen', d.signatures.length],
      ['audit', 'Audit', 'shield', null],
    ];
    return h('div.tabs', { style: { marginTop: '20px' } }, tabs.map(([key, label, ic, n]) =>
      h('div.tab' + (activeTab === key ? '.active' : ''), { onClick: () => { activeTab = key; ctx.reload(); } },
        icon(ic, 15), label, n != null ? h('span.count', String(n)) : null)));
  }

  function renderTab(body, ctx) {
    const map = {
      overview: tabOverview, stages: tabStages, monitoring: tabMonitoring,
      qc: tabQC, materials: tabMaterials, deviations: tabDeviations,
      files: tabFiles, signoff: tabSignoff, audit: tabAudit,
    };
    (map[activeTab] || tabOverview)(body, ctx);
  }

  function rowActions(opts) {
    return td(h('div', { style: { display: 'flex', gap: '4px', justifyContent: 'flex-end' } },
      opts.onEdit ? ui.iconBtn('edit', opts.onEdit, 'Edit') : null,
      opts.onDelete ? ui.iconBtn('trash', opts.onDelete, 'Delete', true) : null), 'actions');
  }

  /* ---- Overview ---- */
  function tabOverview(body, ctx) {
    const b = ctx.data.batch;
    body.appendChild(h('div.grid', { style: { gridTemplateColumns: '1.3fr 1fr', gap: '16px' } },
      ui.panel({
        title: 'Batch record', icon: 'clipboard',
        body: ui.kv([
          ['Lot / batch', b.lot_number, true],
          ['Product', b.product_name],
          ['Donor source', fmt.title(b.donor_type)],
          ['Donor / subject ID', b.donor_id, true],
          ['iPSC line', b.cell_line, true],
          ['Manufacturing site', b.site],
          ['Protocol / SOP', b.protocol_ref, true],
          ['Target dose', b.target_dose],
          ['Production start', fmt.dt(b.started_at), true],
          ['Completion', b.completed_at ? fmt.dt(b.completed_at) : null, true],
          ['Created', fmt.dt(b.created_at) + ' · ' + (b.created_by || ''), true],
          b.updated_at ? ['Last updated', fmt.dt(b.updated_at) + ' · ' + (b.updated_by || ''), true] : null,
        ]),
      }),
      h('div.row-gap',
        ui.panel({
          title: 'Description', icon: 'file',
          body: b.description
            ? h('div', { style: { fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: 1.55 } }, b.description)
            : h('div.muted', 'No description recorded.'),
        }),
        ui.panel({ title: 'Record contents', icon: 'list', body: contentsList(ctx.data) }))));
  }
  function contentsList(d) {
    const rows = [
      ['Process stages', d.stages.length],
      ['Bioreactor readings', d.reactor.length],
      ['Cell counts', d.counts.length],
      ['QC tests', d.qc.length],
      ['Materials logged', d.materials.length],
      ['Open deviations', d.deviations.filter((x) => x.status !== 'closed').length],
      ['Attachments', d.attachments.length],
      ['Signatures', d.signatures.length],
    ];
    return h('dl.kv', rows.flatMap(([k, v]) => [h('dt', k), h('dd.mono', String(v))]));
  }

  /* ---- Stages ---- */
  function tabStages(body, ctx) {
    const d = ctx.data;
    body.appendChild(ui.panel({
      title: 'Differentiation stages', icon: 'branch',
      actions: h('button.btn.sm.primary', { onClick: () => stageForm(null, ctx) }, icon('plus', 14), 'Add stage'),
      flush: true,
      body: ui.table({
        head: ['Stage', 'Window', { label: 'Dur (d)', cls: 'num' }, 'Media lot', 'Seed → Harvest', { label: 'Viab %', cls: 'num' }, 'Status', { label: '', cls: 'actions' }],
        rows: d.stages,
        empty: 'No process stages recorded yet. Add each differentiation stage as it begins.',
        emptyIcon: 'branch',
        render: (s) => ({
          cells: [
            td(h('div',
              h('span', { style: { fontFamily: 'var(--mono)', fontWeight: 600 } }, s.stage_code),
              h('div', { style: { fontSize: '11.5px', color: 'var(--muted)' } }, s.stage_name))),
            td(dateRange(s.start_date, s.end_date)),
            td(fmt.num(s.duration_days), 'num'),
            td(s.media_lot || '—', 'mono'),
            td(densRange(s.seed_density, s.harvest_density), 'mono'),
            td(s.viability_pct != null ? fmt.num(s.viability_pct, 1) : '—', 'num'),
            stageStatusChip(s.status),
            rowActions({
              onEdit: () => stageForm(s, ctx),
              onDelete: () => ui.confirmDelete('stage', async (reason) => { await App.api('stages.delete', { id: s.id, reason }); ctx.reload(); }),
            }),
          ],
        }),
      }),
    }));
  }
  function stageStatusChip(st) {
    if (!st) return '—';
    const map = { in_process: 'in_process', on_hold: 'on_hold', complete: 'closed', failed: 'rejected' };
    return h('span.chip.' + (map[st] || 'pending'), fmt.title(st));
  }
  function stageForm(s, ctx) {
    const editing = !!s;
    const fields = [
      { name: 'stage_code', label: 'Stage', type: 'select', required: true, full: true,
        value: editing ? s.stage_code : 'S1', options: STAGE_OPTS, hint: 'Canonical 7-stage SC-islet differentiation.' },
      { name: 'start_date', label: 'Start date', type: 'date', value: editing ? dateOnly(s.start_date) : '' },
      { name: 'end_date', label: 'End date', type: 'date', value: editing ? dateOnly(s.end_date) : '' },
      { name: 'duration_days', label: 'Duration (days)', type: 'number', step: '0.1', value: editing ? s.duration_days : null },
      { name: 'media_lot', label: 'Media lot', mono: true, value: editing ? s.media_lot : '' },
      { name: 'key_factors', label: 'Key factors / cytokines', full: true, value: editing ? s.key_factors : '', placeholder: 'e.g. Activin A, CHIR99021, KGF, RA' },
      { name: 'seed_density', label: 'Seed density', mono: true, value: editing ? s.seed_density : '', placeholder: 'cells/mL' },
      { name: 'harvest_density', label: 'Harvest density', mono: true, value: editing ? s.harvest_density : '', placeholder: 'cells/mL' },
      { name: 'viability_pct', label: 'Viability (%)', type: 'number', step: '0.1', value: editing ? s.viability_pct : null },
      { name: 'status', label: 'Status', type: 'select', value: editing ? s.status : 'in_process',
        options: [{ value: 'in_process', label: 'In process' }, { value: 'complete', label: 'Complete' }, { value: 'on_hold', label: 'On hold' }, { value: 'failed', label: 'Failed' }] },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, value: editing ? s.notes : '' },
    ];
    if (editing) fields.push({ name: '__reason', label: 'Reason for change', full: true, placeholder: 'Recorded in audit trail' });
    App.formModal({
      title: editing ? 'Edit stage' : 'Add differentiation stage',
      submitLabel: editing ? 'Save changes' : 'Add stage', wide: true, fields,
      onSubmit: async (v) => {
        v.stage_name = STAGE_NAMES[v.stage_code] || v.stage_code;
        if (editing) {
          const reason = v.__reason; delete v.__reason;
          await App.api('stages.update', { id: s.id, changes: v, reason });
          App.toast('Stage updated.', 'ok');
        } else {
          v.batch_id = ctx.id;
          await App.api('stages.add', v);
          App.toast('Stage added.', 'ok');
        }
        ctx.reload();
      },
    });
  }

  /* ---- Monitoring: bioreactor + cell counts ---- */
  function tabMonitoring(body, ctx) {
    const d = ctx.data;
    body.appendChild(ui.panel({
      title: 'Bioreactor monitoring (PBS Vertical-Wheel)', icon: 'activity',
      actions: h('button.btn.sm.primary', { onClick: () => reactorForm(ctx) }, icon('plus', 14), 'Add reading'),
      flush: true,
      body: ui.table({
        head: ['Time', 'Vessel', { label: 'RPM', cls: 'num' }, { label: 'pH', cls: 'num' }, { label: 'DO %', cls: 'num' },
          { label: 'Glc', cls: 'num' }, { label: 'Lac', cls: 'num' }, { label: 'NH₃', cls: 'num' },
          { label: 'Viable dens.', cls: 'num' }, { label: 'Viab %', cls: 'num' }, { label: 'Agg µm', cls: 'num' }, { label: '', cls: 'actions' }],
        rows: d.reactor,
        empty: 'No bioreactor readings yet. Capture pH, DO, metabolites, density and aggregate size over the run.',
        emptyIcon: 'activity',
        render: (r) => ({
          cells: [
            td(fmt.dt(r.reading_at), 'mono'),
            r.vessel_type || '—',
            td(fmt.num(r.wheel_rpm), 'num'),
            td(fmt.num(r.ph, 2), 'num'),
            td(fmt.num(r.do_pct, 1), 'num'),
            td(fmt.num(r.glucose_g_l, 2), 'num'),
            td(fmt.num(r.lactate_g_l, 2), 'num'),
            td(fmt.num(r.ammonia_mm, 2), 'num'),
            td(fmt.sci(r.viable_density), 'num'),
            td(fmt.num(r.viability_pct, 1), 'num'),
            td(fmt.num(r.aggregate_um, 1), 'num'),
            rowActions({ onDelete: () => ui.confirmDelete('reading', async (reason) => { await App.api('reactor.delete', { id: r.id, reason }); ctx.reload(); }) }),
          ],
        }),
      }),
    }));
    body.appendChild(h('div', { style: { height: '16px' } }));
    body.appendChild(ui.panel({
      title: 'Cell counts', icon: 'vial',
      actions: h('button.btn.sm.primary', { onClick: () => countForm(ctx) }, icon('plus', 14), 'Add count'),
      flush: true,
      body: ui.table({
        head: ['Time', 'Method', { label: 'Total viable', cls: 'num' }, { label: 'Viab %', cls: 'num' }, { label: 'Density', cls: 'num' }, { label: 'Vol (mL)', cls: 'num' }, { label: '', cls: 'actions' }],
        rows: d.counts,
        empty: 'No cell counts yet.',
        emptyIcon: 'vial',
        render: (c) => ({
          cells: [
            td(fmt.dt(c.counted_at), 'mono'),
            c.method || '—',
            td(fmt.sci(c.total_viable_cells), 'num'),
            td(fmt.num(c.viability_pct, 1), 'num'),
            td(fmt.sci(c.density_cells_ml), 'num'),
            td(fmt.num(c.volume_ml, 1), 'num'),
            rowActions({ onDelete: () => ui.confirmDelete('cell count', async (reason) => { await App.api('counts.delete', { id: c.id, reason }); ctx.reload(); }) }),
          ],
        }),
      }),
    }));
  }
  function reactorForm(ctx) {
    App.formModal({
      title: 'Add bioreactor reading', submitLabel: 'Add reading', wide: true,
      fields: [
        { name: 'reading_at', label: 'Reading time', type: 'datetime-local', value: fmt.nowLocal() },
        { name: 'vessel_type', label: 'Vessel', type: 'select', options: VESSELS, value: 'PBS 0.5L' },
        { name: 'vessel_id', label: 'Vessel ID', mono: true },
        { name: 'day_in_stage', label: 'Day in stage', type: 'number', step: '0.1' },
        { name: 'working_volume_ml', label: 'Working volume (mL)', type: 'number', step: 'any' },
        { name: 'wheel_rpm', label: 'Wheel speed (RPM)', type: 'number', step: 'any' },
        { name: 'temperature_c', label: 'Temperature (°C)', type: 'number', step: '0.1' },
        { name: 'ph', label: 'pH', type: 'number', step: '0.01' },
        { name: 'do_pct', label: 'Dissolved O₂ (%)', type: 'number', step: '0.1' },
        { name: 'glucose_g_l', label: 'Glucose (g/L)', type: 'number', step: '0.01' },
        { name: 'lactate_g_l', label: 'Lactate (g/L)', type: 'number', step: '0.01' },
        { name: 'ammonia_mm', label: 'Ammonia (mM)', type: 'number', step: '0.01' },
        { name: 'viable_density', label: 'Viable cell density (cells/mL)', type: 'number', step: 'any' },
        { name: 'viability_pct', label: 'Viability (%)', type: 'number', step: '0.1' },
        { name: 'aggregate_um', label: 'Aggregate diameter (µm)', type: 'number', step: '0.1' },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true },
      ],
      onSubmit: async (v) => { v.batch_id = ctx.id; await App.api('reactor.add', v); App.toast('Reading recorded.', 'ok'); ctx.reload(); },
    });
  }
  function countForm(ctx) {
    App.formModal({
      title: 'Add cell count', submitLabel: 'Add count',
      fields: [
        { name: 'counted_at', label: 'Counted at', type: 'datetime-local', value: fmt.nowLocal() },
        { name: 'method', label: 'Method', type: 'select', options: COUNT_METHODS, value: 'NC-200' },
        { name: 'total_viable_cells', label: 'Total viable cells', type: 'number', step: 'any' },
        { name: 'viability_pct', label: 'Viability (%)', type: 'number', step: '0.1' },
        { name: 'density_cells_ml', label: 'Density (cells/mL)', type: 'number', step: 'any' },
        { name: 'volume_ml', label: 'Volume (mL)', type: 'number', step: '0.1' },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true },
      ],
      onSubmit: async (v) => { v.batch_id = ctx.id; await App.api('counts.add', v); App.toast('Cell count recorded.', 'ok'); ctx.reload(); },
    });
  }

  /* ---- QC ---- */
  function tabQC(body, ctx) {
    const d = ctx.data;
    body.appendChild(ui.panel({
      title: 'Quality control & release testing', icon: 'microscope',
      actions: h('button.btn.sm.primary', { onClick: () => qcForm(null, ctx) }, icon('plus', 14), 'Add test'),
      flush: true,
      body: ui.table({
        head: ['Category', 'Test', 'Parameter', 'Result', 'Value', 'Specification', 'Tested', 'By', { label: '', cls: 'actions' }],
        rows: d.qc,
        empty: 'No QC tests recorded yet. Capture in-process and release assays here — identity, purity, GSIS potency, sterility, endotoxin…',
        emptyIcon: 'microscope',
        render: (q) => ({
          cells: [
            td(q.category === 'release' ? h('span.chip.role-qa', 'Release') : h('span.chip.role-operator', 'In-process')),
            td(h('span', { style: { fontWeight: 600 } }, q.test_name)),
            q.parameter || '—',
            App.chip(q.result || 'pending'),
            td(valueUnit(q), 'mono'),
            td(specText(q), 'mono'),
            td(q.tested_at ? fmt.date(q.tested_at) : '—', 'mono'),
            q.performed_by || '—',
            rowActions({
              onEdit: () => qcForm(q, ctx),
              onDelete: () => ui.confirmDelete('QC test', async (reason) => { await App.api('qc.delete', { id: q.id, reason }); ctx.reload(); }),
            }),
          ],
        }),
      }),
    }));
  }
  function valueUnit(q) { if (q.value == null || q.value === '') return '—'; return q.value + (q.unit ? ' ' + q.unit : ''); }
  function specText(q) {
    if (q.spec_text) return q.spec_text;
    const lo = q.spec_min, hi = q.spec_max;
    if (lo != null && hi != null) return lo + '–' + hi;
    if (lo != null) return '≥ ' + lo;
    if (hi != null) return '≤ ' + hi;
    return '—';
  }
  function qcForm(q, ctx) {
    const editing = !!q;
    const fields = [
      { name: 'category', label: 'Category', type: 'select', value: editing ? q.category : 'in_process',
        options: [{ value: 'in_process', label: 'In-process' }, { value: 'release', label: 'Release' }] },
      { name: 'test_name', label: 'Test', required: true, full: true, value: editing ? q.test_name : '', placeholder: 'e.g. GSIS potency, C-peptide identity, sterility' },
      { name: 'parameter', label: 'Parameter', value: editing ? q.parameter : '', placeholder: 'e.g. Stimulation index' },
      { name: 'result', label: 'Result', type: 'select', value: editing ? q.result : 'pending',
        options: [{ value: 'pending', label: 'Pending' }, { value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'na', label: 'N/A' }] },
      { name: 'value', label: 'Measured value', mono: true, value: editing ? q.value : '' },
      { name: 'unit', label: 'Unit', value: editing ? q.unit : '', placeholder: 'e.g. %, SI, EU/mL' },
      { name: 'spec_min', label: 'Spec min', type: 'number', step: 'any', value: editing ? q.spec_min : null },
      { name: 'spec_max', label: 'Spec max', type: 'number', step: 'any', value: editing ? q.spec_max : null },
      { name: 'spec_text', label: 'Spec (free text)', full: true, value: editing ? q.spec_text : '', placeholder: 'e.g. ≥ 2.0; report result' },
      { name: 'method', label: 'Method', value: editing ? q.method : '' },
      { name: 'instrument', label: 'Instrument', mono: true, value: editing ? q.instrument : '' },
      { name: 'performed_by', label: 'Performed by', value: editing ? q.performed_by : '' },
      { name: 'tested_at', label: 'Tested at', type: 'datetime-local', value: editing ? '' : fmt.nowLocal(), hint: editing ? 'Leave blank to keep the existing date.' : null },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, value: editing ? q.notes : '' },
    ];
    if (editing) fields.push({ name: '__reason', label: 'Reason for change', full: true, placeholder: 'Recorded in audit trail' });
    App.formModal({
      title: editing ? 'Edit QC test' : 'Add QC test', submitLabel: editing ? 'Save changes' : 'Add test', wide: true, fields,
      onSubmit: async (v) => {
        if (editing) {
          const reason = v.__reason; delete v.__reason;
          if (v.tested_at == null) delete v.tested_at;
          await App.api('qc.update', { id: q.id, changes: v, reason });
          App.toast('QC test updated.', 'ok');
        } else {
          v.batch_id = ctx.id; await App.api('qc.add', v); App.toast('QC test added.', 'ok');
        }
        ctx.reload();
      },
    });
  }

  /* ---- Materials ---- */
  function tabMaterials(body, ctx) {
    const d = ctx.data;
    body.appendChild(ui.panel({
      title: 'Materials & lot traceability', icon: 'package',
      actions: h('button.btn.sm.primary', { onClick: () => materialForm(ctx) }, icon('plus', 14), 'Add material'),
      flush: true,
      body: ui.table({
        head: ['Material', 'Type', 'Vendor', 'Catalog #', 'Lot #', 'Expiry', 'GMP', { label: '', cls: 'actions' }],
        rows: d.materials,
        empty: 'No materials logged. Record every media, growth factor, matrix and reagent lot used in the run.',
        emptyIcon: 'package',
        render: (m) => ({
          cells: [
            td(h('span', { style: { fontWeight: 600 } }, m.material_name)),
            m.type ? fmt.title(m.type) : '—',
            m.vendor || '—',
            td(m.catalog_no || '—', 'mono'),
            td(m.lot_no || '—', 'mono'),
            td(m.expiry_date ? fmt.date(m.expiry_date) : '—', 'mono'),
            m.gmp_grade ? h('span.gmp-tag', 'GMP') : h('span.muted', '—'),
            rowActions({ onDelete: () => ui.confirmDelete('material', async (reason) => { await App.api('materials.delete', { id: m.id, reason }); ctx.reload(); }) }),
          ],
        }),
      }),
    }));
  }
  function materialForm(ctx) {
    App.formModal({
      title: 'Add material', submitLabel: 'Add material', wide: true,
      fields: [
        { name: 'material_name', label: 'Material', required: true, full: true, placeholder: 'e.g. mTeSR Plus, Activin A, Matrigel' },
        { name: 'type', label: 'Type', type: 'select', value: 'media',
          options: [{ value: 'media', label: 'Media' }, { value: 'growth_factor', label: 'Growth factor / cytokine' }, { value: 'matrix', label: 'Matrix / scaffold' }, { value: 'reagent', label: 'Reagent' }, { value: 'consumable', label: 'Consumable' }, { value: 'cell', label: 'Cell / biological' }] },
        { name: 'vendor', label: 'Vendor' },
        { name: 'catalog_no', label: 'Catalog #', mono: true },
        { name: 'lot_no', label: 'Lot #', mono: true },
        { name: 'expiry_date', label: 'Expiry date', type: 'date' },
        { name: 'gmp_grade', label: 'GMP grade', type: 'checkbox' },
        { name: 'coa_ref', label: 'CoA reference', mono: true },
        { name: 'quantity_used', label: 'Quantity used' },
        { name: 'unit', label: 'Unit', placeholder: 'e.g. mL, µg' },
        { name: 'used_at', label: 'Used at', type: 'datetime-local', value: fmt.nowLocal() },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true },
      ],
      onSubmit: async (v) => { v.batch_id = ctx.id; await App.api('materials.add', v); App.toast('Material logged.', 'ok'); ctx.reload(); },
    });
  }

  /* ---- Deviations ---- */
  function tabDeviations(body, ctx) {
    const d = ctx.data;
    body.appendChild(ui.panel({
      title: 'Deviations & CAPA', icon: 'alert',
      actions: h('button.btn.sm.primary', { onClick: () => deviationForm(null, ctx) }, icon('plus', 14), 'Log deviation'),
      flush: true,
      body: ui.table({
        head: ['Ref', 'Title', 'Class', 'Status', 'Occurred', 'Detected by', { label: '', cls: 'actions' }],
        rows: d.deviations,
        empty: 'No deviations recorded. Any departure from the batch record or SOP should be logged here.',
        emptyIcon: 'alert',
        render: (dev) => ({
          cells: [
            td(dev.deviation_no || '—', 'mono'),
            td(h('div',
              h('span', { style: { fontWeight: 600 } }, dev.title),
              dev.description ? h('div', { style: { fontSize: '11.5px', color: 'var(--muted)', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, dev.description) : null)),
            App.chip(dev.classification || 'minor'),
            App.chip(dev.status || 'open'),
            td(dev.occurred_at ? fmt.date(dev.occurred_at) : '—', 'mono'),
            dev.detected_by || '—',
            rowActions({
              onEdit: () => deviationForm(dev, ctx),
              onDelete: () => ui.confirmDelete('deviation', async (reason) => { await App.api('deviations.delete', { id: dev.id, reason }); ctx.reload(); }),
            }),
          ],
        }),
      }),
    }));
  }
  function deviationForm(dev, ctx) {
    const editing = !!dev;
    const fields = [
      { name: 'deviation_no', label: 'Reference #', mono: true, value: editing ? dev.deviation_no : '', placeholder: 'e.g. DEV-2026-003' },
      { name: 'title', label: 'Title', required: true, full: true, value: editing ? dev.title : '' },
      { name: 'description', label: 'Description', type: 'textarea', full: true, value: editing ? dev.description : '' },
      { name: 'classification', label: 'Classification', type: 'select', value: editing ? dev.classification : 'minor',
        options: [{ value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' }, { value: 'critical', label: 'Critical' }] },
      { name: 'status', label: 'Status', type: 'select', value: editing ? dev.status : 'open',
        options: [{ value: 'open', label: 'Open' }, { value: 'under_review', label: 'Under review' }, { value: 'closed', label: 'Closed' }] },
      { name: 'detected_by', label: 'Detected by', value: editing ? dev.detected_by : '' },
      { name: 'occurred_at', label: 'Occurred at', type: 'datetime-local', value: editing ? '' : fmt.nowLocal(), hint: editing ? 'Leave blank to keep existing.' : null },
      { name: 'root_cause', label: 'Root cause', type: 'textarea', full: true, value: editing ? dev.root_cause : '' },
      { name: 'corrective_action', label: 'Corrective / preventive action', type: 'textarea', full: true, value: editing ? dev.corrective_action : '' },
      { name: 'capa_ref', label: 'CAPA reference', mono: true, value: editing ? dev.capa_ref : '' },
    ];
    if (editing) fields.push({ name: '__reason', label: 'Reason for change', full: true, placeholder: 'Recorded in audit trail' });
    App.formModal({
      title: editing ? 'Edit deviation' : 'Log deviation', submitLabel: editing ? 'Save changes' : 'Log deviation', wide: true, fields,
      onSubmit: async (v) => {
        if (editing) {
          const reason = v.__reason; delete v.__reason;
          if (v.occurred_at == null) delete v.occurred_at;
          await App.api('deviations.update', { id: dev.id, changes: v, reason });
          App.toast('Deviation updated.', 'ok');
        } else {
          v.batch_id = ctx.id; await App.api('deviations.add', v); App.toast('Deviation logged.', 'ok');
        }
        ctx.reload();
      },
    });
  }

  /* ---- Attachments ---- */
  function tabFiles(body, ctx) {
    const d = ctx.data;
    body.appendChild(ui.panel({
      title: 'Attachments', icon: 'file',
      actions: h('button.btn.sm.primary', { onClick: () => attachFlow(ctx) }, icon('plus', 14), 'Attach file'),
      flush: true,
      body: ui.table({
        head: ['File', 'Description', { label: 'Size', cls: 'num' }, 'SHA-256', 'Uploaded', { label: '', cls: 'actions' }],
        rows: d.attachments,
        empty: 'No files attached. Add CoAs, raw instrument data, images or signed PDFs — each is hashed on import for integrity.',
        emptyIcon: 'file',
        render: (a) => ({
          cells: [
            td(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, icon('file', 14), h('span', a.filename))),
            a.description || '—',
            td(fmtBytes(a.size_bytes), 'num'),
            td((a.sha256 || '').slice(0, 12) + '…', 'mono'),
            td(h('div', fmt.date(a.uploaded_at), h('div', { style: { fontSize: '11px', color: 'var(--muted)' } }, a.uploaded_by || '')), 'mono'),
            td(h('div', { style: { display: 'flex', gap: '4px', justifyContent: 'flex-end' } },
              ui.iconBtn('eye', async () => { try { await App.api('attachments.open', { id: a.id }); } catch (e) { App.toast(e.message, 'err'); } }, 'Open'),
              ui.iconBtn('shield', async () => {
                try {
                  const r = await App.api('attachments.verify', { id: a.id });
                  App.toast(r.ok ? 'Integrity verified — file matches its recorded hash.' : 'WARNING: file does NOT match its recorded hash.', r.ok ? 'ok' : 'err');
                } catch (e) { App.toast(e.message, 'err'); }
              }, 'Verify integrity')), 'actions'),
          ],
        }),
      }),
    }));
  }
  function attachFlow(ctx) {
    App.pickFile((file) => {
      App.formModal({
        title: 'Attach file', submitLabel: 'Attach', note: file.name,
        fields: [{ name: 'description', label: 'Description (optional)', full: true, placeholder: 'What is this file?' }],
        onSubmit: async (v) => { await App.api('attachments.add', { batch_id: ctx.id, entity_type: 'batch', entity_id: ctx.id, file, description: v.description }); App.toast('File attached & hashed.', 'ok'); ctx.reload(); },
      });
    });
  }
  function fmtBytes(n) {
    if (n == null) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  /* ---- Sign-off ---- */
  function tabSignoff(body, ctx) {
    const d = ctx.data;
    const u = App.state.user;
    const canApprove = u.role === 'qa' || u.role === 'admin';

    body.appendChild(h('div.banner.info', { style: { marginBottom: '18px' } }, icon('lock', 16),
      h('div',
        h('div', { style: { fontWeight: 600, marginBottom: '2px' } }, 'Electronic signatures (21 CFR Part 11 style)'),
        h('div', 'Each signature re-authenticates you with your password and records its meaning, the signer, a timestamp, and a cryptographic hash of the record at the moment of signing.'))));

    body.appendChild(h('div.btn-row', { style: { marginBottom: canApprove ? '20px' : '8px' } },
      signBtn('authored', 'Author', 'I confirm I authored / performed this record.', ctx, false, false),
      signBtn('reviewed', 'Review', 'I have reviewed this record.', ctx, false, false),
      canApprove ? signBtn('approved', 'Approve', 'I approve this record.', ctx, true, false) : null,
      canApprove ? signBtn('released', 'Release', 'I authorize release of this lot.', ctx, true, false) : null,
      canApprove ? signBtn('rejected', 'Reject', 'I reject this lot.', ctx, false, true) : null));

    if (!canApprove) {
      body.appendChild(h('div.muted', { style: { fontSize: '12px', marginBottom: '18px' } },
        'Approve, release and reject signatures are restricted to QA and administrators.'));
    }

    body.appendChild(ui.panel({
      title: 'Signatures on this record', icon: 'pen', flush: true,
      body: d.signatures.length
        ? h('div', { style: { padding: '14px 16px' } }, d.signatures.map(sigCard))
        : App.empty('No signatures yet.', 'pen'),
    }));
  }
  function signBtn(meaning, label, statement, ctx, primary, danger) {
    const cls = 'button.btn' + (primary ? '.primary' : '') + (danger ? '.danger' : '');
    return h(cls, {
      onClick: () => App.signModal({
        title: label + ' — electronic signature', statement,
        onSign: async ({ password, comment }) => {
          await App.api('signatures.sign', { entity_type: 'batch', entity_id: ctx.id, meaning, password, comment });
          App.toast('Signature applied.', 'ok');
          ctx.reload();
        },
      }),
    }, icon('pen', 14), label);
  }
  function sigCard(s) {
    return h('div.sig-card',
      h('div.sig-seal', icon('check', 18)),
      h('div.sig-meta',
        h('div.m1', (s.statement || fmt.title(s.meaning)) + ' — ' + s.full_name),
        h('div.m2', '@' + s.username + ' · ' + s.role + ' · ' + fmt.dt(s.signed_at) + (s.comment ? ' · “' + s.comment + '”' : ''))),
      h('div.sig-hash', 'record hash', h('div', (s.record_hash || '').slice(0, 20) + '…')));
  }

  /* ---- Audit (batch-level) ---- */
  function tabAudit(body, ctx) {
    (async () => {
      try {
        const rows = await App.api('audit.list', { entity_id: ctx.id, limit: 300 });
        body.appendChild(h('div.banner.info', { style: { marginBottom: '16px' } }, icon('shield', 16),
          h('div', 'Batch-level audit entries. Changes to individual sub-records (readings, tests, materials) also appear in the global Audit Trail.')));
        body.appendChild(ui.panel({ flush: true, body: App.auditTable(rows) }));
      } catch (e) { body.appendChild(h('div.banner.warn', icon('alert', 16), e.message)); }
    })();
  }

  /* ---------------- helpers ---------------- */
  function dateOnly(s) { return s ? String(s).slice(0, 10) : ''; }
  function dateRange(a, b) {
    if (!a && !b) return '—';
    return (a ? fmt.date(a) : '…') + (b ? ' → ' + fmt.date(b) : (a ? ' →' : ''));
  }
  function densRange(a, b) {
    if (!a && !b) return '—';
    return (a || '…') + (b ? ' → ' + b : '');
  }

  /* ---------------- print-only batch record ---------------- */
  function printBlock(data) {
    const b = data.batch;
    const B = App.BRAND;
    const wrap = h('div', { id: 'print-only' });
    // institutional brand bar
    wrap.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' } },
      h('img', { src: B.udciLogo, style: { height: '36px', width: 'auto' } }),
      h('div',
        h('div', { style: { fontSize: '13px', fontWeight: '700', color: '#1a2b4a' } }, B.initiative),
        h('div', { style: { fontSize: '10px', color: '#555' } }, B.center + ' · ' + B.suite + ' ' + B.version)),
      h('div', { style: { marginLeft: 'auto' } }, h('img', { src: B.sunyLogo, style: { height: '42px', width: 'auto' } }))));
    wrap.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', borderBottom: '2px solid #333', paddingBottom: '8px' } },
      h('div',
        h('div', { style: { fontSize: '17px', fontWeight: '700' } }, 'Manufacturing Batch Record'),
        h('div', { style: { fontFamily: 'monospace', fontSize: '13px', marginTop: '3px' } }, b.lot_number)),
      h('div', { style: { textAlign: 'right', fontSize: '11px', color: '#444' } },
        h('div', b.product_name),
        h('div', b.site || ''),
        h('div', 'Printed ' + new Date().toLocaleString()))));

    wrap.appendChild(printKv([
      ['Donor source', fmt.title(b.donor_type)],
      ['Donor / subject ID', b.donor_id || '—'],
      ['iPSC line', b.cell_line || '—'],
      ['Protocol / SOP', b.protocol_ref || '—'],
      ['Target dose', b.target_dose || '—'],
      ['Status', fmt.title(b.status)],
      ['Production start', fmt.dt(b.started_at)],
      ['Completion', b.completed_at ? fmt.dt(b.completed_at) : '—'],
    ]));

    printSection(wrap, 'Differentiation stages', data.stages, ['Stage', 'Name', 'Start', 'End', 'Viab %', 'Status'],
      (s) => [s.stage_code, s.stage_name, fmt.date(s.start_date), fmt.date(s.end_date), s.viability_pct == null ? '—' : s.viability_pct, s.status || '—']);
    printSection(wrap, 'Quality control', data.qc, ['Category', 'Test', 'Result', 'Value', 'Specification'],
      (q) => [q.category, q.test_name, q.result || '—', valueUnit(q), specText(q)]);
    printSection(wrap, 'Materials', data.materials, ['Material', 'Vendor', 'Lot #', 'Expiry', 'GMP'],
      (m) => [m.material_name, m.vendor || '—', m.lot_no || '—', m.expiry_date ? fmt.date(m.expiry_date) : '—', m.gmp_grade ? 'Yes' : '—']);
    printSection(wrap, 'Deviations', data.deviations, ['Ref', 'Title', 'Class', 'Status'],
      (dev) => [dev.deviation_no || '—', dev.title, dev.classification, dev.status]);

    wrap.appendChild(h('div', { style: { fontSize: '13px', fontWeight: 700, margin: '16px 0 6px' } }, 'Signatures'));
    if (data.signatures.length) {
      data.signatures.forEach((s) => wrap.appendChild(h('div', { style: { fontSize: '12px', marginBottom: '4px' } },
        (s.statement || fmt.title(s.meaning)) + ' — ' + s.full_name + ' (@' + s.username + ', ' + s.role + ') · ' + fmt.dt(s.signed_at) + ' · hash ' + (s.record_hash || '').slice(0, 16) + '…')));
    } else {
      wrap.appendChild(h('div', { style: { fontSize: '12px', color: '#666' } }, 'No signatures recorded.'));
    }
    return wrap;
  }
  function printKv(pairs) {
    return h('table', { style: { width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginBottom: '8px' } },
      h('tbody', pairs.map(([k, v]) => h('tr',
        h('td', { style: { padding: '2px 8px 2px 0', color: '#555', width: '160px', verticalAlign: 'top' } }, k),
        h('td', { style: { padding: '2px 0' } }, String(v))))));
  }
  function printSection(wrap, title, rows, head, mapRow) {
    wrap.appendChild(h('div', { style: { fontSize: '13px', fontWeight: 700, margin: '14px 0 6px' } }, title));
    if (!rows || !rows.length) { wrap.appendChild(h('div', { style: { fontSize: '12px', color: '#666' } }, 'None recorded.')); return; }
    wrap.appendChild(h('table', { style: { width: '100%', fontSize: '11px', borderCollapse: 'collapse' } },
      h('thead', h('tr', head.map((x) => h('td', { style: { textAlign: 'left', borderBottom: '1px solid #999', padding: '3px 6px', fontWeight: 700 } }, x)))),
      h('tbody', rows.map((r) => h('tr', mapRow(r).map((c) => h('td', { style: { borderBottom: '1px solid #ddd', padding: '3px 6px' } }, String(c))))))));
  }
})();
