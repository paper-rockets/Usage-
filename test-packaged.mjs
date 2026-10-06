import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const executable = path.resolve(process.argv[2] || 'dist/win-unpacked/Token Eater.exe');
const reader = pathToFileURL(path.join(path.dirname(executable), 'resources/app.asar/read-codex.mjs')).href;
const code = `import {fetchCodexUsage} from ${JSON.stringify(reader)}; console.log(JSON.stringify(await fetchCodexUsage()));`;
const { stdout } = await promisify(execFile)(executable, ['--input-type=module', '-e', code], {
  cwd: path.dirname(executable), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 40000,
});
const data = JSON.parse(stdout.trim());
assert.equal(data.status, 'ready');
assert(Number.isFinite(data.primary.usedPercent));
console.log('PASS: packaged Electron executable reads the signed-in Codex account.');
