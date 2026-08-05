// Self-contained verification: boots the app on a test port and exercises
// every endpoint against the live Railway DB. Deterministic (no background
// process / port fight). Run: node test/verify.js
require('dotenv').config();
const app = require('../src/app');

const PORT = process.env.VERIFY_PORT || 3337;
const BASE = `http://localhost:${PORT}`;

let pass = 0;
let fail = 0;
const results = [];
function chk(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name} -> ${actual}${ok ? '' : ` (expected ${expected})`}`);
}

async function call(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

(async () => {
  const server = app.listen(PORT, async () => {
    try {
      // health
      let r = await call('GET', '/health');
      chk('health', r.status, 200);

      // login admin (seeded by db-setup)
      r = await call('POST', '/users/login', { body: { email: 'admin@example.com', password: 'admin123' } });
      chk('login', r.status, 200);
      const token = r.data && r.data.token;
      chk('login returns token', typeof token === 'string' && token.length > 20 ? 200 : 401, 200);

      // register new user (optional profile_image omitted -> must coerce to null)
      const email = `u${Date.now()}@example.com`;
      r = await call('POST', '/users/register', { body: { name: 'New', email, password: 'pass123' } });
      chk('register', r.status, 201);
      const regId = r.data && r.data.user && r.data.user.id;

      // unauthorized newsletter create -> 401
      r = await call('POST', '/newsletters', { body: { locale: 'en', slug: 'z', title: 't', description: 'd' } });
      chk('newsletter create no-auth', r.status, 401);

      // authorized newsletter create (optional cover_image omitted)
      const slug = `v${Date.now()}`;
      r = await call('POST', '/newsletters', {
        token,
        body: { locale: 'en', slug, title: 'Verify', description: 'desc', body: { format: 'md', content: 'x' }, publication_status: 'published' },
      });
      chk('newsletter create', r.status, 201);
      const nlId = r.data && r.data.id;
      chk('newsletter cover_image null', r.data && r.data.cover_image === null ? 200 : 500, 200);

      // list / slug / get
      r = await call('GET', '/newsletters');
      chk('newsletter list', r.status, 200);
      r = await call('GET', `/newsletters/slug/en/${slug}`);
      chk('newsletter by slug', r.status, 200);
      r = await call('GET', `/newsletters/${nlId}`);
      chk('newsletter by id', r.status, 200);

      // update
      r = await call('PUT', `/newsletters/${nlId}`, { token, body: { publication_status: 'archived' } });
      chk('newsletter update', r.status, 200);

      // form create (optional phone omitted)
      r = await call('POST', '/forms', {
        body: {
          name: 'Jane',
          email: 'jane@example.com',
          subject: 'Teste',
          message: 'hi',
        },
      });
      chk('form create', r.status, 201);
      const fmId = r.data && r.data.id;

      // form create with phone
      r = await call('POST', '/forms', {
        body: {
          name: 'Joe',
          email: 'joe@example.com',
          phone: '+351900000000',
          subject: 'Teste 2',
          message: 'hi2',
        },
      });
      chk('form create w/ phone', r.status, 201);
      const fmId2 = r.data && r.data.id;

      // form list (protected)
      r = await call('GET', '/admin/forms', { token });
      chk('form list', r.status, 200);

      // cleanup
      await call('DELETE', `/newsletters/${nlId}`, { token });
      await call('DELETE', `/admin/forms/${fmId}`, { token });
      await call('DELETE', `/admin/forms/${fmId2}`, { token });
      await call('DELETE', `/users/${regId}`, { token });
    } catch (err) {
      results.push(`FAIL exception: ${err.message}`);
      fail++;
    } finally {
      server.close();
      console.log(results.join('\n'));
      console.log(`\nPASS=${pass} FAIL=${fail}`);
      process.exit(fail === 0 ? 0 : 1);
    }
  });

  server.on('error', (e) => {
    console.error('Server error:', e.message);
    process.exit(1);
  });
})();
