const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const app = require('../src/app');
const { requireRoles } = require('../src/models/Auth');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

test('health endpoint is public', async () => {
  const response = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'compacting-api' });
});

test('public user registration is removed', async () => {
  const response = await request('/users/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'attacker@example.com', role: 'admin' }),
  });
  assert.equal(response.status, 404);
});

test('all administrative collections require authentication', async () => {
  for (const path of [
    '/admin/dashboard',
    '/admin/users',
    '/admin/news',
    '/admin/newsletter/subscribers',
    '/admin/newsletter/campaigns',
  ]) {
    const response = await request(path);
    assert.equal(response.status, 401, path);
  }
});

test('login rejects malformed credentials before touching the database', async () => {
  const response = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'invalid', password: '' }),
  });
  assert.equal(response.status, 400);
});

test('newsletter subscription requires explicit consent', async () => {
  const response = await request('/newsletter/subscribe', {
    method: 'POST',
    body: JSON.stringify({ email: 'reader@example.com', consent: false }),
  });
  assert.equal(response.status, 400);
});

test('role middleware implements the permission matrix', () => {
  const middleware = requireRoles('owner', 'admin');
  for (const [role, expected] of [
    ['owner', 'next'],
    ['admin', 'next'],
    ['editor', 403],
  ]) {
    let result;
    middleware(
      { user: { role } },
      { status(code) { result = code; return this; }, json() { return this; } },
      () => { result = 'next'; },
    );
    assert.equal(result, expected);
  }
});
