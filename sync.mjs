import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWindow } from './read-codex.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));
const labels = { 'claude-1': ['claude', 'Main'], 'claude-2': ['claude', 'School'], 'claude-3': ['claude', 'Spare'], codex: ['codex', 'Codex'] };
const states = new Set(['ready', 'pending', 'stale', 'unavailable', 'login_required']);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
let syncing;

export function publicUsage(data) {
  return {
    schemaVersion: 1, updatedAt: timestamp(data.updatedAt),
    accounts: Object.entries(labels).map(([id, [provider, label]]) => {
      const source = data.accounts?.find(account => account.id === id) ?? {};
      return { id, provider, label,
        checkedAt: timestamp(source.checkedAt), status: states.has(source.status) ? source.status : 'unavailable',
        ...(provider === 'codex' ? { ordinaryUsageAllowed: typeof source.ordinaryUsageAllowed === 'boolean' ? source.ordinaryUsageAllowed : null } : {}),
        primary: normalizeWindow(source.primary), secondary: normalizeWindow(source.secondary),
      };
    }),
  };
}

export async function syncUsageFile(dataPath) {
  if (syncing) return syncing;
  syncing = (async () => {
    let settings;
    try { settings = JSON.parse(await fs.readFile(path.join(root, 'publish-settings.json'), 'utf8')); }
    catch { return 'disabled'; }
    if (settings.enabled !== true) return 'disabled';
    if (!/^[\w.-]+\/[\w.-]+$/.test(settings.repository)) throw new Error('Invalid publishing destination');
    const gh = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'GitHub CLI/gh.exe') : 'gh';
    const reading = publicUsage(JSON.parse(await fs.readFile(dataPath, 'utf8')));
    const text = JSON.stringify(reading, null, 2) + '\n';
    const apiPath = `repos/${settings.repository}/contents/usage.json`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { stdout } = await exec(gh, ['api', apiPath], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
      const existing = JSON.parse(stdout);
      const remote = JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8'));
      if (Date.parse(remote.updatedAt) >= Date.parse(reading.updatedAt)) return 'current';
      const payload = path.join(path.dirname(dataPath), 'publish-input.json');
      await fs.writeFile(payload, JSON.stringify({ message: 'Refresh labelled usage readings', sha: existing.sha,
        content: Buffer.from(text).toString('base64') }));
      try {
        await exec(gh, ['api', apiPath, '--method', 'PUT', '--input', payload, '--silent'], { windowsHide: true, timeout: 30000 });
        return 'published';
      } catch (error) { if (attempt === 1) throw new Error('Usage sync unavailable'); }
      finally { await fs.unlink(payload).catch(() => {}); }
    }
  })();
  try { return await syncing; } finally { syncing = null; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Token Eater sync: ${await syncUsageFile(process.argv[2] || path.join(root, 'usage.json'))}`);
}
