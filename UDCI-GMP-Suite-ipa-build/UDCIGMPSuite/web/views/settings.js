'use strict';

/* =========================================================================
   Settings (iOS) — identity, access domain, on-device data backup/restore,
   system info, and compliance posture.
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, ui = App.ui, B = App.BRAND;

  App.views.settings = async function (root) {
    const info = await App.api('system.info');
    const isAdmin = App.state.user.role === 'admin';

    root.appendChild(h('div.page-head',
      h('div', h('h1', 'Settings'), h('div.sub', 'Identity, access, data & system')),
      h('div.grow')));

    // ---- identity ----
    root.appendChild(ui.panel({
      title: 'Software identity', icon: 'info',
      body: h('div.identity-row',
        h('img.identity-logo', { src: B.udciLogo, alt: B.initiative }),
        h('div.identity-text',
          h('div.i1', B.suite + ' ' + B.version + ' · iPad'),
          h('div.i2', B.initiative + ' (' + B.initiativeAbbr + ')'),
          h('div.i2', B.center),
          h('div.i3', B.org)),
        h('img.identity-logo.suny', { src: B.sunyLogo, alt: B.center })),
    }));
    root.appendChild(gap());

    // ---- access / email (admin) ----
    if (isAdmin) { root.appendChild(await accessPanel()); root.appendChild(gap()); }

    // ---- data + system ----
    root.appendChild(h('div.grid', { style: { gridTemplateColumns: '1fr 1fr', gap: '16px' } },
      ui.panel({
        title: 'Data & backup', icon: 'download',
        body: h('div',
          h('p', { style: { fontSize: '13px', color: 'var(--ink-2)', marginTop: 0, lineHeight: 1.55 } },
            'All records — batches, inventory, samples, assays, users and the audit trail — are stored on this device. Export a backup regularly; it includes attached files and can be restored here or imported into another device.'),
          h('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap' } },
            h('button.btn.primary', { onClick: backup }, icon('download', 15), 'Export backup'),
            h('button.btn', { onClick: restore }, icon('refresh', 15), 'Import / restore')),
          h('div.banner.info', { style: { marginTop: '16px' } }, icon('info', 16),
            h('div', h('div', { style: { fontWeight: 600, marginBottom: '2px' } }, 'On-device storage'),
              h('div.mono-sm', info.dbPath),
              h('div', { style: { fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' } },
                'This iPad app is a companion to the desktop Suite — its records live only on this device unless you export and hand them over.')))),
      }),
      ui.panel({
        title: 'System', icon: 'settings',
        body: ui.kv([
          ['Application', info.app], ['Version', info.version, true],
          ['Batches', String(info.counts.batches), true],
          ['Inventory items', String(info.counts.inventory), true],
          ['Samples', String(info.counts.samples), true],
          ['Assays', String(info.counts.assays), true],
          ['Users', String(info.counts.users), true],
          ['Audit entries', String(info.counts.audit), true],
          ['Runtime', info.electron, true],
          ['Device', info.platform, true],
        ]),
      })));
    root.appendChild(gap());

    // ---- compliance ----
    root.appendChild(ui.panel({
      title: 'Compliance posture', icon: 'shield',
      body: h('div', { style: { fontSize: '13px', color: 'var(--ink-2)', lineHeight: 1.6 } },
        h('p', { style: { marginTop: 0 } },
          'Supports 21 CFR Part 11 expectations: authorised email-based accounts, role-based permissions, password-authenticated electronic signatures with recorded meaning, an append-only tamper-evident audit trail, and record hashing at the moment of signing.'),
        h('p', { style: { marginBottom: 0 } },
          h('b', { style: { color: 'var(--amber)' } }, 'Validation note: '),
          'The desktop Suite is the intended system of record; this device app is a companion for capture and reference. Before use in GxP / IND-supporting manufacturing, the deployment must be formally validated (IQ/OQ/PQ) under your quality system.')),
    }));
  };

  async function accessPanel() {
    let cfg; try { cfg = await App.api('settings.getEmailConfig'); } catch (e) { return h('div'); }
    const domain = h('input', { value: cfg.domain || 'upstate.edu', placeholder: 'upstate.edu' });
    const err = h('div', { style: { display: 'none' } });
    const save = h('button.btn.primary', icon('check', 15), 'Save');
    save.addEventListener('click', async () => {
      hide(err);
      try { await App.api('settings.setEmailConfig', { domain: domain.value.trim() }); App.toast('Saved.', 'ok'); App.go('settings'); }
      catch (e) { showErr(err, e.message); }
    });
    return ui.panel({
      title: 'Access & sign-in', icon: 'mail',
      body: h('div',
        h('div.banner.info', { style: { marginBottom: '16px' } }, icon('info', 16),
          h('div', 'Sign-in is by institutional email. On this device, users authenticate with email + password. Emailed one-time-code verification (over the internet) is handled by the desktop Suite, which has the mail-server connection.')),
        err,
        h('div.field', { style: { maxWidth: '320px' } },
          h('label', 'Restrict new accounts to domain'), domain,
          h('div.hint', 'New users added here must use an email on this domain (an admin can override per user).')),
        h('div', { style: { marginTop: '14px' } }, save)),
    });
  }

  function gap() { return h('div', { style: { height: '16px' } }); }
  function showErr(box, m) { box.innerHTML = ''; box.appendChild(h('div.banner.warn', { style: { marginBottom: '14px' } }, icon('alert', 17), m)); box.style.display = 'block'; }
  function hide(box) { box.style.display = 'none'; }

  async function backup() {
    try { const r = await App.api('system.backup'); if (r && r.ok) App.toast('Backup exported: ' + r.path, 'ok'); }
    catch (e) { App.toast(e.message, 'err'); }
  }

  function restore() {
    App.pickFile(async (file) => {
      const ok = await App.confirm({
        title: 'Restore from backup',
        message: 'This REPLACES all records currently on this device with the contents of “' + file.name + '”. You will be signed out. Continue?',
        confirmLabel: 'Replace & restore', danger: true,
      });
      if (!ok) return;
      try {
        const r = await App.api('system.restore', { file });
        App.toast('Restored ' + r.counts.batches + ' batches, ' + r.counts.samples + ' samples.', 'ok');
        App.state.user = null; App.render();
      } catch (e) { App.toast(e.message, 'err'); }
    }, 'application/json,.json');
  }
})();
