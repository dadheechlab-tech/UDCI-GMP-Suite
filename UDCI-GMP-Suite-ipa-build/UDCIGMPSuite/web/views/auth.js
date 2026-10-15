'use strict';

/* =========================================================================
   Authentication — email-based sign-in for authorised users.
   States: pick/enter email + password  ->  (activate if pending)
                                         ->  (emailed code if email-verification on)
   ========================================================================= */
(function () {
  const h = App.h, icon = App.icon, B = App.BRAND;

  App.views.auth = function () {
    const slot = h('div');
    const card = h('div.auth-card',
      brandHeader(),
      slot);
    const wrap = h('div.auth-wrap', card, footer());

    slot.appendChild(h('div.auth-loading', 'Loading…'));
    App.api('auth.status').then((st) => {
      slot.innerHTML = '';
      if (!st.hasUsers) { slot.appendChild(fallbackSetup()); return; }
      slot.appendChild(signIn(st));
    }).catch((err) => {
      slot.innerHTML = '';
      slot.appendChild(h('div.banner.warn', icon('alert', 17), err.message));
    });
    return wrap;
  };

  function brandHeader() {
    return h('div.auth-brand',
      h('div.auth-logos',
        h('img.auth-logo', { src: B.udciLogo, alt: B.initiative }),
        h('div.auth-logo-divider'),
        h('img.auth-logo.suny', { src: B.sunyLogo, alt: B.center })),
      h('div.auth-title', B.suite, h('span.ver', ' ' + B.version)),
      h('div.auth-sub-org', B.initiative + ' · ' + B.center));
  }

  function footer() {
    return h('div.auth-footer', B.org + ' · GMP Manufacturing Suite ' + B.version);
  }

  /* ---------------- sign in ---------------- */
  function signIn(st) {
    const email = h('input', { type: 'email', placeholder: 'name@upstate.edu', autocomplete: 'username' });
    const pw = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
    const err = h('div', { style: { display: 'none' } });
    const btn = h('button.btn.primary.block', 'Sign in');

    // quick-pick authorised users
    const picker = st.accounts && st.accounts.length
      ? h('div.acct-list', st.accounts.map((a) =>
          h('button.acct' + (a.pending ? '.pending' : ''), { type: 'button', onClick: () => { email.value = a.email; pw.focus(); } },
            h('div.acct-av', App.fmt.initials(a.full_name)),
            h('div.acct-meta', h('div.an', a.full_name), h('div.ae', a.email)),
            a.pending ? h('span.chip.pending', 'Activate') : null)))
      : null;

    async function submit() {
      hide(err);
      if (!email.value || !pw.value) return showErr(err, 'Enter your email and password.');
      btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const r = await App.api('auth.login', { email: email.value.trim(), password: pw.value });
        if (r.pending) { renderActivate(r.email, st.emailAuth); return; }
        if (r.mfa) { renderCode(r.email); return; }
        App.state.user = r.user; App.render();
      } catch (e) { showErr(err, e.message); btn.disabled = false; btn.textContent = 'Sign in'; }
    }
    btn.addEventListener('click', submit);
    [email, pw].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
    setTimeout(() => email.focus(), 60);

    function renderActivate(em, emailAuth) { swap(activateForm(em, emailAuth)); }
    function renderCode(em) { swap(codeForm(em)); }
    function swap(node) { const host = btn.closest('.auth-card').querySelector('.auth-slot') || err.parentNode; host.innerHTML = ''; host.appendChild(node); }

    return h('div.auth-slot',
      h('h2', 'Sign in'),
      h('p.auth-sub', 'Authorised users only. Sign in with your institutional email.'),
      err,
      picker ? h('div.field', { style: { marginBottom: '14px' } }, h('label', 'Authorised users'), picker) : null,
      h('div.field', { style: { marginBottom: '12px' } }, h('label', 'Email'), email),
      h('div.field', { style: { marginBottom: '18px' } }, h('label', 'Password'), pw),
      btn,
      st.emailAuth
        ? h('div.auth-note', icon('mail', 14), 'Email verification is ON — a one-time code will be sent to your inbox.')
        : null);
  }

  /* ---------------- activate a pending account ---------------- */
  function activateForm(em, emailAuth) {
    const codeField = emailAuth ? h('input', { placeholder: '6-digit code from email', maxlength: '6', class: 'mono' }) : null;
    const p1 = h('input', { type: 'password', placeholder: 'Choose a password (min 8 chars)', autocomplete: 'new-password' });
    const p2 = h('input', { type: 'password', placeholder: 'Re-enter password', autocomplete: 'new-password' });
    const err = h('div', { style: { display: 'none' } });
    const btn = h('button.btn.primary.block', 'Activate & sign in');
    let sent = false;

    async function sendCode() {
      try { await App.api('auth.requestCode', { email: em, purpose: 'activation' }); sent = true; App.toast('Code sent to ' + em, 'ok'); }
      catch (e) { showErr(err, e.message); }
    }
    if (emailAuth) sendCode();

    async function submit() {
      hide(err);
      if (emailAuth && !codeField.value) return showErr(err, 'Enter the code emailed to you.');
      if (p1.value.length < 8) return showErr(err, 'Password must be at least 8 characters.');
      if (p1.value !== p2.value) return showErr(err, 'Passwords do not match.');
      btn.disabled = true; btn.textContent = 'Activating…';
      try {
        const r = await App.api('auth.activate', { email: em, password: p1.value, confirm: p2.value, code: codeField ? codeField.value.trim() : undefined });
        App.toast('Welcome — your account is active.', 'ok');
        App.state.user = r.user; App.render();
      } catch (e) { showErr(err, e.message); btn.disabled = false; btn.textContent = 'Activate & sign in'; }
    }
    btn.addEventListener('click', submit);

    return h('div.auth-slot',
      h('button.btn.ghost.sm', { onClick: () => App.render() }, icon('back', 14), 'Back'),
      h('h2', { style: { marginTop: '10px' } }, 'Activate your account'),
      h('p.auth-sub', 'First sign-in for ', h('b', em), '. Set a password to activate.'),
      err,
      emailAuth ? h('div.field', { style: { marginBottom: '12px' } },
        h('label', 'Email code', h('button.linkbtn', { type: 'button', onClick: sendCode }, 'resend')), codeField) : null,
      h('div.field', { style: { marginBottom: '12px' } }, h('label', 'New password'), p1),
      h('div.field', { style: { marginBottom: '18px' } }, h('label', 'Confirm password'), p2),
      btn);
  }

  /* ---------------- emailed one-time code (2-step login) ---------------- */
  function codeForm(em) {
    const code = h('input', { placeholder: '6-digit code', maxlength: '6', class: 'mono', inputmode: 'numeric' });
    const err = h('div', { style: { display: 'none' } });
    const btn = h('button.btn.primary.block', 'Verify & sign in');

    async function submit() {
      hide(err);
      if (!code.value) return showErr(err, 'Enter the code sent to your email.');
      btn.disabled = true; btn.textContent = 'Verifying…';
      try {
        const r = await App.api('auth.verifyLoginCode', { email: em, code: code.value.trim() });
        App.state.user = r.user; App.render();
      } catch (e) { showErr(err, e.message); btn.disabled = false; btn.textContent = 'Verify & sign in'; }
    }
    async function resend() {
      try { await App.api('auth.requestCode', { email: em, purpose: 'login' }); App.toast('New code sent.', 'ok'); }
      catch (e) { showErr(err, e.message); }
    }
    btn.addEventListener('click', submit);
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => code.focus(), 60);

    return h('div.auth-slot',
      h('button.btn.ghost.sm', { onClick: () => App.render() }, icon('back', 14), 'Back'),
      h('div.banner.info', { style: { margin: '12px 0 16px' } }, icon('mail', 17),
        h('div', 'We emailed a one-time code to ', h('b', em), '. It expires in 10 minutes.')),
      err,
      h('div.field', { style: { marginBottom: '18px' } },
        h('label', 'Verification code', h('button.linkbtn', { type: 'button', onClick: resend }, 'resend')), code),
      btn);
  }

  /* ---------------- fallback (no users — should not occur after seeding) ---------------- */
  function fallbackSetup() {
    const fn = h('input', { placeholder: 'Full name' });
    const em = h('input', { type: 'email', placeholder: 'name@upstate.edu' });
    const p1 = h('input', { type: 'password', placeholder: 'Password (min 8)' });
    const err = h('div', { style: { display: 'none' } });
    const btn = h('button.btn.primary.block', 'Create administrator');
    async function submit() {
      hide(err);
      if (!fn.value || !em.value || p1.value.length < 8) return showErr(err, 'All fields required; password ≥ 8 chars.');
      btn.disabled = true;
      try {
        await App.api('users.create', { full_name: fn.value, email: em.value, role: 'admin', password: p1.value, allowExternal: true });
        const r = await App.api('auth.login', { email: em.value, password: p1.value });
        if (r.pending) { App.toast('Account created — set your password.', 'ok'); App.render(); return; }
        App.state.user = r.user || r; App.render();
      } catch (e) { showErr(err, e.message); btn.disabled = false; }
    }
    btn.addEventListener('click', submit);
    return h('div.auth-slot',
      h('h2', 'Set up administrator'),
      h('p.auth-sub', 'No accounts found. Create the first administrator.'),
      err,
      h('div.field', { style: { marginBottom: '12px' } }, h('label', 'Full name'), fn),
      h('div.field', { style: { marginBottom: '12px' } }, h('label', 'Email'), em),
      h('div.field', { style: { marginBottom: '18px' } }, h('label', 'Password'), p1),
      btn);
  }

  function showErr(box, msg) {
    box.innerHTML = '';
    box.appendChild(h('div.banner.warn', { style: { marginBottom: '16px' } }, icon('alert', 17), msg));
    box.style.display = 'block';
  }
  function hide(box) { box.style.display = 'none'; }
})();
