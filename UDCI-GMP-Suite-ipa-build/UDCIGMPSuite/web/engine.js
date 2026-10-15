'use strict';
/* ===========================================================================
   UDCI GMP Manufacturing Suite — on-device engine (iOS / PWA)
   Reimplements the Electron main process, SQLite layer and security module
   entirely in the browser, exposing the SAME window.eln.call(method, payload)
   bridge the desktop renderer used — so every view runs unchanged.
   Storage: IndexedDB (relational data as JSON + attachment blobs).
   =========================================================================== */
(function () {
  // ---------------------------------------------------------------------------
  // Identity + seeded users (mirrors the desktop build)
  // ---------------------------------------------------------------------------
  const IDENTITY = {
    app: 'UDCI GMP Manufacturing Suite', suite: 'GMP Manufacturing Suite', version: '26.0',
    initiative: 'Upstate Diabetes Cure Initiative', center: 'SUNY Centre for Advanced Cell Therapy',
    org: 'SUNY Upstate Medical University',
  };
  const SEED_USERS = [
    { email: 'dadheecn@upstate.edu', full_name: 'Nidheesh Dadheech', role: 'admin', title: 'Principal Investigator' },
    { email: 'Tdelibasi@upstate.edu', full_name: 'Tuncay Delibasi', role: 'admin', title: 'Co-Investigator' },
    { email: 'CilekM@upstate.edu', full_name: 'Zeynel Cilek', role: 'operator', title: 'Postdoctoral Fellow' },
  ];

  // ---------------------------------------------------------------------------
  // Pure-JS SHA-256 (fallback when crypto.subtle is unavailable, e.g. file://)
  // ---------------------------------------------------------------------------
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function sha256Bytes(bytes) {
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length; const withOne = l + 1; const k = (56 - withOne % 64 + 64) % 64;
    const total = withOne + k + 8; const m = new Uint8Array(total); m.set(bytes); m[l] = 0x80;
    const bitLen = l * 8; const dv = new DataView(m.buffer);
    dv.setUint32(total - 4, bitLen >>> 0); dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < total; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t-15],7) ^ rotr(w[t-15],18) ^ (w[t-15] >>> 3);
        const s1 = rotr(w[t-2],17) ^ rotr(w[t-2],19) ^ (w[t-2] >>> 10);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    const out = new Uint8Array(32); const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i] >>> 0);
    return out;
  }
  function hmacSha256(keyBytes, msgBytes) {
    let k = keyBytes; if (k.length > 64) k = sha256Bytes(k);
    const kp = new Uint8Array(64); kp.set(k);
    const ip = new Uint8Array(64), op = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { ip[i] = kp[i] ^ 0x36; op[i] = kp[i] ^ 0x5c; }
    const inner = sha256Bytes(concat(ip, msgBytes));
    return sha256Bytes(concat(op, inner));
  }
  function pbkdf2Js(pwBytes, saltBytes, iters, dkLen) {
    const out = new Uint8Array(dkLen); let offset = 0, block = 1;
    while (offset < dkLen) {
      const bi = new Uint8Array(saltBytes.length + 4); bi.set(saltBytes);
      new DataView(bi.buffer).setUint32(saltBytes.length, block);
      let u = hmacSha256(pwBytes, bi); const t = u.slice();
      for (let i = 1; i < iters; i++) { u = hmacSha256(pwBytes, u); for (let j = 0; j < t.length; j++) t[j] ^= u[j]; }
      const take = Math.min(t.length, dkLen - offset); out.set(t.slice(0, take), offset);
      offset += take; block++;
    }
    return out;
  }
  function concat(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
  const enc = new TextEncoder();
  function toHex(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0'); return s; }
  function fromHex(hex) { const o = new Uint8Array(hex.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(hex.substr(i * 2, 2), 16); return o; }

  // crypto facade — prefers native subtle, falls back to JS
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  async function sha256Hex(data) {
    const bytes = typeof data === 'string' ? enc.encode(data) : new Uint8Array(data);
    if (subtle) { try { return toHex(new Uint8Array(await subtle.digest('SHA-256', bytes))); } catch (_) {} }
    return toHex(sha256Bytes(bytes));
  }
  const PBKDF2_ITERS = 60000;
  async function deriveKey(password, saltHex) {
    const salt = fromHex(saltHex); const pw = enc.encode(password);
    if (subtle) {
      try {
        const base = await subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
        const bits = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' }, base, 256);
        return toHex(new Uint8Array(bits));
      } catch (_) {}
    }
    return toHex(pbkdf2Js(pw, salt, PBKDF2_ITERS, 32));
  }
  function randomHex(n) { const b = new Uint8Array(n); (crypto.getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => b[i] = Math.floor(Math.random() * 256))); return toHex(b); }
  async function hashPassword(pw) { const salt = randomHex(16); const hash = await deriveKey(pw, salt); return { salt, hash }; }
  async function verifyPassword(pw, salt, hash) { if (!salt || !hash) return false; const h = await deriveKey(pw, salt); if (h.length !== hash.length) return false; let diff = 0; for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i); return diff === 0; }
  function canonicalize(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
    return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
  }
  function newId() { return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + randomHex(16)); }
  const nowISO = () => new Date().toISOString();

  // ---------------------------------------------------------------------------
  // IndexedDB persistence (relational JSON under 'db'; blobs keyed by id)
  // ---------------------------------------------------------------------------
  const DBNAME = 'udci_gmp_suite', KV = 'kv', BLOBS = 'blobs';
  let _idb = null;
  function openIDB() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DBNAME, 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV); if (!d.objectStoreNames.contains(BLOBS)) d.createObjectStore(BLOBS); };
      r.onsuccess = () => { _idb = r.result; res(_idb); };
      r.onerror = () => rej(r.error);
    });
  }
  function idbGet(store, key) { return openIDB().then((d) => new Promise((res, rej) => { const t = d.transaction(store, 'readonly').objectStore(store).get(key); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); })); }
  function idbPut(store, key, val) { return openIDB().then((d) => new Promise((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); })); }
  function idbDel(store, key) { return openIDB().then((d) => new Promise((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); })); }

  const TABLES = ['users', 'audit_log', 'batches', 'process_stages', 'bioreactor_runs', 'cell_counts', 'qc_tests', 'materials', 'deviations', 'attachments', 'signatures', 'inventory_items', 'purchases', 'samples', 'assays'];
  let DB = null; let settings = {}; let session = null; let ready = null;

  function blankDB() { const d = { settings: {} }; TABLES.forEach((t) => d[t] = []); return d; }
  let _saveTimer = null;
  function persist() { if (_saveTimer) clearTimeout(_saveTimer); _saveTimer = setTimeout(() => { idbPut(KV, 'db', DB).catch(() => {}); }, 120); }
  async function persistNow() { if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; } await idbPut(KV, 'db', DB).catch(() => {}); }

  // relational helpers
  function tbl(name) { return DB[name] || (DB[name] = []); }
  function insert(name, obj) { const row = { ...obj }; if (!row.id) row.id = newId(); tbl(name).push(row); return row.id; }
  function getRow(name, id) { return tbl(name).find((r) => r.id === id) || null; }
  function where(name, pred) { return tbl(name).filter(pred); }
  function updateRow(name, id, patch) { const r = getRow(name, id); if (r) Object.assign(r, patch); return r; }
  function removeRow(name, id) { const a = tbl(name); const i = a.findIndex((r) => r.id === id); if (i >= 0) a.splice(i, 1); }
  function audit(e) { tbl('audit_log').unshift({ id: newId(), ts: nowISO(), user_id: e.user_id || null, username: e.username || null, action: e.action, entity_type: e.entity_type || null, entity_id: e.entity_id || null, field: e.field || null, old_value: e.old_value == null ? null : String(e.old_value), new_value: e.new_value == null ? null : String(e.new_value), reason: e.reason || null, detail: e.detail || null }); }

  function getSetting(k, d) { return (DB.settings && DB.settings[k] != null) ? DB.settings[k] : (d == null ? null : d); }
  function setSetting(k, v) { DB.settings[k] = v == null ? null : String(v); }
  function emailAuthEnabled() { return false; } // no SMTP relay on-device (companion)
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }

  async function seedUsers() {
    if (tbl('users').length > 0) return;
    for (const s of SEED_USERS) {
      const uid = insert('users', { username: s.email.split('@')[0].toLowerCase(), full_name: s.full_name, email: s.email, title: s.title || null, role: s.role, salt: '', password_hash: '', active: 1, pending: 1, email_verified: 0, must_change: 0, created_at: nowISO(), created_by: 'system' });
      audit({ username: 'system', action: 'CREATE', entity_type: 'user', entity_id: uid, new_value: s.email, detail: 'seeded authorised user' });
    }
    await persistNow();
  }

  async function init() {
    DB = (await idbGet(KV, 'db').catch(() => null)) || blankDB();
    for (const t of TABLES) if (!Array.isArray(DB[t])) DB[t] = [];
    if (!DB.settings) DB.settings = {};
    await seedUsers();
  }
  ready = init();

  // auth helpers
  function requireUser() { if (!session) throw new Error('Not signed in.'); return session; }
  function requireRole(...roles) { const u = requireUser(); if (!roles.includes(u.role)) throw new Error('You do not have permission for this action.'); return u; }
  function publicUser(u) { return u ? { id: u.id, username: u.username, full_name: u.full_name, email: u.email || null, title: u.title || null, role: u.role, pending: !!u.pending } : null; }

  function auditedUpdate(table, type, id, changes, actor, reason) {
    const before = getRow(table, id); if (!before) throw new Error('Record not found.');
    const dirty = {};
    for (const [k, v] of Object.entries(changes)) { const nv = v === undefined ? null : v; if (String(before[k] ?? '') !== String(nv ?? '')) dirty[k] = nv; }
    if (!Object.keys(dirty).length) return before;
    updateRow(table, id, { ...dirty, updated_at: nowISO(), updated_by: actor.username });
    for (const [field, nv] of Object.entries(dirty)) audit({ user_id: actor.id, username: actor.username, action: 'UPDATE', entity_type: type, entity_id: id, field, old_value: before[field], new_value: nv, reason: reason || null });
    persist(); return getRow(table, id);
  }
  function addChild(table, type, payload, actor, label) {
    const id = insert(table, { ...payload, created_at: nowISO(), created_by: actor.username });
    audit({ user_id: actor.id, username: actor.username, action: 'CREATE', entity_type: type, entity_id: id, new_value: label || null, detail: payload.batch_id ? 'batch:' + payload.batch_id : null });
    persist(); return getRow(table, id);
  }
  function deleteChild(table, type, id, actor, reason) {
    if (!getRow(table, id)) return { ok: true };
    removeRow(table, id); audit({ user_id: actor.id, username: actor.username, action: 'DELETE', entity_type: type, entity_id: id, reason: reason || null }); persist(); return { ok: true };
  }
  function stripUi(obj) {
    const block = new Set(['reason', 'changes', 'allowExternal', 'invite', 'clearPassword', 'password', 'confirm', 'code', 'purpose', 'sourcePath', 'file', 'item', 'delta', 'n', 'to', 'enabled', 'host', 'port', 'secure', 'user', 'from', 'domain']);
    const out = {}; for (const [k, v] of Object.entries(obj || {})) { if (k.startsWith('__') || block.has(k)) continue; out[k] = v; } return out;
  }

  // native bridge (present only inside the Xcode/WKWebView wrapper)
  function nativeHandler(name) { try { return window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[name]; } catch (_) { return null; } }

  // file download helper — routes through the native share sheet when wrapped
  function download(filename, text, mime) {
    const h = nativeHandler('saveFile');
    if (h) { h.postMessage({ name: filename, text: String(text), mime: mime || 'application/json' }); return; }
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  async function blobToBase64(blob) { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]); return btoa(s); }
  function base64ToBlob(b64, type) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: type || 'application/octet-stream' }); }

  // ---------------------------------------------------------------------------
  // Handler map — identical method names + return shapes to the desktop build
  // ---------------------------------------------------------------------------
  const H = {
    // ---- auth ----
    async 'auth.status'() {
      const accounts = where('users', (u) => u.active && u.email).sort((a, b) => a.full_name.localeCompare(b.full_name)).map((a) => ({ full_name: a.full_name, email: a.email, title: a.title, pending: !!a.pending }));
      return { hasUsers: tbl('users').length > 0, signedIn: !!session, user: publicUser(session), emailAuth: emailAuthEnabled(), identity: IDENTITY, accounts };
    },
    async 'auth.login'(p) {
      const email = String(p.email || '').trim().toLowerCase();
      const u = tbl('users').find((x) => (x.email || '').toLowerCase() === email && x.active);
      if (!u) { audit({ username: email, action: 'LOGIN_FAIL', detail: 'unknown or inactive email' }); persist(); throw new Error('No active account for that email. Only authorised users can sign in.'); }
      if (u.pending || !u.password_hash) return { pending: true, email: u.email, full_name: u.full_name };
      if (!(await verifyPassword(p.password, u.salt, u.password_hash))) { audit({ user_id: u.id, username: u.username, action: 'LOGIN_FAIL', detail: 'bad password' }); persist(); throw new Error('Incorrect password.'); }
      session = u; audit({ user_id: u.id, username: u.username, action: 'LOGIN' }); persist(); return { user: publicUser(u) };
    },
    async 'auth.verifyLoginCode'() { throw new Error('Email verification is managed on the desktop Suite.'); },
    async 'auth.requestCode'() { throw new Error('Email verification is managed on the desktop Suite.'); },
    async 'auth.activate'(p) {
      const email = String(p.email || '').trim().toLowerCase();
      const u = tbl('users').find((x) => (x.email || '').toLowerCase() === email && x.active);
      if (!u) throw new Error('No active account for that email.');
      if (!u.pending && u.password_hash) throw new Error('This account is already active — just sign in.');
      if (String(p.password || '').length < 8) throw new Error('Password must be at least 8 characters.');
      if (p.password !== p.confirm) throw new Error('Passwords do not match.');
      const { salt, hash } = await hashPassword(p.password);
      updateRow('users', u.id, { salt, password_hash: hash, pending: 0, must_change: 0 });
      audit({ user_id: u.id, username: u.username, action: 'UPDATE', entity_type: 'user', entity_id: u.id, field: 'activation', detail: 'account activated' });
      audit({ user_id: u.id, username: u.username, action: 'LOGIN', detail: 'post-activation' });
      session = getRow('users', u.id); await persistNow(); return { user: publicUser(session) };
    },
    async 'auth.logout'() { if (session) { audit({ user_id: session.id, username: session.username, action: 'LOGOUT' }); persist(); } session = null; return { ok: true }; },
    async 'auth.me'() { return publicUser(session); },
    async 'auth.reauth'(p) { const u = requireUser(); const f = getRow('users', u.id); if (!f || !(await verifyPassword(p.password, f.salt, f.password_hash))) throw new Error('Password incorrect.'); return { ok: true }; },

    // ---- users ----
    async 'users.list'() { requireRole('admin'); return where('users', () => true).slice().sort((a, b) => a.full_name.localeCompare(b.full_name)).map((u) => ({ id: u.id, username: u.username, full_name: u.full_name, email: u.email, title: u.title, role: u.role, active: u.active, pending: u.pending, email_verified: u.email_verified, created_at: u.created_at })); },
    async 'users.create'(p) {
      const actor = requireRole('admin'); const email = String(p.email || '').trim();
      if (!p.full_name || !email) throw new Error('Full name and email are required.');
      if (!validEmail(email)) throw new Error('Enter a valid email address.');
      const domain = getSetting('allowed_email_domain', 'upstate.edu');
      if (domain && !email.toLowerCase().endsWith('@' + domain.toLowerCase()) && !p.allowExternal) throw new Error('Email must be on the institutional domain (@' + domain + '). Tick "allow external" to override.');
      if (tbl('users').find((u) => (u.email || '').toLowerCase() === email.toLowerCase())) throw new Error('That email already has an account.');
      const username = (p.username && p.username.trim()) || email.split('@')[0].toLowerCase();
      const role = ['admin', 'qa', 'operator'].includes(p.role) ? p.role : 'operator';
      let salt = '', hash = '', pending = 1, must_change = 0;
      if (p.password) { if (String(p.password).length < 8) throw new Error('Password must be at least 8 characters.'); ({ salt, hash } = await hashPassword(p.password)); pending = 0; must_change = 1; }
      const uid = insert('users', { username, full_name: p.full_name.trim(), email, title: p.title || null, role, salt, password_hash: hash, active: 1, pending, must_change, email_verified: 0, created_at: nowISO(), created_by: actor.username });
      audit({ user_id: actor.id, username: actor.username, action: 'CREATE', entity_type: 'user', entity_id: uid, new_value: email, detail: pending ? 'invited (pending)' : 'created' });
      persist(); const u = getRow('users', uid); return { id: u.id, username: u.username, full_name: u.full_name, email: u.email, title: u.title, role: u.role, active: u.active, pending: u.pending };
    },
    async 'users.update'(p) { const actor = requireRole('admin'); const changes = {}; for (const k of ['full_name', 'title', 'role']) if (k in (p.changes || {})) changes[k] = p.changes[k]; if (changes.role && !['admin', 'qa', 'operator'].includes(changes.role)) throw new Error('Invalid role.'); return auditedUpdate('users', 'user', p.id, changes, actor, p.reason); },
    async 'users.setActive'(p) { const actor = requireRole('admin'); auditedUpdate('users', 'user', p.id, { active: p.active ? 1 : 0 }, actor); return { ok: true }; },
    async 'users.resetPassword'(p) {
      const actor = requireRole('admin');
      if (p.invite) { updateRow('users', p.id, { salt: '', password_hash: '', pending: 1, must_change: 0 }); audit({ user_id: actor.id, username: actor.username, action: 'UPDATE', entity_type: 'user', entity_id: p.id, field: 'password', detail: 'reset to pending invite' }); persist(); return { ok: true }; }
      if (String(p.password || '').length < 8) throw new Error('Password must be at least 8 characters.');
      const { salt, hash } = await hashPassword(p.password);
      updateRow('users', p.id, { salt, password_hash: hash, pending: 0, must_change: 1 });
      audit({ user_id: actor.id, username: actor.username, action: 'UPDATE', entity_type: 'user', entity_id: p.id, field: 'password', detail: 'reset by admin' }); persist(); return { ok: true };
    },

    // ---- batches ----
    async 'batches.list'(p) {
      requireUser();
      return where('batches', (b) => !p || !p.status || p.status === 'all' || b.status === p.status)
        .slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .map((b) => ({ ...b, _stages: where('process_stages', (s) => s.batch_id === b.id).length, _deviations: where('deviations', (d) => d.batch_id === b.id && d.status !== 'closed').length, _qc_fail: where('qc_tests', (q) => q.batch_id === b.id && q.result === 'fail').length }));
    },
    async 'batches.get'(p) {
      requireUser(); const batch = getRow('batches', p.id); if (!batch) throw new Error('Batch not found.');
      const bySort = (k) => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''));
      return {
        batch,
        stages: where('process_stages', (s) => s.batch_id === p.id).sort(bySort('stage_code')),
        reactor: where('bioreactor_runs', (r) => r.batch_id === p.id).sort(bySort('reading_at')),
        counts: where('cell_counts', (c) => c.batch_id === p.id).sort(bySort('counted_at')),
        qc: where('qc_tests', (q) => q.batch_id === p.id).sort(bySort('tested_at')),
        materials: where('materials', (m) => m.batch_id === p.id).sort(bySort('material_name')),
        deviations: where('deviations', (d) => d.batch_id === p.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
        attachments: where('attachments', (a) => a.batch_id === p.id).sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at))),
        signatures: where('signatures', (s) => s.entity_type === 'batch' && s.entity_id === p.id).sort(bySort('signed_at')),
      };
    },
    async 'batches.create'(p) {
      const actor = requireUser(); if (!p.lot_number) throw new Error('A lot / batch number is required.');
      if (tbl('batches').find((b) => b.lot_number === p.lot_number.trim())) throw new Error('That lot number already exists.');
      const bid = insert('batches', { lot_number: p.lot_number.trim(), product_name: p.product_name || 'iPSC-derived islets (SC-islets)', donor_id: p.donor_id || null, donor_type: p.donor_type || 'autologous', cell_line: p.cell_line || null, status: 'in_process', site: p.site || null, protocol_ref: p.protocol_ref || null, started_at: p.started_at || nowISO(), target_dose: p.target_dose || null, description: p.description || null, responsible_user_id: actor.id, created_at: nowISO(), created_by: actor.username });
      audit({ user_id: actor.id, username: actor.username, action: 'CREATE', entity_type: 'batch', entity_id: bid, new_value: p.lot_number }); persist(); return getRow('batches', bid);
    },
    async 'batches.update'(p) { const actor = requireUser(); const allowed = ['product_name', 'donor_id', 'donor_type', 'cell_line', 'site', 'protocol_ref', 'started_at', 'completed_at', 'target_dose', 'description']; const c = {}; for (const k of allowed) if (k in p.changes) c[k] = p.changes[k]; return auditedUpdate('batches', 'batch', p.id, c, actor, p.reason); },
    async 'batches.setStatus'(p) {
      const actor = requireUser(); const valid = ['in_process', 'on_hold', 'quarantine', 'released', 'rejected']; if (!valid.includes(p.status)) throw new Error('Invalid status.');
      if (p.status === 'released' || p.status === 'rejected') requireRole('qa', 'admin');
      const extra = {}; if (p.status === 'released' || p.status === 'rejected') extra.completed_at = nowISO();
      auditedUpdate('batches', 'batch', p.id, { status: p.status, ...extra }, actor, p.reason); return { ok: true };
    },

    'stages.add': async (p) => addChild('process_stages', 'process_stage', p, requireUser(), p.stage_name),
    'stages.update': async (p) => auditedUpdate('process_stages', 'process_stage', p.id, p.changes, requireUser(), p.reason),
    'stages.delete': async (p) => deleteChild('process_stages', 'process_stage', p.id, requireUser(), p.reason),
    'reactor.add': async (p) => addChild('bioreactor_runs', 'bioreactor_run', p, requireUser(), p.vessel_type),
    'reactor.delete': async (p) => deleteChild('bioreactor_runs', 'bioreactor_run', p.id, requireUser(), p.reason),
    'counts.add': async (p) => addChild('cell_counts', 'cell_count', p, requireUser(), p.method),
    'counts.delete': async (p) => deleteChild('cell_counts', 'cell_count', p.id, requireUser(), p.reason),
    'qc.add': async (p) => addChild('qc_tests', 'qc_test', p, requireUser(), p.test_name),
    'qc.update': async (p) => auditedUpdate('qc_tests', 'qc_test', p.id, p.changes, requireUser(), p.reason),
    'qc.delete': async (p) => deleteChild('qc_tests', 'qc_test', p.id, requireUser(), p.reason),
    'materials.add': async (p) => addChild('materials', 'material', p, requireUser(), p.material_name + ' / ' + (p.lot_no || '')),
    'materials.delete': async (p) => deleteChild('materials', 'material', p.id, requireUser(), p.reason),
    'deviations.add': async (p) => addChild('deviations', 'deviation', p, requireUser(), p.title),
    'deviations.update': async (p) => auditedUpdate('deviations', 'deviation', p.id, p.changes, requireUser(), p.reason),
    'deviations.delete': async (p) => deleteChild('deviations', 'deviation', p.id, requireUser(), p.reason),

    async 'signatures.sign'(p) {
      const actor = requireUser(); const fresh = getRow('users', actor.id);
      if (!(await verifyPassword(p.password, fresh.salt, fresh.password_hash))) throw new Error('Password incorrect — signature not applied.');
      const meaningMap = { authored: 'Authored by', reviewed: 'Reviewed by', approved: 'Approved by', released: 'Released by', rejected: 'Rejected by' };
      if (!meaningMap[p.meaning]) throw new Error('Invalid signature meaning.');
      if (['released', 'rejected', 'approved'].includes(p.meaning)) requireRole('qa', 'admin');
      const full = await H['batches.get']({ id: p.entity_id });
      const snapshot = { batch: full.batch, stages: full.stages, qc: full.qc, materials: full.materials, deviations: full.deviations };
      const recordHash = await sha256Hex(canonicalize(snapshot));
      insert('signatures', { entity_type: 'batch', entity_id: p.entity_id, meaning: p.meaning, user_id: actor.id, username: actor.username, full_name: actor.full_name, role: actor.role, signed_at: nowISO(), statement: meaningMap[p.meaning], comment: p.comment || null, record_hash: recordHash });
      audit({ user_id: actor.id, username: actor.username, action: 'SIGN', entity_type: 'batch', entity_id: p.entity_id, new_value: p.meaning, detail: 'hash:' + recordHash.slice(0, 16) });
      persist(); return { ok: true };
    },

    // ---- attachments (browser: File in, blob stored in IndexedDB) ----
    async 'attachments.pick'() { requireUser(); return null; }, // replaced by App.pickFile in views
    async 'attachments.add'(p) {
      const actor = requireUser(); const file = p.file; if (!file) throw new Error('No file selected.');
      const buf = await file.arrayBuffer(); const sha = await sha256Hex(buf);
      const entityType = p.entity_type || 'batch'; const entityId = p.entity_id || p.batch_id; if (!entityId) throw new Error('Missing attachment target.');
      const aid = newId();
      await idbPut(BLOBS, aid, new Blob([buf], { type: file.type || 'application/octet-stream' }));
      insert('attachments', { id: aid, batch_id: entityType === 'batch' ? entityId : (p.batch_id || null), entity_type: entityType, entity_id: entityId, filename: file.name, stored_path: 'idb:' + aid, sha256: sha, size_bytes: file.size, content_type: file.type || null, description: p.description || null, uploaded_at: nowISO(), uploaded_by: actor.username });
      audit({ user_id: actor.id, username: actor.username, action: 'CREATE', entity_type: 'attachment', entity_id: aid, new_value: file.name, detail: entityType + ' · sha256:' + sha.slice(0, 16) });
      await persistNow(); return getRow('attachments', aid);
    },
    async 'attachments.open'(p) {
      requireUser(); const a = getRow('attachments', p.id); if (!a) throw new Error('File not found.');
      const blob = await idbGet(BLOBS, a.id); if (!blob) throw new Error('File is missing from storage.');
      const nh = nativeHandler('openFile');
      if (nh) { nh.postMessage({ name: a.filename, base64: await blobToBase64(blob), type: a.content_type || 'application/octet-stream' }); return { ok: true }; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener';
      const previewable = /^(image\/|application\/pdf|text\/)/.test(a.content_type || '');
      if (!previewable) link.download = a.filename;
      document.body.appendChild(link); link.click(); setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 4000);
      return { ok: true };
    },
    async 'attachments.verify'(p) { requireUser(); const a = getRow('attachments', p.id); if (!a) return { ok: false, reason: 'missing' }; const blob = await idbGet(BLOBS, a.id); if (!blob) return { ok: false, reason: 'missing' }; const sha = await sha256Hex(await blob.arrayBuffer()); return { ok: sha === a.sha256, sha }; },
    async 'attachments.listFor'(p) { requireUser(); return where('attachments', (a) => a.entity_type === p.entity_type && a.entity_id === p.entity_id).sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at))); },
    async 'attachments.delete'(p) { const actor = requireUser(); const a = getRow('attachments', p.id); if (!a) return { ok: true }; await idbDel(BLOBS, a.id).catch(() => {}); removeRow('attachments', p.id); audit({ user_id: actor.id, username: actor.username, action: 'DELETE', entity_type: 'attachment', entity_id: p.id, new_value: a.filename, reason: p.reason || null }); await persistNow(); return { ok: true }; },

    // ---- inventory ----
    async 'inventory.list'(p) {
      requireUser(); const today = new Date().toISOString().slice(0, 10);
      return where('inventory_items', (it) => (!p || !p.category || p.category === 'all' || it.category === p.category) && (!p || !p.status || p.status === 'all' || it.status === p.status))
        .slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .map((r) => ({ ...r, _low: r.reorder_level != null && r.quantity != null && Number(r.quantity) <= Number(r.reorder_level), _expired: r.expiry_date ? String(r.expiry_date).slice(0, 10) < today : false }));
    },
    async 'inventory.get'(p) { requireUser(); const item = getRow('inventory_items', p.id); if (!item) throw new Error('Item not found.'); return { item, purchases: where('purchases', (x) => x.item_id === p.id).sort((a, b) => String(b.ordered_date || b.created_at).localeCompare(String(a.ordered_date || a.created_at))), attachments: where('attachments', (a) => a.entity_type === 'inventory' && a.entity_id === p.id).sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at))) }; },
    async 'inventory.create'(p) { const actor = requireUser(); if (!p.name) throw new Error('Material name is required.'); const iid = insert('inventory_items', { ...stripUi(p), status: p.status || 'in_stock', created_at: nowISO(), created_by: actor.username }); audit({ user_id: actor.id, username: actor.username, action: 'CREATE', entity_type: 'inventory_item', entity_id: iid, new_value: p.name + (p.lot_no ? ' / ' + p.lot_no : '') }); persist(); return getRow('inventory_items', iid); },
    async 'inventory.update'(p) { return auditedUpdate('inventory_items', 'inventory_item', p.id, p.changes, requireUser(), p.reason); },
    async 'inventory.delete'(p) { return deleteChild('inventory_items', 'inventory_item', p.id, requireUser(), p.reason); },
    async 'inventory.adjustQty'(p) {
      const actor = requireUser(); const item = getRow('inventory_items', p.id); if (!item) throw new Error('Item not found.');
      const newQty = Number(item.quantity || 0) + Number(p.delta || 0); let status = item.status;
      if (!['quarantine', 'discarded', 'expired'].includes(status)) status = newQty <= 0 ? 'out' : (item.reorder_level != null && newQty <= Number(item.reorder_level) ? 'low' : 'in_stock');
      updateRow('inventory_items', p.id, { quantity: newQty, status, updated_at: nowISO(), updated_by: actor.username });
      audit({ user_id: actor.id, username: actor.username, action: 'UPDATE', entity_type: 'inventory_item', entity_id: p.id, field: 'quantity', old_value: item.quantity, new_value: newQty, reason: p.reason || (p.delta < 0 ? 'consumed' : 'restocked') }); persist(); return getRow('inventory_items', p.id);
    },
    async 'purchases.add'(p) { const actor = requireUser(); const item = p.item_id ? getRow('inventory_items', p.item_id) : null; return addChild('purchases', 'purchase', { ...stripUi(p), item_name: p.item_name || (item ? item.name : null) }, actor, (p.item_name || 'purchase') + (p.po_number ? ' / PO ' + p.po_number : '')); },
    async 'purchases.delete'(p) { return deleteChild('purchases', 'purchase', p.id, requireUser(), p.reason); },

    // ---- samples ----
    async 'samples.list'(p) { requireUser(); return where('samples', (s) => (!p || !p.sample_type || p.sample_type === 'all' || s.sample_type === p.sample_type) && (!p || !p.status || p.status === 'all' || s.status === p.status)).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); },
    async 'samples.get'(p) { requireUser(); const sample = getRow('samples', p.id); if (!sample) throw new Error('Sample not found.'); return { sample, assays: where('assays', (a) => a.sample_id === p.id).sort((a, b) => String(b.performed_at || '').localeCompare(String(a.performed_at || ''))), attachments: where('attachments', (a) => a.entity_type === 'sample' && a.entity_id === p.id).sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at))) }; },
    async 'samples.create'(p) { const actor = requireUser(); if (!p.sample_type) throw new Error('Sample type is required.'); const data = stripUi(p); if (data.n_vials != null && data.n_vials_remaining == null) data.n_vials_remaining = data.n_vials; const sid = insert('samples', { ...data, status: p.status || 'stored', created_at: nowISO(), created_by: actor.username }); audit({ user_id: actor.id, username: actor.username, action: 'CREATE', entity_type: 'sample', entity_id: sid, new_value: p.sample_code || p.name || p.sample_type }); persist(); return getRow('samples', sid); },
    async 'samples.update'(p) { return auditedUpdate('samples', 'sample', p.id, p.changes, requireUser(), p.reason); },
    async 'samples.delete'(p) { return deleteChild('samples', 'sample', p.id, requireUser(), p.reason); },
    async 'samples.useVials'(p) {
      const actor = requireUser(); const s = getRow('samples', p.id); if (!s) throw new Error('Sample not found.');
      const remaining = Math.max(0, Number(s.n_vials_remaining != null ? s.n_vials_remaining : (s.n_vials || 0)) - Number(p.n || 1));
      const status = remaining <= 0 ? 'depleted' : (s.status === 'depleted' ? 'stored' : s.status);
      updateRow('samples', p.id, { n_vials_remaining: remaining, status, updated_at: nowISO(), updated_by: actor.username });
      audit({ user_id: actor.id, username: actor.username, action: 'UPDATE', entity_type: 'sample', entity_id: p.id, field: 'n_vials_remaining', old_value: s.n_vials_remaining, new_value: remaining, reason: p.reason || 'vials withdrawn' }); persist(); return getRow('samples', p.id);
    },

    // ---- assays ----
    async 'assays.list'(p) { requireUser(); return where('assays', (a) => !p || !p.assay_type || p.assay_type === 'all' || a.assay_type === p.assay_type).slice().sort((a, b) => String(b.performed_at || b.created_at).localeCompare(String(a.performed_at || a.created_at))).map((r) => ({ ...r, _files: where('attachments', (x) => x.entity_type === 'assay' && x.entity_id === r.id).length })); },
    async 'assays.get'(p) { requireUser(); const assay = getRow('assays', p.id); if (!assay) throw new Error('Assay not found.'); return { assay, attachments: where('attachments', (a) => a.entity_type === 'assay' && a.entity_id === p.id).sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at))) }; },
    async 'assays.create'(p) { const actor = requireUser(); if (!p.title) throw new Error('A title is required.'); if (!p.assay_type) throw new Error('Assay type is required.'); const aid = insert('assays', { ...stripUi(p), status: p.status || 'recorded', created_at: nowISO(), created_by: actor.username }); audit({ user_id: actor.id, username: actor.username, action: 'CREATE', entity_type: 'assay', entity_id: aid, new_value: p.assay_type + ': ' + p.title }); persist(); return getRow('assays', aid); },
    async 'assays.update'(p) { return auditedUpdate('assays', 'assay', p.id, p.changes, requireUser(), p.reason); },
    async 'assays.delete'(p) { return deleteChild('assays', 'assay', p.id, requireUser(), p.reason); },

    // ---- settings / email (informational on device) ----
    async 'settings.getEmailConfig'() { requireRole('admin'); return { enabled: false, onDevice: true, host: '', port: 587, secure: false, user: '', from: '', domain: getSetting('allowed_email_domain', 'upstate.edu'), configured: false, hasPassword: false }; },
    async 'settings.setEmailConfig'(p) { const actor = requireRole('admin'); if (p.domain != null) { setSetting('allowed_email_domain', p.domain || 'upstate.edu'); audit({ user_id: actor.id, username: actor.username, action: 'UPDATE', entity_type: 'settings', field: 'allowed_email_domain', new_value: p.domain }); persist(); } return { ok: true }; },
    async 'settings.sendTestEmail'() { throw new Error('Sending email is not available on the device app. Configure SMTP on the desktop Suite.'); },
    async 'settings.identity'() { return IDENTITY; },

    // ---- audit ----
    async 'audit.list'(p) {
      requireUser(); let rows = tbl('audit_log').slice();
      if (p && p.entity_id) rows = rows.filter((a) => a.entity_id === p.entity_id);
      if (p && p.action) rows = rows.filter((a) => a.action === p.action);
      if (p && p.username) rows = rows.filter((a) => a.username === p.username);
      rows.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      return rows.slice(0, p && p.limit ? Math.min(parseInt(p.limit, 10) || 500, 5000) : 500);
    },

    // ---- system ----
    async 'system.info'() {
      requireUser(); let storage = null;
      try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); storage = Math.round((e.usage || 0) / 1048576) + ' / ' + Math.round((e.quota || 0) / 1048576) + ' MB'; } } catch (_) {}
      return { app: IDENTITY.app, version: IDENTITY.version + ' (iOS)', identity: IDENTITY, emailAuth: false, dataDir: 'On-device (IndexedDB)', dbPath: storage || 'On-device storage', electron: 'Web / WKWebView', node: '—', platform: (navigator.platform || 'iPadOS') + ' · ' + (navigator.userAgent.includes('iPad') ? 'iPad' : navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Web'), counts: { batches: tbl('batches').length, users: tbl('users').length, inventory: tbl('inventory_items').length, samples: tbl('samples').length, assays: tbl('assays').length, audit: tbl('audit_log').length } };
    },
    async 'system.backup'() {
      const actor = requireUser(); await persistNow();
      // include attachment blobs (base64) for a faithful restore
      const blobs = {};
      for (const a of tbl('attachments')) { try { const b = await idbGet(BLOBS, a.id); if (b) blobs[a.id] = { type: b.type, b64: await blobToBase64(b) }; } catch (_) {} }
      const payload = { identity: IDENTITY, format: 'udci-gmp-suite-backup', schema: 1, exported_at: nowISO(), exported_by: { full_name: actor.full_name, email: actor.email, role: actor.role }, db: DB, blobs };
      const fn = 'udci-gmp-suite-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      download(fn, JSON.stringify(payload), 'application/json');
      audit({ user_id: actor.id, username: actor.username, action: 'EXPORT', detail: 'full backup' }); persist();
      return { ok: true, path: fn };
    },
    async 'system.restore'(p) {
      const actor = requireUser(); const file = p.file; if (!file) throw new Error('No backup file selected.');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('That file is not valid JSON.'); }
      if (!data || data.format !== 'udci-gmp-suite-backup' || !data.db) throw new Error('Not a UDCI GMP Suite backup file.');
      DB = data.db; for (const t of TABLES) if (!Array.isArray(DB[t])) DB[t] = []; if (!DB.settings) DB.settings = {};
      if (data.blobs) { for (const [id, rec] of Object.entries(data.blobs)) { try { await idbPut(BLOBS, id, base64ToBlob(rec.b64, rec.type)); } catch (_) {} } }
      await persistNow(); session = null;
      return { ok: true, counts: { batches: tbl('batches').length, inventory: tbl('inventory_items').length, samples: tbl('samples').length, assays: tbl('assays').length } };
    },
    async 'system.exportBatchJson'(p) {
      const actor = requireUser(); const full = await H['batches.get']({ id: p.id });
      const stamped = { identity: IDENTITY, exported_at: nowISO(), exported_by: { full_name: actor.full_name, email: actor.email, role: actor.role }, ...full };
      const fn = (full.batch.lot_number || 'batch') + '.json';
      download(fn, JSON.stringify(stamped, null, 2), 'application/json');
      audit({ user_id: actor.id, username: actor.username, action: 'EXPORT', entity_type: 'batch', entity_id: p.id, detail: 'json export' }); persist();
      return { ok: true, path: fn };
    },
  };

  // ---------------------------------------------------------------------------
  // The bridge the desktop preload exposed — now fully client-side.
  // ---------------------------------------------------------------------------
  window.eln = {
    call: async function (method, payload) {
      try {
        await ready; // ensure DB loaded + seeded
        const fn = H[method];
        if (!fn) throw new Error('Unknown method: ' + method);
        const data = await fn(payload || {});
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: (err && err.message) || String(err) };
      }
    },
  };
})();
