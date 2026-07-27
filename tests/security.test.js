import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, hashPassword, hashToken, normalizeEmail, verifyPassword } from '../src/security.js';

test('passwords are salted and verified with scrypt', () => {
  const first = hashPassword('correct horse battery staple');
  const second = hashPassword('correct horse battery staple');
  assert.notEqual(first, second);
  assert.equal(verifyPassword('correct horse battery staple', first), true);
  assert.equal(verifyPassword('wrong password', first), false);
});

test('session tokens are opaque and only hashes need persistence', () => {
  const token = createSessionToken();
  assert.ok(token.length >= 40);
  assert.notEqual(hashToken(token), token);
  assert.equal(hashToken(token), hashToken(token));
});

test('emails are normalized for case-insensitive login', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
});
