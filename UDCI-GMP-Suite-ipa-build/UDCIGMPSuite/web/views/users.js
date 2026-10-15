'use strict';

/* =========================================================================
   Team & access — administrator-only user management (email-based accounts).
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, fmt = App.fmt, ui = App.ui, td = App.ui.td;

  App.views.users = async function (root) {
    const users = await App.api('users.list');

    root.appendChild(h('div.page-head',
      h('div', h('h1', 'Team & access'),
        h('div.sub', users.length + ' authorised user' + (users.length === 1 ? '' : 's'))),
      h('div.grow'),
      h('button.btn.primary', { onClick: newUser }, icon('plus', 16), 'Add user')));

    root.appendChild(ui.panel({
      flush: true,
      body: ui.table({
        head: ['Name', 'Email', 'Title', 'Role', 'Status', { label: '', cls: 'actions' }],
        rows: users,
        empty: 'No users.', emptyIcon: 'users',
        render: (u) => ({
          cells: [
            h('span', { style: { fontWeight: 600 } }, u.full_name),
            td(u.email || '—', 'mono'),
            u.title || '—',
            App.chip(u.role, 'role'),
            statusCell(u),
            td(userActions(u), 'actions'),
          ],
        }),
      }),
    }));

    root.appendChild(h('div.banner.info', { style: { marginTop: '18px' } }, icon('info', 16),
      h('div', h('div', { style: { fontWeight: 600, marginBottom: '2px' } }, 'Roles & activation'),
        h('div', 'Operators record production. QA can additionally review, release and reject lots and apply approval signatures. Administrators have full access including user management and email settings. New users without a set password are "pending" — they choose their own password on first sign-in.'))));
  };

  function statusCell(u) {
    if (!u.active) return h('span.chip.rejected', 'Disabled');
    if (u.pending) return h('span.chip.pending', 'Pending activation');
    return h('span.chip.released', 'Active');
  }

  function userActions(u) {
    const me = App.state.user;
    const btns = [
      ui.iconBtn('edit', () => editUser(u), 'Edit'),
      ui.iconBtn('lock', () => resetPw(u), 'Reset / re-invite'),
    ];
    if (u.id !== me.id) btns.push(ui.iconBtn(u.active ? 'x' : 'check', () => toggleActive(u), u.active ? 'Disable account' : 'Enable account', u.active));
    return h('div', { style: { display: 'flex', gap: '4px', justifyContent: 'flex-end' } }, btns);
  }

  const ROLE_OPTS = [
    { value: 'operator', label: 'Operator — record production' },
    { value: 'qa', label: 'QA — review, release & reject' },
    { value: 'admin', label: 'Administrator — full access' },
  ];

  function newUser() {
    App.formModal({
      title: 'Add authorised user', submitLabel: 'Add user', wide: true,
      note: 'Leave password blank to send a pending invite (user sets it on first sign-in).',
      fields: [
        { name: 'full_name', label: 'Full name', required: true, full: true },
        { name: 'email', label: 'Institutional email', required: true, mono: true, placeholder: 'name@upstate.edu' },
        { name: 'title', label: 'Title / position', placeholder: 'e.g. Research Technician' },
        { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTS, value: 'operator' },
        { name: 'password', label: 'Temporary password (optional)', type: 'password', full: true, hint: 'At least 8 characters, or leave blank for a pending invite.' },
        { name: 'allowExternal', label: 'Allow non-institutional email domain', type: 'checkbox' },
      ],
      onSubmit: async (v) => {
        if (v.password === null) delete v.password;
        await App.api('users.create', v);
        App.toast('User added.', 'ok'); App.go('users');
      },
    });
  }

  function editUser(u) {
    App.formModal({
      title: 'Edit user — ' + u.full_name, submitLabel: 'Save changes',
      fields: [
        { name: 'full_name', label: 'Full name', required: true, full: true, value: u.full_name },
        { name: 'title', label: 'Title / position', value: u.title, full: true },
        { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTS, value: u.role },
        { name: '__reason', label: 'Reason for change', full: true, placeholder: 'Recorded in audit trail' },
      ],
      onSubmit: async (v) => {
        const reason = v.__reason; delete v.__reason;
        await App.api('users.update', { id: u.id, changes: v, reason });
        App.toast('User updated.', 'ok'); App.go('users');
      },
    });
  }

  function resetPw(u) {
    App.formModal({
      title: 'Reset access — ' + u.full_name, submitLabel: 'Apply',
      note: 'Set a temporary password, or tick re-invite to let them choose one on next sign-in.',
      fields: [
        { name: 'invite', label: 'Send pending invite (clear password)', type: 'checkbox' },
        { name: 'password', label: 'New temporary password', type: 'password', full: true, hint: 'Used only if "re-invite" is unticked. Min 8 characters.' },
      ],
      onSubmit: async (v) => {
        if (v.invite) await App.api('users.resetPassword', { id: u.id, invite: true });
        else await App.api('users.resetPassword', { id: u.id, password: v.password });
        App.toast('Access updated.', 'ok'); App.go('users');
      },
    });
  }

  async function toggleActive(u) {
    try {
      await App.api('users.setActive', { id: u.id, active: u.active ? 0 : 1 });
      App.toast('User ' + (u.active ? 'disabled' : 'enabled') + '.', 'ok'); App.go('users');
    } catch (e) { App.toast(e.message, 'err'); }
  }
})();
