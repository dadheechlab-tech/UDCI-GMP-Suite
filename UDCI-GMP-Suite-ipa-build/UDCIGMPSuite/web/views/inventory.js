'use strict';

/* =========================================================================
   Inventory & repository — chemicals, growth factors, media, reagents, kits.
   Tracks lot, vendor, quantity on hand, storage, expiry, CoA, and a purchase
   history per item.
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, fmt = App.fmt, ui = App.ui, td = App.ui.td;
  let catFilter = 'all', statusFilter = 'all';

  const CATEGORIES = [
    { value: 'chemical', label: 'Chemical' },
    { value: 'small_molecule', label: 'Small molecule' },
    { value: 'growth_factor', label: 'Growth factor / cytokine' },
    { value: 'media', label: 'Media' },
    { value: 'matrix', label: 'Matrix / scaffold' },
    { value: 'reagent', label: 'Reagent' },
    { value: 'antibody', label: 'Antibody' },
    { value: 'enzyme', label: 'Enzyme' },
    { value: 'kit', label: 'Kit / assay' },
    { value: 'consumable', label: 'Consumable' },
  ];
  const TEMPS = [
    { value: 'RT', label: 'Room temp' }, { value: '4C', label: '4 °C' },
    { value: '-20C', label: '−20 °C' }, { value: '-80C', label: '−80 °C' },
    { value: '-150C', label: '−150 °C' }, { value: 'LN2', label: 'Liquid N₂' },
  ];
  const STATUSES = ['in_stock', 'low', 'out', 'expired', 'quarantine', 'discarded'];

  App.views.inventory = async function (root) {
    const items = await App.api('inventory.list', { category: catFilter, status: statusFilter });

    const catSel = selectFilter([{ value: 'all', label: 'All categories' }, ...CATEGORIES], catFilter, (v) => { catFilter = v; App.go('inventory'); });
    const statusSel = selectFilter([{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: fmt.title(s) }))], statusFilter, (v) => { statusFilter = v; App.go('inventory'); });

    root.appendChild(h('div.page-head',
      h('div', h('h1', 'Inventory & repository'),
        h('div.sub', items.length + ' item' + (items.length === 1 ? '' : 's') + ' · chemicals, growth factors, reagents & kits')),
      h('div.grow'), catSel, statusSel,
      h('button.btn.primary', { onClick: () => itemForm(null) }, icon('plus', 16), 'Add item')));

    root.appendChild(ui.panel({
      flush: true,
      body: ui.table({
        head: ['Material', 'Category', 'Vendor', 'Catalog #', 'Lot #', { label: 'On hand', cls: 'num' }, 'Storage', 'Expiry', { label: 'Status' }, { label: '', cls: 'actions' }],
        rows: items,
        empty: 'No inventory yet. Add chemicals, growth factors, media and reagents — with lot and CoA — to build the repository.',
        emptyIcon: 'flask',
        render: (it) => ({
          onClick: () => itemDetail(it.id),
          cells: [
            td(h('div', h('span', { style: { fontWeight: 600 } }, it.name), it.cas_no ? h('div', { style: { fontSize: '11px', color: 'var(--muted)' } }, 'CAS ' + it.cas_no) : null)),
            fmt.title(it.category),
            it.vendor || '—',
            td(it.catalog_no || '—', 'mono'),
            td(it.lot_no || '—', 'mono'),
            td(qtyText(it), 'num'),
            td(it.storage_temp || '—'),
            td(expiryText(it), 'mono'),
            statusChip(it),
            td(h('div', { style: { display: 'flex', gap: '4px', justifyContent: 'flex-end' } },
              ui.iconBtn('plus', () => adjust(it, +1), 'Restock'),
              ui.iconBtn('edit', () => itemForm(it), 'Edit'),
              ui.iconBtn('trash', () => ui.confirmDelete('item', async (reason) => { await App.api('inventory.delete', { id: it.id, reason }); App.go('inventory'); }), 'Delete', true)), 'actions'),
          ],
        }),
      }),
    }));
  };

  function qtyText(it) { if (it.quantity == null) return '—'; return fmt.num(it.quantity) + (it.unit ? ' ' + it.unit : ''); }
  function expiryText(it) { if (!it.expiry_date) return '—'; return fmt.date(it.expiry_date); }
  function statusChip(it) {
    let s = it.status || 'in_stock';
    if (it._expired && s !== 'discarded') s = 'expired';
    else if (it._low && s === 'in_stock') s = 'low';
    return h('span.chip.' + s, fmt.title(s));
  }

  function selectFilter(options, current, onChange) {
    const sel = h('select', { style: { width: 'auto', minWidth: '150px' } }, options.map((o) => {
      const el = h('option', { value: o.value }, o.label); if (o.value === current) el.selected = true; return el;
    }));
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  function adjust(it, sign) {
    App.formModal({
      title: (sign > 0 ? 'Restock' : 'Consume') + ' — ' + it.name, submitLabel: 'Apply',
      fields: [
        { name: 'amount', label: 'Amount (' + (it.unit || 'units') + ')', type: 'number', step: 'any', required: true },
        { name: 'reason', label: 'Reason / note', full: true, placeholder: sign > 0 ? 'e.g. new lot received' : 'e.g. used in run' },
      ],
      onSubmit: async (v) => { await App.api('inventory.adjustQty', { id: it.id, delta: sign * Math.abs(Number(v.amount)), reason: v.reason }); App.toast('Quantity updated.', 'ok'); App.go('inventory'); },
    });
  }

  function itemForm(it) {
    const editing = !!it;
    const fields = [
      { name: 'name', label: 'Material name', required: true, full: true, value: editing ? it.name : '', placeholder: 'e.g. Activin A, Y-27632, mTeSR Plus' },
      { name: 'category', label: 'Category', type: 'select', options: CATEGORIES, value: editing ? it.category : 'reagent' },
      { name: 'grade', label: 'Grade', value: editing ? it.grade : '', placeholder: 'GMP | clinical | research' },
      { name: 'vendor', label: 'Vendor', value: editing ? it.vendor : '' },
      { name: 'catalog_no', label: 'Catalog #', mono: true, value: editing ? it.catalog_no : '' },
      { name: 'lot_no', label: 'Lot #', mono: true, value: editing ? it.lot_no : '' },
      { name: 'cas_no', label: 'CAS # (chemicals)', mono: true, value: editing ? it.cas_no : '' },
      { name: 'quantity', label: 'Quantity on hand', type: 'number', step: 'any', value: editing ? it.quantity : null },
      { name: 'unit', label: 'Unit', value: editing ? it.unit : '', placeholder: 'mg, mL, vials, µg' },
      { name: 'reorder_level', label: 'Reorder level (low-stock at)', type: 'number', step: 'any', value: editing ? it.reorder_level : null },
      { name: 'location', label: 'Location', value: editing ? it.location : '', placeholder: 'cabinet / shelf / freezer' },
      { name: 'storage_temp', label: 'Storage temp', type: 'select', options: [{ value: '', label: '—' }, ...TEMPS], value: editing ? it.storage_temp : '' },
      { name: 'received_date', label: 'Received date', type: 'date', value: editing ? dOnly(it.received_date) : '' },
      { name: 'expiry_date', label: 'Expiry date', type: 'date', value: editing ? dOnly(it.expiry_date) : '' },
      { name: 'coa_ref', label: 'CoA reference', mono: true, value: editing ? it.coa_ref : '' },
      { name: 'hazard', label: 'Hazard / handling', value: editing ? it.hazard : '', placeholder: 'GHS class, PPE…' },
      { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => ({ value: s, label: fmt.title(s) })), value: editing ? it.status : 'in_stock' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, value: editing ? it.notes : '' },
    ];
    if (editing) fields.push({ name: '__reason', label: 'Reason for change', full: true, placeholder: 'Recorded in audit trail' });
    App.formModal({
      title: editing ? 'Edit inventory item' : 'Add inventory item', submitLabel: editing ? 'Save changes' : 'Add item', wide: true, fields,
      onSubmit: async (v) => {
        if (editing) { const reason = v.__reason; delete v.__reason; await App.api('inventory.update', { id: it.id, changes: v, reason }); App.toast('Item updated.', 'ok'); }
        else { await App.api('inventory.create', v); App.toast('Item added to inventory.', 'ok'); }
        App.go('inventory');
      },
    });
  }

  async function itemDetail(id) {
    let data;
    try { data = await App.api('inventory.get', { id }); } catch (e) { App.toast(e.message, 'err'); return; }
    const it = data.item;
    const body = h('div',
      ui.kv([
        ['Material', it.name], ['Category', fmt.title(it.category)], ['Grade', it.grade],
        ['Vendor', it.vendor], ['Catalog #', it.catalog_no, true], ['Lot #', it.lot_no, true],
        ['CAS #', it.cas_no, true], ['On hand', qtyText(it), true], ['Reorder at', it.reorder_level, true],
        ['Location', it.location], ['Storage', it.storage_temp], ['Received', fmt.date(it.received_date), true],
        ['Expiry', fmt.date(it.expiry_date), true], ['CoA', it.coa_ref, true], ['Hazard', it.hazard],
      ]),
      it.notes ? h('div', { style: { marginTop: '12px', fontSize: '13px', whiteSpace: 'pre-wrap' } }, it.notes) : null,
      h('div', { style: { height: '16px' } }),
      purchasesPanel(it, data.purchases, () => itemDetail(id)),
      h('div', { style: { height: '16px' } }),
      ui.attachmentsPanel('inventory', id, data.attachments, () => itemDetail(id)));
    // re-open as a wide modal
    App.closeModal();
    App.modal({ title: it.name + ' — item record', body, wide: true });
  }

  function purchasesPanel(it, purchases, reload) {
    const add = () => App.formModal({
      title: 'Record purchase — ' + it.name, submitLabel: 'Add purchase', wide: true,
      fields: [
        { name: 'po_number', label: 'PO number', mono: true },
        { name: 'vendor', label: 'Vendor', value: it.vendor || '' },
        { name: 'catalog_no', label: 'Catalog #', mono: true, value: it.catalog_no || '' },
        { name: 'lot_no', label: 'Lot #', mono: true },
        { name: 'quantity', label: 'Quantity', type: 'number', step: 'any' },
        { name: 'unit', label: 'Unit', value: it.unit || '' },
        { name: 'unit_price', label: 'Unit price', type: 'number', step: 'any' },
        { name: 'total_cost', label: 'Total cost', type: 'number', step: 'any' },
        { name: 'currency', label: 'Currency', value: 'USD' },
        { name: 'ordered_date', label: 'Ordered', type: 'date' },
        { name: 'received_date', label: 'Received', type: 'date' },
        { name: 'received_by', label: 'Received by' },
        { name: 'status', label: 'Status', type: 'select', options: ['ordered', 'received', 'backordered', 'cancelled'].map((s) => ({ value: s, label: fmt.title(s) })), value: 'received' },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true },
      ],
      onSubmit: async (v) => { await App.api('purchases.add', { item_id: it.id, item_name: it.name, ...v }); App.toast('Purchase recorded.', 'ok'); reload(); },
    });
    return ui.panel({
      title: 'Purchase history', icon: 'package',
      actions: h('button.btn.sm.primary', { onClick: add }, icon('plus', 14), 'Record purchase'),
      flush: true,
      body: ui.table({
        head: ['PO #', 'Vendor', 'Lot #', { label: 'Qty', cls: 'num' }, { label: 'Cost', cls: 'num' }, 'Ordered', 'Received', { label: 'Status' }, { label: '', cls: 'actions' }],
        rows: purchases, empty: 'No purchases recorded for this item.', emptyIcon: 'package',
        render: (p) => ({
          cells: [
            td(p.po_number || '—', 'mono'), p.vendor || '—', td(p.lot_no || '—', 'mono'),
            td(p.quantity != null ? fmt.num(p.quantity) + (p.unit ? ' ' + p.unit : '') : '—', 'num'),
            td(p.total_cost != null ? (p.currency || '') + ' ' + fmt.num(p.total_cost) : '—', 'num'),
            td(fmt.date(p.ordered_date), 'mono'), td(fmt.date(p.received_date), 'mono'),
            App.chip(p.status || 'ordered'),
            td(ui.iconBtn('trash', () => ui.confirmDelete('purchase', async (reason) => { await App.api('purchases.delete', { id: p.id, reason }); reload(); }), 'Delete', true), 'actions'),
          ],
        }),
      }),
    });
  }

  function dOnly(s) { return s ? String(s).slice(0, 10) : ''; }
})();
