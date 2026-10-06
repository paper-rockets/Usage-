import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { publicUsage } from './sync.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const site = path.join(root, 'site');
const files = ['index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'usage.json'];
await fs.mkdir(site, { recursive: true });
const hash = createHash('sha256');
for (const name of files) {
  const contents = name === 'usage.json'
    ? Buffer.from(JSON.stringify(publicUsage(JSON.parse(await fs.readFile(path.join(root, name), 'utf8'))), null, 2) + '\n')
    : await fs.readFile(path.join(root, name));
  await fs.writeFile(path.join(site, name), contents);
  if (name !== 'usage.json') hash.update(contents);
}
const sw = await fs.readFile(path.join(root, 'sw.js'), 'utf8');
hash.update(sw);
const version = hash.digest('hex').slice(0, 12);
await fs.writeFile(path.join(site, 'sw.js'), sw.replace(/const CACHE = '[^']+';/, `const CACHE = 'token-eater-${version}';`));
await fs.writeFile(path.join(site, '.nojekyll'), '');
console.log(`Token Eater site prepared (${version}). Only app files and sanitized usage are included.`);
