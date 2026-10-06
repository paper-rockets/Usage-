import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodex, normalizeWindow } from './read-codex.mjs';

test('unknown windows stay unknown, not 100% remaining', () => {
  assert.equal(normalizeWindow(null), null);
  assert.equal(normalizeWindow({ usedPercent: null }), null);
  assert.equal(normalizeWindow({ usedPercent: '25' }), null);
});
test('uses the Codex bucket and omits private account metadata', () => {
  const result = normalizeCodex({
    accountId: 'private-id', email: 'private@example.invalid',
    ordinaryUsageAllowed: false,
    rateLimits: { primary: { usedPercent: 90 } },
    rateLimitsByLimitId: { codex: {
      primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: null,
    } },
  }, '2026-10-05T07:00:00.000Z');
  assert.equal(result.primary.usedPercent, 20);
  assert.equal(result.secondary, null);
  assert.equal(result.ordinaryUsageAllowed, false);
  assert(!JSON.stringify(result).includes('private'));
  assert.equal(result.primary.resetsAt, 1800000000);
});
test('backend without any quota is unavailable', () => {
  const result = normalizeCodex({ rateLimits: { primary: null, secondary: null } });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.primary, null);
});
