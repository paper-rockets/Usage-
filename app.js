const preview = new URLSearchParams(location.search).get('preview') === '1';
let data = null;
let offline = false;
let lastError = false;
let installPrompt = null;
const minute = 60000, hour = 60 * minute, day = 24 * hour;
const accountsElement = document.getElementById('accounts');
const refreshButton = document.getElementById('refresh');
const installButton = document.getElementById('install');
document.getElementById('preview-note').hidden = !preview;

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function left(window) {
  return window && Number.isFinite(window.usedPercent) ? Math.round(100 - Math.max(0, Math.min(100, window.usedPercent))) : null;
}
function colour(value) { return value <= 15 ? 'var(--rose)' : value <= 40 ? 'var(--peach)' : 'var(--mint)'; }
function countdown(seconds) {
  if (!Number.isFinite(seconds)) return 'Reset time unavailable';
  const remaining = seconds * 1000 - Date.now();
  if (remaining <= 0) return 'Reset due · refresh to check';
  const d = Math.floor(remaining / day), h = Math.floor(remaining % day / hour), m = Math.floor(remaining % hour / minute);
  return `Refills in ${d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m` : 'under 1m'}`;
}
function age(time) {
  const elapsed = Math.max(0, Date.now() - new Date(time).getTime());
  return elapsed < minute ? 'just now' : elapsed < hour ? `${Math.floor(elapsed / minute)}m ago`
    : elapsed < day ? `${Math.floor(elapsed / hour)}h ago` : `${Math.floor(elapsed / day)}d ago`;
}
function sampleClaude() {
  const now = Date.now() / 1000;
  return [
    { id: 'claude-1', label: 'Main', used: 81, week: 93, reset: now + 2040 },
    { id: 'claude-2', label: 'School', used: 22, week: 41, reset: now + 11520 },
    { id: 'claude-3', label: 'Spare', used: 0, week: 12, reset: now + 7200 },
  ].map(row => ({ ...row, provider: 'claude', status: 'sample', primary: { usedPercent: row.used, resetsAt: row.reset }, secondary: { usedPercent: row.week } }));
}
// Fixed sample timestamps, so a preview countdown still counts down.
const samples = sampleClaude();
function render() {
  if (!data) return;
  const accounts = preview ? [...samples, ...data.accounts.filter(account => account.provider === 'codex')] : data.accounts;
  const candidates = accounts.filter(account => account.provider === 'claude' && ['ready', 'sample'].includes(account.status)
    && left(account.primary) !== null && left(account.secondary) !== null);
  const best = candidates.reduce((winner, account) => !winner || Math.min(left(account.primary), left(account.secondary))
    > Math.min(left(winner.primary), left(winner.secondary)) ? account : winner, null);
  const rows = accounts.map(account => {
    const five = left(account.primary), week = left(account.secondary);
    const row = element('section', `acc ${account === best ? 'best' : ''} ${account.provider === 'codex' ? 'codex' : ''}`);
    row.setAttribute('aria-label', `${account.provider === 'claude' ? 'Claude ' : ''}${account.label}`);
    const ring = element('div', 'ring');
    const c = 2 * Math.PI * 22;
    ring.innerHTML = `<svg viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="22" fill="none" stroke="var(--track)" stroke-width="6"/>
      ${five === null ? '' : `<circle cx="27" cy="27" r="22" fill="none" stroke="${colour(five)}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c * five / 100} ${c}"/>`}</svg>`;
    ring.append(element('b', '', five === null ? '—' : `${five}%`));
    ring.setAttribute('aria-label', five === null ? 'Session usage unavailable' : `${five}% left in the session window`);
    const mid = element('div', 'mid');
    const name = element('div', 'name', account.label);
    if (account === best) name.append(element('span', 'tag', 'use me'));
    mid.append(name);
    let status = account.primary ? countdown(account.primary.resetsAt) : 'Usage unavailable';
    if (account.status === 'pending') status = 'Waiting for first check';
    if (account.status === 'login_required') status = 'Log in again on your PC';
    if (account.status === 'stale') status = 'Last reading · refresh needed';
    if (account.ordinaryUsageAllowed === false) status = 'Usage limited · check Codex';
    mid.append(element('div', 'when', status));
    const weekly = element('div', 'wk');
    weekly.append(element('span', '', 'week'));
    const bar = element('div', 'bar');
    const fill = element('div', 'fill');
    fill.style.width = `${week ?? 0}%`;
    if (week !== null) fill.style.background = colour(week);
    bar.append(fill);
    weekly.append(bar, element('span', '', week === null ? '—' : `${week}%`));
    if (account.secondary?.resetsAt) weekly.title = countdown(account.secondary.resetsAt);
    mid.append(weekly);
    row.append(ring, mid);
    return row;
  });
  accountsElement.replaceChildren(...rows);
  const codex = data.accounts.find(account => account.provider === 'codex');
  const checked = codex?.checkedAt;
  const stale = checked && Date.now() - new Date(checked).getTime() > 20 * minute;
  document.getElementById('freshness').textContent = checked
    ? `${offline ? 'Offline · ' : lastError ? 'Connection unavailable · ' : ''}Codex checked ${age(checked)}${stale ? ' · old reading' : ''}`
    : 'Waiting for the first reading';
  document.getElementById('hint').textContent = !preview && accounts.some(account => account.provider === 'claude' && account.status === 'pending')
    ? 'Claude accounts need a first check on your PC.' : '';
}

async function load() {
  try {
    const response = await fetch('./usage.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Reading unavailable');
    const next = await response.json();
    if (next.schemaVersion !== 1 || !Array.isArray(next.accounts)) throw new Error('Invalid reading');
    data = next;
    localStorage.setItem('token-eater.lastReading', JSON.stringify(data));
    offline = response.headers.get('X-Token-Eater-Cached') === '1' || !navigator.onLine;
    lastError = false;
  } catch {
    lastError = true;
    offline = !navigator.onLine;
    if (!data) {
      try { data = JSON.parse(localStorage.getItem('token-eater.lastReading')); } catch {}
    }
    if (!data) accountsElement.replaceChildren(element('p', 'loading', 'No usage reading yet. Connect to the internet and refresh.'));
  }
  render();
}
refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Checking…';
  try {
    if (['localhost', '127.0.0.1'].includes(location.hostname) || /^(192\.168\.|10\.)/.test(location.hostname)) {
      await fetch('./api/refresh', { method: 'POST' });
    }
    await load();
  } catch { lastError = true; render(); }
  finally { refreshButton.disabled = false; refreshButton.textContent = 'Refresh'; }
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event; installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  try { await installPrompt.prompt(); await installPrompt.userChoice; }
  finally { installPrompt = null; installButton.hidden = true; }
});
window.addEventListener('appinstalled', () => { installPrompt = null; installButton.hidden = true; });
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
window.addEventListener('online', load);
window.addEventListener('offline', () => { offline = true; render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
load();
setInterval(load, minute);
setInterval(render, 1000);
