import http from 'node:http';
import { chmodSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, lstatSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const TEMPLATE_DIR = path.join(__dirname, 'templates');
const TEMPLATE_MANIFEST = JSON.parse(readFileSync(path.join(TEMPLATE_DIR, 'manifest.json'), 'utf8'));
const TEMPLATE_IDS = new Set(TEMPLATE_MANIFEST.map((template) => template.id));
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || '/data';
const SITES_DIR = path.join(DATA_DIR, 'sites');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const TOR_KEYS_DIR = path.join(DATA_DIR, 'tor', 'keys');
const MAX_UPLOAD_BYTES = Number.parseInt(process.env.MAX_UPLOAD_BYTES || String(100 * 1024 * 1024), 10);
const MAX_EXTRACTED_BYTES = Number.parseInt(process.env.MAX_EXTRACTED_BYTES || String(MAX_UPLOAD_BYTES * 5), 10);
const ADMIN_PASSWORD = process.env.PAGES_ADMIN_PASSWORD || process.env.APP_PASSWORD || '';
const DISABLE_AUTH = process.env.PAGES_DISABLE_AUTH === 'true';
const APP_VERSION = '0.1.0';
const APP_HIDDEN_SERVICE_RAW = process.env.APP_HIDDEN_SERVICE || process.env.PAGES_HIDDEN_SERVICE || '';
const DEVICE_DOMAIN_NAME_RAW = process.env.DEVICE_DOMAIN_NAME || process.env.PAGES_DEVICE_DOMAIN || '';
const PUBLIC_PORT = Number.parseInt(process.env.PAGES_PUBLIC_PORT || '8377', 10);
const TOR_CONTROL_SOCKET = process.env.TOR_CONTROL_SOCKET || '/tor-control/control';
const TOR_CONTROL_COOKIE = process.env.TOR_CONTROL_COOKIE || '/tor-control/control.authcookie';
const TOR_ONION_TARGET_RAW = process.env.TOR_ONION_TARGET || 'unix:/site-socket/pages.sock';
const TOR_ONION_TARGET = /^(?:[a-zA-Z0-9_.-]+:\d+|unix:\/[a-zA-Z0-9_./-]+)$/.test(TOR_ONION_TARGET_RAW) ? TOR_ONION_TARGET_RAW : 'unix:/site-socket/pages.sock';
const TOR_SITE_SOCKET = TOR_ONION_TARGET.startsWith('unix:') ? TOR_ONION_TARGET.slice('unix:'.length) : '';
const TOR_RECONCILE_INTERVAL_MS = Math.max(10000, Number.parseInt(process.env.TOR_RECONCILE_INTERVAL_MS || '30000', 10));

for (const dir of [DATA_DIR, SITES_DIR, BACKUPS_DIR, TMP_DIR, TOR_KEYS_DIR]) mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'pages.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    cors INTEGER NOT NULL DEFAULT 0,
    spa_fallback INTEGER NOT NULL DEFAULT 0,
    directory_listing INTEGER NOT NULL DEFAULT 0,
    cache_policy TEXT NOT NULL DEFAULT '30d',
    views INTEGER NOT NULL DEFAULT 0,
    last_view_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    hostname TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    filename TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS onion_services (
    site_id INTEGER PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
    hostname TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL DEFAULT 'starting',
    last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS onion_tombstones (
    hostname TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );
`);

const siteColumns = new Set(db.prepare('PRAGMA table_info(sites)').all().map((column) => column.name));
if (!siteColumns.has('published')) db.exec('ALTER TABLE sites ADD COLUMN published INTEGER NOT NULL DEFAULT 1');
if (!siteColumns.has('template_id')) db.exec("ALTER TABLE sites ADD COLUMN template_id TEXT NOT NULL DEFAULT 'blank'");

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
if (!getSetting('session_secret')) setSetting('session_secret', crypto.randomBytes(48).toString('hex'));
const SESSION_SECRET = getSetting('session_secret');

const now = () => new Date().toISOString();
const json = (res, status, value, headers = {}) => {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
};
const text = (res, status, value, contentType = 'text/plain; charset=utf-8', headers = {}) => {
  const body = Buffer.from(value);
  res.writeHead(status, { 'Content-Type': contentType, 'Content-Length': body.length, ...headers });
  res.end(body);
};

function normalizeSlug(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeDomain(input) {
  return String(input || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/\.$/, '');
}

function normalizeOnionHost(input) {
  const host = normalizeDomain(input);
  const placeholders = new Set(['not-enabled.onion', 'notyetset.onion', 'not-set.onion', 'disabled.onion']);
  if (!host || placeholders.has(host)) return '';
  return /^(?:[a-z2-7]{16}|[a-z2-7]{56})\.onion$/.test(host) ? host : '';
}

const ONION_HOST = normalizeOnionHost(APP_HIDDEN_SERVICE_RAW);
const LOCAL_HOST = normalizeDomain(DEVICE_DOMAIN_NAME_RAW);

function forwardedHeader(req, name) {
  const value = String(req.headers[name] || '').split(',')[0].trim();
  return value;
}

function requestOrigin(req) {
  const host = forwardedHeader(req, 'x-forwarded-host') || String(req.headers.host || '').trim();
  if (!host) return '';
  const proto = forwardedHeader(req, 'x-forwarded-proto') || (req.socket.encrypted ? 'https' : 'http');
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
}

function systemInfo(req) {
  const localOrigin = LOCAL_HOST ? `http://${LOCAL_HOST}${PUBLIC_PORT === 80 ? '' : `:${PUBLIC_PORT}`}` : '';
  const onionOrigin = ONION_HOST ? `http://${ONION_HOST}` : '';
  const currentOrigin = requestOrigin(req);
  return {
    version: APP_VERSION,
    access: {
      current_origin: currentOrigin,
      local_origin: localOrigin,
      local_host: LOCAL_HOST,
      local_port: PUBLIC_PORT,
      onion_origin: onionOrigin,
      onion_host: ONION_HOST,
      onion_available: Boolean(ONION_HOST),
      onion_pending: Boolean(APP_HIDDEN_SERVICE_RAW) && !ONION_HOST,
      current_is_onion: normalizeDomain(currentOrigin).endsWith('.onion')
    },
    managed_tor: {
      available: torRuntime.available,
      state: torRuntime.state,
      bootstrap_progress: torRuntime.bootstrap_progress,
      network_liveness: torRuntime.network_liveness,
      last_error: torRuntime.last_error,
      last_checked_at: torRuntime.last_checked_at,
      active_services: activeOnionServices.size
    }
  };
}

function safeRelative(input = '') {
  const decoded = decodeURIComponent(String(input));
  const normalized = path.posix.normalize('/' + decoded.replaceAll('\\', '/')).slice(1);
  if (!normalized || normalized === '.') return '';
  if (normalized.startsWith('../') || normalized.includes('/../') || path.isAbsolute(normalized)) throw new Error('Invalid path');
  return normalized;
}

function clientError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeJoin(root, relative = '') {
  const safe = safeRelative(relative);
  const target = path.resolve(root, safe);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) throw clientError('Invalid path');

  let current = resolvedRoot;
  const parts = path.relative(resolvedRoot, target).split(path.sep).filter(Boolean);
  for (const part of parts) {
    current = path.join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw clientError('Symbolic links are not supported');
  }
  return target;
}

function siteDir(site) {
  return path.join(SITES_DIR, String(site.id));
}

function domainsForSite(siteId) {
  return db.prepare('SELECT hostname FROM domains WHERE site_id = ? ORDER BY hostname').all(siteId).map((row) => row.hostname);
}

const activeOnionServices = new Set();
const torRuntime = {
  available: false,
  state: 'waiting',
  bootstrap_progress: 0,
  network_liveness: 'unknown',
  last_error: '',
  last_checked_at: null
};

function onionKeyPath(siteId) {
  return path.join(TOR_KEYS_DIR, `${Number(siteId)}.key`);
}

function onionForSite(siteId) {
  const row = db.prepare('SELECT * FROM onion_services WHERE site_id = ?').get(siteId);
  if (!row) return { created: false, enabled: false, hostname: '', url: '', state: 'not_created', ready: false, last_error: '' };
  const serviceId = row.hostname.replace(/\.onion$/, '');
  const ready = Boolean(row.enabled) && activeOnionServices.has(serviceId) && torRuntime.state === 'ready';
  let state = row.state || 'starting';
  if (!row.enabled) state = 'disabled';
  else if (ready) state = 'ready';
  else if (!torRuntime.available) state = 'waiting';
  else if (row.state === 'error') state = 'error';
  else state = 'starting';
  return {
    created: true,
    enabled: Boolean(row.enabled),
    hostname: row.hostname,
    url: `http://${row.hostname}/`,
    state,
    ready,
    last_error: row.last_error || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function serializeSite(site) {
  if (!site) return null;
  return {
    ...site,
    cors: Boolean(site.cors),
    spa_fallback: Boolean(site.spa_fallback),
    directory_listing: Boolean(site.directory_listing),
    published: Boolean(site.published),
    domains: domainsForSite(site.id),
    independent_onion: onionForSite(site.id),
    public_path: `/p/${site.slug}/`
  };
}

function getSite(id) {
  return serializeSite(db.prepare('SELECT * FROM sites WHERE id = ?').get(id));
}

function getSiteBySlug(slug) {
  return serializeSite(db.prepare('SELECT * FROM sites WHERE slug = ?').get(slug));
}

function getSiteByHost(host) {
  const row = db.prepare(`
    SELECT s.* FROM sites s
    JOIN domains d ON d.site_id = s.id
    WHERE d.hostname = ?
  `).get(host);
  return serializeSite(row);
}

function getSiteByIndependentOnionHost(host) {
  const row = db.prepare(`
    SELECT s.* FROM sites s
    JOIN onion_services o ON o.site_id = s.id
    WHERE o.hostname = ? AND o.enabled = 1
  `).get(host);
  return serializeSite(row);
}

function isBlockedIndependentOnionHost(host) {
  if (!normalizeOnionHost(host)) return false;
  const disabled = db.prepare('SELECT 1 FROM onion_services WHERE hostname = ? AND enabled = 0').get(host);
  const tombstone = db.prepare('SELECT 1 FROM onion_tombstones WHERE hostname = ?').get(host);
  return Boolean(disabled || tombstone);
}

function rememberRetiredOnion(hostname) {
  const host = normalizeOnionHost(hostname);
  if (host) db.prepare('INSERT OR IGNORE INTO onion_tombstones (hostname, created_at) VALUES (?, ?)').run(host, now());
}

function setDomains(siteId, domains) {
  const clean = [...new Set((domains || []).map(normalizeDomain).filter(Boolean))];
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM domains WHERE site_id = ?').run(siteId);
    const insert = db.prepare('INSERT INTO domains (site_id, hostname) VALUES (?, ?)');
    for (const hostname of clean) insert.run(siteId, hostname);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySession(token) {
  if (!token || !token.includes('.')) return false;
  const [encoded, signature] = token.split('.', 2);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
}

function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function isAuthenticated(req) {
  return DISABLE_AUTH || verifySession(cookies(req).pages_session);
}

async function readBody(req, limit = MAX_UPLOAD_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Upload is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readBody(req, 2 * 1024 * 1024);
  if (!body.length) return {};
  try { return JSON.parse(body.toString('utf8')); }
  catch { const error = new Error('Invalid JSON'); error.statusCode = 400; throw error; }
}

const mimeTypes = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.pdf': 'application/pdf', '.zip': 'application/zip', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm'
}));

function mimeFor(filename) {
  return mimeTypes.get(path.extname(filename).toLowerCase()) || 'application/octet-stream';
}


function torReplyValue(lines, key) {
  const prefixes = [`250-${key}=`, `250 ${key}=`];
  for (const line of lines) {
    for (const prefix of prefixes) if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return '';
}

function torReplyData(lines, key) {
  const marker = `250+${key}=`;
  const start = lines.findIndex((line) => line.startsWith(marker));
  if (start < 0) return torReplyValue(lines, key);
  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index] === '.') break;
    values.push(lines[index].startsWith('..') ? lines[index].slice(1) : lines[index]);
  }
  return values.join('\n');
}

function torReplyMessage(lines) {
  return lines.map((line) => line.replace(/^\d{3}[-+ ]?/, '').trim()).filter(Boolean).join(' · ') || 'Tor controller rejected the request';
}

function torCommand(command, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = '';
    let stage = 'challenge';
    let lines = [];
    let cookie;
    let clientNonce;
    const socket = net.createConnection(TOR_CONTROL_SOCKET);
    const timer = setTimeout(() => finish(new Error('Tor controller timed out')), timeoutMs);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(value);
    }

    function processLine(line) {
      if (!line) return;
      lines.push(line);
      const final = line.match(/^(\d{3}) /);
      if (!final) return;
      const code = Number(final[1]);
      if (code !== 250) return finish(new Error(torReplyMessage(lines)));

      if (stage === 'challenge') {
        const challenge = lines.find((item) => item.startsWith('250 AUTHCHALLENGE ')) || '';
        const serverHashHex = challenge.match(/SERVERHASH=([A-Fa-f0-9]{64})/)?.[1] || '';
        const serverNonceHex = challenge.match(/SERVERNONCE=([A-Fa-f0-9]{64})/)?.[1] || '';
        if (!serverHashHex || !serverNonceHex) return finish(new Error('Tor returned an invalid SAFECOOKIE challenge'));
        const serverNonce = Buffer.from(serverNonceHex, 'hex');
        const payload = Buffer.concat([cookie, clientNonce, serverNonce]);
        const expectedServerHash = crypto.createHmac('sha256', 'Tor safe cookie authentication server-to-controller hash').update(payload).digest();
        const suppliedServerHash = Buffer.from(serverHashHex, 'hex');
        if (!crypto.timingSafeEqual(expectedServerHash, suppliedServerHash)) return finish(new Error('Tor SAFECOOKIE server verification failed'));
        const controllerHash = crypto.createHmac('sha256', 'Tor safe cookie authentication controller-to-server hash').update(payload).digest('hex').toUpperCase();
        stage = 'authenticate';
        lines = [];
        socket.write(`AUTHENTICATE ${controllerHash}\r\n`);
        return;
      }

      if (stage === 'authenticate') {
        stage = 'command';
        lines = [];
        socket.write(`${command}\r\n`);
        return;
      }

      finish(null, [...lines]);
    }

    socket.on('connect', () => {
      try {
        cookie = readFileSync(TOR_CONTROL_COOKIE);
        if (cookie.length !== 32) throw new Error('Tor control cookie is invalid');
        clientNonce = crypto.randomBytes(32);
        socket.write(`AUTHCHALLENGE SAFECOOKIE ${clientNonce.toString('hex').toUpperCase()}\r\n`);
      } catch (error) {
        finish(new Error(`Tor is still starting: ${error.message}`));
      }
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n');
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        processLine(line);
      }
    });
    socket.on('error', (error) => finish(new Error(`Tor controller is unavailable: ${error.message}`)));
    socket.on('end', () => {
      if (!settled) finish(new Error('Tor controller closed the connection'));
    });
  });
}

function onionServiceId(hostname) {
  return normalizeOnionHost(hostname).replace(/\.onion$/, '');
}

function readOnionPrivateKey(siteId) {
  const filename = onionKeyPath(siteId);
  if (!existsSync(filename)) throw new Error('The private Onion key is missing');
  const key = readFileSync(filename, 'utf8').trim();
  if (!/^ED25519-V3:[A-Za-z0-9+/=]+$/.test(key)) throw new Error('The private Onion key is invalid');
  return key;
}

function writeOnionPrivateKey(siteId, key) {
  if (!/^ED25519-V3:[A-Za-z0-9+/=]+$/.test(key)) throw new Error('Tor returned an invalid private key');
  const filename = onionKeyPath(siteId);
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, `${key}\n`, { mode: 0o600 });
  renameSync(temporary, filename);
  chmodSync(filename, 0o600);
}

async function detachedOnionServices() {
  const lines = await torCommand('GETINFO onions/detached');
  const value = torReplyData(lines, 'onions/detached');
  return new Set((value.match(/[a-z2-7]{56}/g) || []).map((item) => item.toLowerCase()));
}

async function torNetworkStatus() {
  const lines = await torCommand('GETINFO status/bootstrap-phase network-liveness');
  const phase = torReplyValue(lines, 'status/bootstrap-phase');
  const liveness = (torReplyValue(lines, 'network-liveness') || 'unknown').toLowerCase();
  const progress = Math.max(0, Math.min(100, Number.parseInt(phase.match(/\bPROGRESS=(\d{1,3})\b/)?.[1] || '0', 10)));
  return {
    progress,
    liveness,
    ready: progress >= 100 && liveness !== 'down'
  };
}

async function addOnionService(key = 'NEW:ED25519-V3') {
  const lines = await torCommand(`ADD_ONION ${key} Flags=Detach Port=80,${TOR_ONION_TARGET}`);
  const serviceId = torReplyValue(lines, 'ServiceID').toLowerCase();
  const privateKey = torReplyValue(lines, 'PrivateKey');
  if (!/^[a-z2-7]{56}$/.test(serviceId)) throw new Error('Tor did not return a valid Onion address');
  return { serviceId, hostname: `${serviceId}.onion`, privateKey };
}

async function removeOnionService(hostname) {
  const serviceId = onionServiceId(hostname);
  if (!serviceId) return;
  try { await torCommand(`DEL_ONION ${serviceId}`); }
  catch (error) {
    if (!/not found|unknown|not recognized/i.test(error.message)) throw error;
  }
  activeOnionServices.delete(serviceId);
}

function updateOnionRow(siteId, values) {
  const current = db.prepare('SELECT * FROM onion_services WHERE site_id = ?').get(siteId);
  const timestamp = now();
  if (!current) {
    db.prepare(`INSERT INTO onion_services (site_id, hostname, enabled, state, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(siteId, values.hostname, Number(values.enabled ?? true), values.state || 'starting', values.last_error || '', timestamp, timestamp);
  } else {
    db.prepare(`UPDATE onion_services SET hostname = ?, enabled = ?, state = ?, last_error = ?, updated_at = ? WHERE site_id = ?`).run(
      values.hostname ?? current.hostname,
      Number(values.enabled ?? Boolean(current.enabled)),
      values.state ?? current.state,
      values.last_error ?? current.last_error,
      timestamp,
      siteId
    );
  }
}

async function activateStoredOnion(siteId, active = null) {
  const row = db.prepare('SELECT * FROM onion_services WHERE site_id = ?').get(siteId);
  if (!row || !row.enabled) return;
  const expectedId = onionServiceId(row.hostname);
  const detached = active || await detachedOnionServices();
  if (detached.has(expectedId)) {
    activeOnionServices.add(expectedId);
    updateOnionRow(siteId, { state: 'starting', last_error: '' });
    return;
  }
  const key = readOnionPrivateKey(siteId);
  const created = await addOnionService(key);
  if (created.serviceId !== expectedId) throw new Error('The stored Onion key does not match its address');
  activeOnionServices.add(created.serviceId);
  updateOnionRow(siteId, { state: 'starting', last_error: '' });
}

async function createIndependentOnion(siteId, regenerate = false) {
  const current = db.prepare('SELECT * FROM onion_services WHERE site_id = ?').get(siteId);
  if (current && !regenerate) throw clientError('This website already has an independent Onion address', 409);
  if (current?.hostname) {
    rememberRetiredOnion(current.hostname);
    try { await removeOnionService(current.hostname); } catch {}
  }
  const created = await addOnionService();
  if (!created.privateKey) {
    await removeOnionService(created.hostname).catch(() => {});
    throw new Error('Tor did not return the private key for the new Onion address');
  }
  try {
    writeOnionPrivateKey(siteId, created.privateKey);
    updateOnionRow(siteId, { hostname: created.hostname, enabled: true, state: 'starting', last_error: '' });
    activeOnionServices.add(created.serviceId);
  } catch (error) {
    await removeOnionService(created.hostname).catch(() => {});
    throw error;
  }
  return onionForSite(siteId);
}

async function setIndependentOnionEnabled(siteId, enabled) {
  const row = db.prepare('SELECT * FROM onion_services WHERE site_id = ?').get(siteId);
  if (!row) throw clientError('This website does not have an independent Onion address', 404);
  if (!enabled) {
    updateOnionRow(siteId, { enabled: false, state: 'disabled', last_error: '' });
    try { await removeOnionService(row.hostname); } catch (error) {
      updateOnionRow(siteId, { enabled: false, state: 'disabled', last_error: error.message });
    }
    return onionForSite(siteId);
  }
  updateOnionRow(siteId, { enabled: true, state: 'starting', last_error: '' });
  try {
    await activateStoredOnion(siteId);
  } catch (error) {
    updateOnionRow(siteId, { enabled: true, state: 'error', last_error: error.message });
    throw error;
  }
  return onionForSite(siteId);
}

let reconcileRunning = false;
async function reconcileOnionServices() {
  if (reconcileRunning) return;
  reconcileRunning = true;
  torRuntime.last_checked_at = now();
  try {
    const detached = await detachedOnionServices();
    const network = await torNetworkStatus();
    activeOnionServices.clear();
    for (const serviceId of detached) activeOnionServices.add(serviceId);
    torRuntime.available = true;
    torRuntime.state = network.ready ? 'ready' : 'starting';
    torRuntime.bootstrap_progress = network.progress;
    torRuntime.network_liveness = network.liveness;
    torRuntime.last_error = '';

    const rows = db.prepare('SELECT * FROM onion_services ORDER BY site_id').all();
    for (const row of rows) {
      const serviceId = onionServiceId(row.hostname);
      if (!row.enabled) {
        if (detached.has(serviceId)) await removeOnionService(row.hostname);
        updateOnionRow(row.site_id, { enabled: false, state: 'disabled', last_error: '' });
        continue;
      }
      try {
        await activateStoredOnion(row.site_id, detached);
        updateOnionRow(row.site_id, { enabled: true, state: network.ready ? 'ready' : 'starting', last_error: '' });
      } catch (error) {
        updateOnionRow(row.site_id, { enabled: true, state: 'error', last_error: error.message });
      }
    }
  } catch (error) {
    torRuntime.available = false;
    torRuntime.state = 'waiting';
    torRuntime.bootstrap_progress = 0;
    torRuntime.network_liveness = 'unknown';
    torRuntime.last_error = error.message;
    activeOnionServices.clear();
  } finally {
    torRuntime.last_checked_at = now();
    reconcileRunning = false;
  }
}

function cacheHeader(site, filename) {
  if (['.html', '.htm', ''].includes(path.extname(filename).toLowerCase())) return 'no-cache';
  const values = { none: 'no-store', '1h': 'public, max-age=3600', '1d': 'public, max-age=86400', '30d': 'public, max-age=2592000, immutable' };
  return values[site.cache_policy] || values['30d'];
}

function securityHeaders(site, filename) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': cacheHeader(site, filename)
  };
  if (site.cors) {
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
    headers['Access-Control-Allow-Headers'] = '*';
  }
  return headers;
}

function recordView(siteId) {
  db.prepare('UPDATE sites SET views = views + 1, last_view_at = ? WHERE id = ?').run(now(), siteId);
}

function directoryPage(site, requestPath, target) {
  const entries = readdirSync(target, { withFileTypes: true })
    .filter((entry) => !entry.isSymbolicLink())
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const base = requestPath.endsWith('/') ? requestPath : `${requestPath}/`;
  const rows = entries.map((entry) => {
    const href = `${base}${encodeURIComponent(entry.name)}${entry.isDirectory() ? '/' : ''}`;
    const type = entry.isDirectory() ? 'Folder' : 'File';
    const size = entry.isDirectory() ? '—' : formatBytes(statSync(path.join(target, entry.name)).size);
    return `<a class="entry" href="${escapeHtml(href)}"><span>${entry.isDirectory() ? '📁' : '📄'} ${escapeHtml(entry.name)}</span><small>${type} · ${size}</small></a>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(site.name)}</title><style>body{font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7fa;color:#17151f;margin:0}.wrap{max-width:850px;margin:60px auto;padding:0 24px}h1{font-size:34px}.card{background:white;border:1px solid #e8e7ed;border-radius:20px;overflow:hidden;box-shadow:0 12px 36px rgba(30,20,60,.08)}.entry{display:flex;justify-content:space-between;padding:16px 20px;text-decoration:none;color:inherit;border-bottom:1px solid #efedf3}.entry:last-child{border:0}.entry:hover{background:#f8f6ff}small{color:#77727f}</style></head><body><main class="wrap"><h1>${escapeHtml(site.name)}</h1><div class="card">${rows || '<div class="entry">This folder is empty.</div>'}</div></main></body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function sendFile(res, filename, headers = {}) {
  const stat = statSync(filename);
  res.writeHead(200, { 'Content-Type': mimeFor(filename), 'Content-Length': stat.size, ...headers });
  createReadStream(filename).pipe(res);
}

function resolveSiteFile(root, relativePath) {
  let target = safeJoin(root, relativePath);
  if (existsSync(target) && statSync(target).isDirectory()) {
    for (const index of ['index.html', 'index.htm', 'index']) {
      const candidate = path.join(target, index);
      if (existsSync(candidate) && statSync(candidate).isFile()) return { target: candidate, directory: false };
    }
    return { target, directory: true };
  }
  return { target, directory: false };
}

function serveSite(req, res, site, relativePath, requestPath) {
  const isPreview = new URL(req.url || '/', 'http://localhost').searchParams.has('preview');
  if (!site.published && !(isPreview && isAuthenticated(req))) return text(res, 404, 'Website is not published');
  if (req.method === 'OPTIONS' && site.cors) {
    res.writeHead(204, securityHeaders(site, ''));
    return res.end();
  }
  if (!['GET', 'HEAD'].includes(req.method)) return text(res, 405, 'Method not allowed');
  const root = siteDir(site);
  if (!existsSync(root)) return text(res, 404, 'Website files not found');
  let resolved;
  try { resolved = resolveSiteFile(root, relativePath); }
  catch { return text(res, 400, 'Invalid path'); }

  let target = resolved.target;
  if (resolved.directory) {
    if (!site.directory_listing) {
      const errorPage = path.join(root, '404.html');
      if (existsSync(errorPage)) return sendFile(res, errorPage, securityHeaders(site, errorPage));
      return text(res, 404, 'Not found', 'text/plain; charset=utf-8', securityHeaders(site, ''));
    }
    const body = directoryPage(site, requestPath, target);
    if (req.method === 'GET' && !isPreview) recordView(site.id);
    return text(res, 200, body, 'text/html; charset=utf-8', securityHeaders(site, 'index.html'));
  }

  if (!existsSync(target) || !statSync(target).isFile()) {
    if (site.spa_fallback && String(req.headers.accept || '').includes('text/html')) {
      const spaIndex = path.join(root, 'index.html');
      if (existsSync(spaIndex)) target = spaIndex;
    }
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    const errorPage = path.join(root, '404.html');
    if (existsSync(errorPage)) return sendFile(res, errorPage, securityHeaders(site, errorPage));
    return text(res, 404, 'Not found', 'text/plain; charset=utf-8', securityHeaders(site, ''));
  }
  if (req.method === 'GET' && !isPreview && mimeFor(target).startsWith('text/html')) recordView(site.id);
  const headers = securityHeaders(site, target);
  if (req.method === 'HEAD') {
    const stat = statSync(target);
    res.writeHead(200, { 'Content-Type': mimeFor(target), 'Content-Length': stat.size, ...headers });
    return res.end();
  }
  return sendFile(res, target, headers);
}

function collectFiles(root, current = '', depth = 0) {
  if (depth > 20) return [];
  const target = safeJoin(root, current);
  if (!existsSync(target)) return [];
  return readdirSync(target, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.pages-') && !entry.isSymbolicLink())
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((entry) => {
      const relative = path.posix.join(current.replaceAll('\\', '/'), entry.name);
      if (entry.isDirectory()) return { name: entry.name, path: relative, type: 'directory', children: collectFiles(root, relative, depth + 1) };
      const stat = statSync(path.join(target, entry.name));
      return { name: entry.name, path: relative, type: 'file', size: stat.size, modified_at: stat.mtime.toISOString(), editable: isEditable(entry.name) };
    });
}

function isEditable(filename) {
  return new Set(['.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.json', '.xml', '.txt', '.md', '.svg', '.yml', '.yaml', '.toml', '.csv']).has(path.extname(filename).toLowerCase()) || !path.extname(filename);
}

function folderSize(root) {
  let total = 0;
  if (!existsSync(root)) return total;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    const metadata = lstatSync(full);
    if (metadata.isSymbolicLink()) continue;
    total += metadata.isDirectory() ? folderSize(full) : metadata.size;
  }
  return total;
}

function templateMeta(templateId) {
  return TEMPLATE_MANIFEST.find((template) => template.id === templateId) || TEMPLATE_MANIFEST[0];
}

function writeTemplate(root, templateId, name) {
  const template = templateMeta(TEMPLATE_IDS.has(templateId) ? templateId : 'portfolio');
  const source = path.join(TEMPLATE_DIR, template.id);
  if (!existsSync(source)) throw clientError('Template files are unavailable', 500);
  mkdirSync(root, { recursive: true });
  copyDirectory(source, root);
  const replacements = { '{{SITE_NAME}}': escapeHtml(name) };
  const replaceTree = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) replaceTree(target);
      else if (entry.isFile() && isEditable(entry.name)) {
        let content = readFileSync(target, 'utf8');
        for (const [token, value] of Object.entries(replacements)) content = content.replaceAll(token, value);
        writeFileSync(target, content);
      }
    }
  };
  replaceTree(root);
}

function serveTemplatePreview(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method)) return text(res, 405, 'Method not allowed');
  const match = url.pathname.match(/^\/template-preview\/([a-z0-9-]+)(?:\/(.*))?$/);
  if (!match || !TEMPLATE_IDS.has(match[1])) return text(res, 404, 'Template not found');
  const meta = templateMeta(match[1]);
  const root = path.join(TEMPLATE_DIR, meta.id);
  const relative = safeRelative(match[2] || 'index.html') || 'index.html';
  let target = safeJoin(root, relative);
  if (existsSync(target) && statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!existsSync(target) || !statSync(target).isFile()) return text(res, 404, 'Template file not found');
  const headers = {
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self' data:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'none'; frame-ancestors 'self'"
  };
  if (req.method === 'HEAD') {
    const stat = statSync(target);
    res.writeHead(200, { 'Content-Type': mimeFor(target), 'Content-Length': stat.size, ...headers });
    return res.end();
  }
  if (isEditable(target)) {
    const previewName = escapeHtml(meta.preview_name || meta.name);
    const body = readFileSync(target, 'utf8').replaceAll('{{SITE_NAME}}', previewName);
    return text(res, 200, body, mimeFor(target), headers);
  }
  return sendFile(res, target, headers);
}

function copyDirectory(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    const metadata = lstatSync(src);
    if (metadata.isSymbolicLink()) throw clientError('Symbolic links are not supported');
    if (metadata.isDirectory()) copyDirectory(src, dst); else if (metadata.isFile()) copyFileSync(src, dst);
  }
}

function validateExtractedTree(root) {
  let total = 0;
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const metadata = lstatSync(target);
      if (metadata.isSymbolicLink()) throw clientError('The ZIP archive contains unsupported symbolic links');
      if (metadata.isDirectory()) walk(target);
      else if (metadata.isFile()) {
        total += metadata.size;
        if (total > MAX_EXTRACTED_BYTES) throw clientError('The extracted website is too large', 413);
      }
    }
  };
  walk(root);
  return total;
}

function validateZip(zipPath) {
  const result = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw clientError('The ZIP archive could not be read');
  const names = result.stdout.split(/\r?\n/).filter(Boolean);
  if (!names.length) throw clientError('The ZIP archive is empty');
  for (const name of names) {
    const normalized = name.replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.split('/').includes('..')) throw clientError('The ZIP archive contains unsafe paths');
  }
}

function flattenSingleRoot(directory) {
  const entries = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.name !== '__MACOSX');
  if (entries.length !== 1 || !entries[0].isDirectory()) return;
  const nested = path.join(directory, entries[0].name);
  const temp = path.join(TMP_DIR, `flatten-${crypto.randomUUID()}`);
  renameSync(nested, temp);
  rmSync(directory, { recursive: true, force: true });
  renameSync(temp, directory);
}

function createBackup(site) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `site-${site.id}-${stamp}.zip`;
  const destination = path.join(BACKUPS_DIR, filename);
  const source = siteDir(site);
  const result = spawnSync('zip', ['-q', '-r', destination, '.'], { cwd: source });
  if (result.status !== 0) throw new Error('Backup could not be created');
  const size = statSync(destination).size;
  const createdAt = now();
  const info = db.prepare('INSERT INTO backups (site_id, filename, size, created_at) VALUES (?, ?, ?, ?)').run(site.id, filename, size, createdAt);
  return db.prepare('SELECT * FROM backups WHERE id = ?').get(info.lastInsertRowid);
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, version: APP_VERSION, onion_available: Boolean(ONION_HOST), managed_tor_available: torRuntime.available, managed_tor_state: torRuntime.state, managed_tor_bootstrap: torRuntime.bootstrap_progress });
  if (url.pathname === '/api/auth/status') return json(res, 200, { authenticated: isAuthenticated(req), auth_disabled: DISABLE_AUTH, configured: Boolean(ADMIN_PASSWORD) });
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    if (!ADMIN_PASSWORD) return json(res, 503, { error: 'No administrator password is configured' });
    const body = await readJson(req);
    const supplied = Buffer.from(String(body.password || ''));
    const actual = Buffer.from(String(ADMIN_PASSWORD));
    const valid = supplied.length === actual.length && crypto.timingSafeEqual(supplied, actual);
    if (!valid) return json(res, 401, { error: 'Incorrect password' });
    const token = signSession({ exp: Date.now() + 7 * 24 * 60 * 60 * 1000, nonce: crypto.randomUUID() });
    return json(res, 200, { ok: true }, { 'Set-Cookie': `pages_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` });
  }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'pages_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }
  if (!isAuthenticated(req)) return json(res, 401, { error: 'Authentication required' });

  if (url.pathname === '/api/system' && req.method === 'GET') return json(res, 200, systemInfo(req));

  if (url.pathname === '/api/share/qr' && req.method === 'GET') {
    const value = String(url.searchParams.get('url') || '').trim();
    if (!value || value.length > 2048) return json(res, 400, { error: 'A valid URL is required' });
    let parsed;
    try { parsed = new URL(value); } catch { return json(res, 400, { error: 'A valid URL is required' }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return json(res, 400, { error: 'Only HTTP and HTTPS URLs are supported' });
    const result = spawnSync('qrencode', ['-t', 'SVG', '-l', 'M', '-m', '2', '-s', '7', '-o', '-', value], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    if (result.error || result.status !== 0 || !result.stdout) throw new Error('QR code could not be generated');
    const body = Buffer.from(result.stdout);
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(body);
  }

  if (url.pathname === '/api/dashboard' && req.method === 'GET') {
    const totals = db.prepare('SELECT COUNT(*) AS sites, COALESCE(SUM(views), 0) AS views, COALESCE(SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END), 0) AS published, COALESCE(SUM(CASE WHEN published = 0 THEN 1 ELSE 0 END), 0) AS drafts FROM sites').get();
    const backups = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS size FROM backups').get();
    const sites = db.prepare('SELECT * FROM sites ORDER BY updated_at DESC').all().map((site) => ({ ...serializeSite(site), size: folderSize(siteDir(site)) }));
    return json(res, 200, { totals: { ...totals, storage: sites.reduce((sum, site) => sum + site.size, 0), backups: backups.count, backup_storage: backups.size }, sites });
  }

  if (url.pathname === '/api/templates' && req.method === 'GET') {
    return json(res, 200, TEMPLATE_MANIFEST);
  }

  if (url.pathname === '/api/sites' && req.method === 'GET') {
    const sites = db.prepare('SELECT * FROM sites ORDER BY updated_at DESC').all().map((site) => ({ ...serializeSite(site), size: folderSize(siteDir(site)) }));
    return json(res, 200, sites);
  }

  if (url.pathname === '/api/sites' && req.method === 'POST') {
    const body = await readJson(req);
    const name = String(body.name || '').trim().slice(0, 80);
    const slug = normalizeSlug(body.slug || name);
    if (!name || !slug) return json(res, 400, { error: 'Name and URL slug are required' });
    const createdAt = now();
    let info;
    try {
      const templateId = TEMPLATE_IDS.has(String(body.template || '')) ? String(body.template) : 'portfolio';
      const published = body.published === false || body.published === 'false' || body.published === '0' ? 0 : 1;
      info = db.prepare(`INSERT INTO sites (name, slug, description, cors, spa_fallback, directory_listing, cache_policy, published, template_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(name, slug, String(body.description || '').slice(0, 300), templateId === 'nostr' || body.cors ? 1 : 0, body.spa_fallback ? 1 : 0, body.directory_listing ? 1 : 0, '30d', published, templateId, createdAt, createdAt);
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) return json(res, 409, { error: 'This URL slug is already in use' });
      throw error;
    }
    const site = getSite(info.lastInsertRowid);
    writeTemplate(siteDir(site), site.template_id || 'portfolio', name);
    return json(res, 201, getSite(site.id));
  }

  const siteMatch = url.pathname.match(/^\/api\/sites\/(\d+)(?:\/(.*))?$/);
  if (!siteMatch) return json(res, 404, { error: 'Not found' });
  const siteId = Number(siteMatch[1]);
  const action = siteMatch[2] || '';
  const site = getSite(siteId);
  if (!site) return json(res, 404, { error: 'Website not found' });
  const root = siteDir(site);

  if (!action && req.method === 'GET') return json(res, 200, { ...site, size: folderSize(root) });
  if (!action && req.method === 'PATCH') {
    const body = await readJson(req);
    const name = body.name === undefined ? site.name : String(body.name).trim().slice(0, 80);
    const slug = body.slug === undefined ? site.slug : normalizeSlug(body.slug);
    if (!name || !slug) return json(res, 400, { error: 'Name and URL slug are required' });
    try {
      db.prepare(`UPDATE sites SET name = ?, slug = ?, description = ?, cors = ?, spa_fallback = ?, directory_listing = ?, cache_policy = ?, published = ?, updated_at = ? WHERE id = ?`).run(
        name, slug, body.description === undefined ? site.description : String(body.description).slice(0, 300),
        body.cors === undefined ? Number(site.cors) : Number(Boolean(body.cors)),
        body.spa_fallback === undefined ? Number(site.spa_fallback) : Number(Boolean(body.spa_fallback)),
        body.directory_listing === undefined ? Number(site.directory_listing) : Number(Boolean(body.directory_listing)),
        ['none', '1h', '1d', '30d'].includes(body.cache_policy) ? body.cache_policy : site.cache_policy,
        body.published === undefined ? Number(site.published) : Number(Boolean(body.published)),
        now(), site.id
      );
      if (body.domains !== undefined) setDomains(site.id, body.domains);
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) return json(res, 409, { error: 'This slug or domain is already in use' });
      throw error;
    }
    return json(res, 200, getSite(site.id));
  }
  if (action === 'onion' && req.method === 'POST') {
    const body = await readJson(req);
    const command = String(body.action || '').toLowerCase();
    try {
      if (command === 'generate') await createIndependentOnion(site.id, false);
      else if (command === 'regenerate') await createIndependentOnion(site.id, true);
      else if (command === 'enable') await setIndependentOnionEnabled(site.id, true);
      else if (command === 'disable') await setIndependentOnionEnabled(site.id, false);
      else return json(res, 400, { error: 'Unknown Onion action' });
      await reconcileOnionServices();
      return json(res, 200, getSite(site.id));
    } catch (error) {
      return json(res, error.statusCode || 503, { error: error.message || 'The Onion address could not be updated' });
    }
  }
  if (!action && req.method === 'DELETE') {
    const onion = db.prepare('SELECT * FROM onion_services WHERE site_id = ?').get(site.id);
    if (onion?.hostname) {
      rememberRetiredOnion(onion.hostname);
      await removeOnionService(onion.hostname).catch(() => {});
    }
    rmSync(onionKeyPath(site.id), { force: true });
    rmSync(root, { recursive: true, force: true });
    for (const backup of db.prepare('SELECT filename FROM backups WHERE site_id = ?').all(site.id)) rmSync(path.join(BACKUPS_DIR, backup.filename), { force: true });
    db.prepare('DELETE FROM sites WHERE id = ?').run(site.id);
    return json(res, 200, { ok: true });
  }

  if (action === 'files' && req.method === 'GET') return json(res, 200, collectFiles(root));
  if (action === 'file') {
    let relative;
    try { relative = safeRelative(url.searchParams.get('path') || ''); } catch { return json(res, 400, { error: 'Invalid path' }); }
    if (!relative) return json(res, 400, { error: 'A file path is required' });
    const target = safeJoin(root, relative);
    if (req.method === 'GET') {
      if (!existsSync(target) || !statSync(target).isFile()) return json(res, 404, { error: 'File not found' });
      if (url.searchParams.get('download') === '1') return sendFile(res, target, { 'Content-Disposition': `attachment; filename="${path.basename(target).replaceAll('"', '')}"` });
      if (!isEditable(target) || statSync(target).size > 2 * 1024 * 1024) return json(res, 415, { error: 'This file cannot be edited in the browser' });
      return json(res, 200, { path: relative, content: readFileSync(target, 'utf8'), size: statSync(target).size });
    }
    if (req.method === 'PUT') {
      const body = await readBody(req, 5 * 1024 * 1024);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, body);
      db.prepare('UPDATE sites SET updated_at = ? WHERE id = ?').run(now(), site.id);
      return json(res, 200, { ok: true, path: relative, size: body.length });
    }
    if (req.method === 'DELETE') {
      rmSync(target, { recursive: true, force: true });
      db.prepare('UPDATE sites SET updated_at = ? WHERE id = ?').run(now(), site.id);
      return json(res, 200, { ok: true });
    }
  }

  if (action === 'directory' && req.method === 'POST') {
    const body = await readJson(req);
    const target = safeJoin(root, body.path || '');
    mkdirSync(target, { recursive: true });
    db.prepare('UPDATE sites SET updated_at = ? WHERE id = ?').run(now(), site.id);
    return json(res, 201, { ok: true });
  }

  if (action === 'upload-file' && req.method === 'POST') {
    const relative = safeRelative(url.searchParams.get('path') || '');
    if (!relative) return json(res, 400, { error: 'A destination path is required' });
    const body = await readBody(req);
    const target = safeJoin(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
    db.prepare('UPDATE sites SET updated_at = ? WHERE id = ?').run(now(), site.id);
    return json(res, 201, { ok: true, path: relative, size: body.length });
  }

  if (action === 'import-zip' && req.method === 'POST') {
    const body = await readBody(req);
    const zipPath = path.join(TMP_DIR, `${crypto.randomUUID()}.zip`);
    const extraction = path.join(TMP_DIR, crypto.randomUUID());
    try {
      writeFileSync(zipPath, body);
      validateZip(zipPath);
      mkdirSync(extraction, { recursive: true });
      const result = spawnSync('unzip', ['-q', zipPath, '-d', extraction]);
      if (result.status !== 0) throw new Error('The ZIP archive could not be extracted');
      validateExtractedTree(extraction);
      rmSync(path.join(extraction, '__MACOSX'), { recursive: true, force: true });
      flattenSingleRoot(extraction);
      rmSync(root, { recursive: true, force: true });
      renameSync(extraction, root);
      db.prepare('UPDATE sites SET updated_at = ? WHERE id = ?').run(now(), site.id);
      return json(res, 200, { ok: true });
    } finally {
      rmSync(zipPath, { force: true });
      rmSync(extraction, { recursive: true, force: true });
    }
  }

  if (action === 'export' && req.method === 'GET') {
    const filename = `${site.slug}-${Date.now()}.zip`;
    const destination = path.join(TMP_DIR, filename);
    const result = spawnSync('zip', ['-q', '-r', destination, '.'], { cwd: root });
    if (result.status !== 0) throw new Error('Export could not be created');
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': statSync(destination).size });
    const stream = createReadStream(destination);
    stream.on('close', () => rmSync(destination, { force: true }));
    return stream.pipe(res);
  }

  if (action === 'duplicate' && req.method === 'POST') {
    const body = await readJson(req);
    const newName = String(body.name || `${site.name} Copy`).slice(0, 80);
    let newSlug = normalizeSlug(body.slug || `${site.slug}-copy`);
    let index = 2;
    while (getSiteBySlug(newSlug)) newSlug = normalizeSlug(`${site.slug}-copy-${index++}`);
    const createdAt = now();
    const info = db.prepare(`INSERT INTO sites (name, slug, description, cors, spa_fallback, directory_listing, cache_policy, published, template_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(newName, newSlug, site.description, Number(site.cors), Number(site.spa_fallback), Number(site.directory_listing), site.cache_policy, 0, site.template_id || 'blank', createdAt, createdAt);
    const duplicate = getSite(info.lastInsertRowid);
    copyDirectory(root, siteDir(duplicate));
    return json(res, 201, getSite(duplicate.id));
  }

  if (action === 'backups' && req.method === 'GET') return json(res, 200, db.prepare('SELECT * FROM backups WHERE site_id = ? ORDER BY created_at DESC').all(site.id));
  if (action === 'backups' && req.method === 'POST') return json(res, 201, createBackup(site));

  const backupMatch = action.match(/^backups\/(\d+)(?:\/(restore))?$/);
  if (backupMatch) {
    const backup = db.prepare('SELECT * FROM backups WHERE id = ? AND site_id = ?').get(Number(backupMatch[1]), site.id);
    if (!backup) return json(res, 404, { error: 'Backup not found' });
    const backupPath = path.join(BACKUPS_DIR, backup.filename);
    if (backupMatch[2] === 'restore' && req.method === 'POST') {
      validateZip(backupPath);
      const extraction = path.join(TMP_DIR, crypto.randomUUID());
      mkdirSync(extraction, { recursive: true });
      try {
        const result = spawnSync('unzip', ['-q', backupPath, '-d', extraction]);
        if (result.status !== 0) throw new Error('Backup could not be restored');
        validateExtractedTree(extraction);
        rmSync(root, { recursive: true, force: true });
        renameSync(extraction, root);
        db.prepare('UPDATE sites SET updated_at = ? WHERE id = ?').run(now(), site.id);
        return json(res, 200, { ok: true });
      } finally { rmSync(extraction, { recursive: true, force: true }); }
    }
    if (req.method === 'DELETE') {
      rmSync(backupPath, { force: true });
      db.prepare('DELETE FROM backups WHERE id = ?').run(backup.id);
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: 'Not found' });
}

function serveAdminAsset(req, res, url) {
  let relative;
  if (url.pathname === '/' || url.pathname === '/admin' || url.pathname === '/admin/') relative = 'index.html';
  else if (url.pathname.startsWith('/admin/')) relative = url.pathname.slice('/admin/'.length);
  else relative = url.pathname.slice(1);
  if (!['index.html', 'app.js', 'styles.css', 'logo.svg', 'logo.png'].includes(relative)) relative = 'index.html';
  const target = path.join(PUBLIC_DIR, relative);
  const headers = { 'Cache-Control': relative === 'index.html' ? 'no-cache' : 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' };
  return sendFile(res, target, headers);
}

const requestHandler = async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const host = normalizeDomain(req.headers.host || '');

    const independentOnionSite = getSiteByIndependentOnionHost(host);
    if (independentOnionSite) return serveSite(req, res, independentOnionSite, url.pathname.replace(/^\//, ''), url.pathname);
    if (isBlockedIndependentOnionHost(host)) return text(res, 410, 'This Onion website is disabled or no longer available.');

    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/template-preview/')) {
      if (!isAuthenticated(req)) return text(res, 401, 'Authentication required');
      return serveTemplatePreview(req, res, url);
    }
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return serveAdminAsset(req, res, url);

    const publicMatch = url.pathname.match(/^\/p\/([^/]+)(?:\/(.*))?$/);
    if (publicMatch) {
      const site = getSiteBySlug(decodeURIComponent(publicMatch[1]));
      if (!site) return text(res, 404, 'Website not found');
      return serveSite(req, res, site, publicMatch[2] || '', url.pathname);
    }

    const domainSite = getSiteByHost(host);
    if (domainSite) return serveSite(req, res, domainSite, url.pathname.replace(/^\//, ''), url.pathname);

    if (url.pathname === '/favicon.ico') return serveAdminAsset(req, res, new URL('/admin/logo.svg', url));
    return serveAdminAsset(req, res, url);
  } catch (error) {
    console.error(`[pages] ${req.method} ${req.url} failed`, error);
    if (!res.headersSent) json(res, error.statusCode || 500, { error: error.message || 'Internal server error' });
    else res.destroy();
  } finally {
    const elapsed = Date.now() - started;
    if (elapsed > 1000) console.warn(`[pages] slow request ${req.method} ${req.url}: ${elapsed}ms`);
  }
};

const server = http.createServer(requestHandler);
const onionSocketServer = TOR_SITE_SOCKET ? http.createServer(requestHandler) : null;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[pages] Pages ${APP_VERSION} listening on 0.0.0.0:${PORT}`);
  console.log(`[pages] Data directory: ${DATA_DIR}`);
  console.log(`[pages] Authentication: ${DISABLE_AUTH ? 'disabled' : 'enabled'}`);
  console.log(`[pages] Local address: ${LOCAL_HOST ? `http://${LOCAL_HOST}:${PUBLIC_PORT}` : 'not configured'}`);
  console.log(`[pages] Umbrel Onion address: ${ONION_HOST || 'not available'}`);
  console.log(`[pages] Managed Tor control socket: ${TOR_CONTROL_SOCKET}`);
  console.log(`[pages] Managed Onion target: ${TOR_ONION_TARGET}`);
  if (onionSocketServer && TOR_SITE_SOCKET) {
    mkdirSync(path.dirname(TOR_SITE_SOCKET), { recursive: true });
    rmSync(TOR_SITE_SOCKET, { force: true });
    onionSocketServer.listen(TOR_SITE_SOCKET, () => {
      chmodSync(TOR_SITE_SOCKET, 0o660);
      console.log(`[pages] Onion website socket: ${TOR_SITE_SOCKET}`);
      reconcileOnionServices();
    });
  } else {
    reconcileOnionServices();
  }
});

const onionReconcileTimer = setInterval(reconcileOnionServices, TOR_RECONCILE_INTERVAL_MS);
onionReconcileTimer.unref();

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    clearInterval(onionReconcileTimer);
    const finish = () => {
      if (TOR_SITE_SOCKET) rmSync(TOR_SITE_SOCKET, { force: true });
      db.close();
      process.exit(0);
    };
    if (onionSocketServer) onionSocketServer.close(() => server.close(finish));
    else server.close(finish);
  });
}
