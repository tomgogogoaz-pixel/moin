import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, createSignedSessionToken, hashPassword, hashToken, normalizeEmail, verifyPassword, verifySignedSessionToken } from '../src/security.js';

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

test('signed session tokens reject tampering and expiration', () => {
  const secret = 'test-secret-that-is-at-least-thirty-two-characters';
  const token = createSignedSessionToken({ email: 'demo@moin.local', exp: Date.now() + 60000 }, secret);
  assert.equal(verifySignedSessionToken(token, secret).email, 'demo@moin.local');
  assert.equal(verifySignedSessionToken(`${token}x`, secret), null);
  const expired = createSignedSessionToken({ email: 'demo@moin.local', exp: Date.now() - 1 }, secret);
  assert.equal(verifySignedSessionToken(expired, secret), null);
});

test('emails are normalized for case-insensitive login', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
});
