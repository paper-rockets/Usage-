import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './server.mjs';

test('desktop collector owns its port/data and excludes private paths', async () => {
  const target = path.resolve('qa/desktop-reader-check/usage.json');
  const server = await startServer({ host: '127.0.0.1', port: 0, dataPath: target, phoneSync: false });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(origin)).status, 200);
    const data = await (await fetch(`${origin}/usage.json`)).json();
    assert.equal(data.accounts.length, 4);
    assert.equal(data.accounts.find(account => account.id === 'codex').status, 'ready');
    assert.deepEqual(data, JSON.parse(await fs.readFile(target, 'utf8')));
    for (const name of ['HANDOFF.md', 'server.mjs', 'profiles/account1/Default/Cookies']) {
      assert.equal((await fetch(`${origin}/${name}`)).status, 404);
    }
    for (const unsafeOrigin of ['https://example.com', 'invalid']) {
      assert.equal((await fetch(`${origin}/api/refresh`, { method: 'POST', headers: { Origin: unsafeOrigin } })).status, 403);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
