import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataPath = path.join(root, 'usage.json');

export function normalizeWindow(window) {
  if (!window || !Number.isFinite(window.usedPercent)) return null;
  return {
    usedPercent: Math.max(0, Math.min(100, window.usedPercent)),
    windowDurationMins: Number.isFinite(window.windowDurationMins) ? window.windowDurationMins : null,
    resetsAt: Number.isFinite(window.resetsAt) ? window.resetsAt : null,
  };
}

export function normalizeCodex(snapshot, checkedAt = new Date().toISOString()) {
  const limits = snapshot.rateLimitsByLimitId?.codex ?? snapshot.rateLimits;
  if (!limits) throw new Error('Usage data unavailable');
  return {
    id: 'codex', provider: 'codex', label: 'Codex', checkedAt,
    status: limits.primary || limits.secondary ? 'ready' : 'unavailable',
    ordinaryUsageAllowed: snapshot.ordinaryUsageAllowed ?? null,
    primary: normalizeWindow(limits.primary), secondary: normalizeWindow(limits.secondary),
  };
}

export async function fetchCodexUsage() {
  // Use the installed, signed-in CLI. No credentials are copied into this project.
  const cli = process.env.TOKEN_EATER_CODEX_CLI || (process.platform === 'win32'
    ? path.join(process.env.APPDATA, 'npm/node_modules/@openai/codex/bin/codex.js') : null);
  // app.asar is a virtual archive and cannot be a child process working directory.
  const runtimeCwd = process.versions.electron ? path.dirname(process.execPath) : root;
  const child = cli
    ? spawn(process.execPath, [cli, 'app-server', '--stdio'], { cwd: runtimeCwd, windowsHide: true,
      env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
      stdio: ['pipe', 'pipe', 'ignore'] })
    : spawn('codex', ['app-server', '--stdio'], { cwd: root, stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let nextId = 0;
  const fail = () => {
    for (const item of pending.values()) item.reject(new Error('Codex usage connection unavailable'));
    pending.clear();
  };
  child.on('error', fail);
  child.on('exit', fail);
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error('Codex usage read failed; check the CLI sign-in'));
    else item.resolve(message.result);
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }) + '\n');
  });
  const timeout = setTimeout(() => {
    fail();
    child.stdin.end();
    child.kill();
  }, 30000);
  try {
    await request('initialize', { clientInfo: { name: 'token_eater', title: 'Token Eater', version: '1.0.0' } });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    return normalizeCodex(await request('account/rateLimits/read'));
  } finally {
    clearTimeout(timeout);
    lines.close();
    child.stdin.end();
    // The CLI exits when stdin closes. Kill only if it has not exited normally.
    const stop = setTimeout(() => child.kill(), 1500);
    child.once('exit', () => clearTimeout(stop));
    stop.unref();
  }
}

export async function refreshCodex(targetPath = dataPath) {
  let data;
  try { data = JSON.parse(await fs.readFile(targetPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    data = { schemaVersion: 1, updatedAt: null, accounts: ['Main', 'School', 'Spare'].map((label, index) => ({
      id: `claude-${index + 1}`, provider: 'claude', label, status: 'pending', checkedAt: null, primary: null, secondary: null,
    })) };
  }
  const previous = data.accounts.find(account => account.id === 'codex');
  let codex;
  try { codex = await fetchCodexUsage(); }
  catch {
    codex = previous ? { ...previous, status: 'stale' }
      : { id: 'codex', provider: 'codex', label: 'Codex', status: 'unavailable', checkedAt: null, primary: null, secondary: null };
  }
  data.accounts = [...data.accounts.filter(account => account.id !== 'codex'), codex];
  data.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2) + '\n');
  await fs.rename(temporary, targetPath);
  console.log(`[Token Eater] Codex ${codex.status}; usage.json contains labels and usage only.`);
  return codex;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await refreshCodex();
  if (result.status !== 'ready') process.exitCode = 1;
}
