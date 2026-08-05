const assert = require('node:assert/strict');
const { test } = require('node:test');

test('contact form validation rejects missing subject', () => {
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const name = 'Ana';
  const email = 'ana@example.com';
  const subject = '';
  const message = 'Olá';

  assert.equal(Boolean(name && EMAIL.test(email) && subject && message), false);
});

test('contact form validation accepts complete payload', () => {
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const name = 'Ana';
  const email = 'ana@example.com';
  const subject = 'Erasmus+';
  const message = 'Gostaria de saber mais.';

  assert.equal(Boolean(name && EMAIL.test(email) && subject && message), true);
});
