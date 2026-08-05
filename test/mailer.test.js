const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const ENV_KEYS = [
  'EMAIL_FROM',
  'SMTP_FROM',
  'SMTP_SERVICE',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
];

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  delete require.cache[require.resolve('../src/services/mailer')];
});

function loadMailer() {
  delete require.cache[require.resolve('../src/services/mailer')];
  return require('../src/services/mailer');
}

test('mailer detects Gmail service preset', () => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SMTP_SERVICE = 'gmail';
  process.env.SMTP_USER = 'compacting.news@gmail.com';
  process.env.SMTP_PASSWORD = 'app-password';
  process.env.EMAIL_FROM = 'Compacting <compacting.news@gmail.com>';

  const mailer = loadMailer();
  assert.equal(mailer.isConfigured(), true);
  assert.equal(mailer.fromAddress(), 'Compacting <compacting.news@gmail.com>');
});

test('mailer detects explicit SMTP configuration', () => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'newsletter@compacting.pt';
  process.env.SMTP_PASSWORD = 'secret';
  process.env.EMAIL_FROM = 'Compacting <newsletter@compacting.pt>';

  const mailer = loadMailer();
  assert.equal(mailer.isConfigured(), true);
  assert.equal(mailer.fromAddress(), 'Compacting <newsletter@compacting.pt>');
});

test('mailer accepts legacy SMTP_FROM variable', () => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'newsletter@compacting.pt';
  process.env.SMTP_PASSWORD = 'secret';
  process.env.SMTP_FROM = 'Compacting <newsletter@compacting.pt>';

  const mailer = loadMailer();
  assert.equal(mailer.isConfigured(), true);
  assert.equal(mailer.fromAddress(), 'Compacting <newsletter@compacting.pt>');
});

test('mailer masks from address for status responses', () => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SMTP_SERVICE = 'gmail';
  process.env.SMTP_USER = 'compacting.news@gmail.com';
  process.env.SMTP_PASSWORD = 'app-password';
  process.env.EMAIL_FROM = 'Compacting <compacting.news@gmail.com>';

  const mailer = loadMailer();
  assert.equal(
    mailer.maskedFromAddress(),
    'Compacting <c***s@gmail.com>',
  );
});

test('mailer stays disabled without SMTP configuration', () => {
  for (const key of ENV_KEYS) delete process.env[key];

  const mailer = loadMailer();
  assert.equal(mailer.isConfigured(), false);
  assert.equal(mailer.maskedFromAddress(), null);
});
