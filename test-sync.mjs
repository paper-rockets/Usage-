import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicUsage } from './sync.mjs';

test('phone data includes only approved labels and quota metadata', () => {
  const data = publicUsage({ updatedAt: '2026-10-05T20:00:00Z', email: 'private@example.com', accounts: [
    { id: 'codex', label: 'private@example.com', status: 'ready', sessionToken: 'SECRET', checkedAt: '2026-10-05T20:00:00Z',
      primary: { usedPercent: 21, resetsAt: 1791257172, windowDurationMins: 300, accountId: 'SECRET' }, secondary: null },
    { id: 'unexpected', label: 'SECRET', primary: { usedPercent: 10 } },
  ] });
  assert.equal(data.accounts.length, 4);
  assert.equal(data.accounts[3].label, 'Codex');
  assert.equal(data.accounts[3].primary.usedPercent, 21);
  assert.equal(data.accounts[0].primary, null);
  assert.equal(data.accounts[0].status, 'unavailable');
  assert.equal(JSON.stringify(data).includes('SECRET'), false);
  assert.equal(JSON.stringify(data).includes('private@example.com'), false);
});
