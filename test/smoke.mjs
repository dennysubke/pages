import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'pages-smoke-'));
const dataDir = path.join(temp, 'data');
const binDir = path.join(temp, 'bin');
mkdirSync(dataDir, { recursive: true });
mkdirSync(binDir, { recursive: true });

const torDir = path.join(temp, 'tor-control');
const torSocket = path.join(torDir, 'control');
const torCookie = path.join(torDir, 'control.authcookie');
const siteSocketDir = path.join(temp, 'site-socket');
const siteSocket = path.join(siteSocketDir, 'pages.sock');
mkdirSync(torDir, { recursive: true });
mkdirSync(siteSocketDir, { recursive: true });
const torCookieValue = Buffer.alloc(32, 7);
writeFileSync(torCookie, torCookieValue, { mode: 0o600 });

const activeOnions = new Set();
const onionKeys = new Map();
let onionCounter = 0;
const fakeTor = createServer((socket) => {
  socket.on('error', () => {});
  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n');
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (line.startsWith('AUTHCHALLENGE SAFECOOKIE ')) {
        const clientNonce = Buffer.from(line.slice('AUTHCHALLENGE SAFECOOKIE '.length), 'hex');
        const serverNonce = Buffer.alloc(32, 9);
        const payload = Buffer.concat([torCookieValue, clientNonce, serverNonce]);
        const serverHash = crypto.createHmac('sha256', 'Tor safe cookie authentication server-to-controller hash').update(payload).digest('hex').toUpperCase();
        socket.write(`250 AUTHCHALLENGE SERVERHASH=${serverHash} SERVERNONCE=${serverNonce.toString('hex').toUpperCase()}\r\n`);
      } else if (line.startsWith('AUTHENTICATE ')) {
        socket.write('250 OK\r\n');
      } else if (line === 'GETINFO onions/detached') {
        socket.write(`250+onions/detached=\r\n${[...activeOnions].join('\r\n')}${activeOnions.size ? '\r\n' : ''}.\r\n250 OK\r\n`);
      } else if (line === 'GETINFO status/bootstrap-phase network-liveness') {
        socket.write('250-status/bootstrap-phase=NOTICE BOOTSTRAP PROGRESS=100 TAG=done SUMMARY=Done\r\n250-network-liveness=up\r\n250 OK\r\n');
      } else if (line.startsWith('ADD_ONION ')) {
        const key = line.split(' ')[1];
        let serviceId = onionKeys.get(key);
        let privateKey = '';
        if (!serviceId) {
          onionCounter += 1;
          serviceId = `${String.fromCharCode(96 + onionCounter).repeat(55)}2`;
          privateKey = `ED25519-V3:${Buffer.alloc(64, onionCounter).toString('base64')}`;
          onionKeys.set(privateKey, serviceId);
        }
        activeOnions.add(serviceId);
        socket.write(`250-ServiceID=${serviceId}\r\n${privateKey ? `250-PrivateKey=${privateKey}\r\n` : ''}250 OK\r\n`);
      } else if (line.startsWith('DEL_ONION ')) {
        activeOnions.delete(line.slice('DEL_ONION '.length));
        socket.write('250 OK\r\n');
      } else {
        socket.write('552 Unrecognized command\r\n');
      }
    }
  });
});
await new Promise((resolve, reject) => fakeTor.listen(torSocket, (error) => error ? reject(error) : resolve()));

const fakeQr = path.join(binDir, 'qrencode');
writeFileSync(fakeQr, `#!/bin/sh
cat <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg>
SVG
`);
chmodSync(fakeQr, 0o755);

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

const port = await freePort();
const onionHost = `${'a'.repeat(56)}.onion`;
const child = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    PORT: String(port),
    DATA_DIR: dataDir,
    PAGES_DISABLE_AUTH: 'true',
    PAGES_DEVICE_DOMAIN: 'umbrel.local',
    PAGES_PUBLIC_PORT: '8377',
    PAGES_HIDDEN_SERVICE: onionHost,
    TOR_CONTROL_SOCKET: torSocket,
    TOR_CONTROL_COOKIE: torCookie,
    TOR_ONION_TARGET: `unix:${siteSocket}`,
    TOR_SITE_SOCKET_DIR: siteSocketDir,
    TOR_RECONCILE_INTERVAL_MS: '10000'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

const base = `http://127.0.0.1:${port}`;

function getWithHost(hostname, pathname = '/') {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: pathname, headers: { Host: hostname } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Pages did not start.\n${output}`);
}

try {
  await waitForServer();

  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.version, '0.1.1');
  assert.equal(health.onion_available, true);
  assert.equal(health.managed_tor_available, true);
  assert.equal(health.managed_tor_state, 'ready');
  assert.equal(health.managed_tor_bootstrap, 100);
  assert.equal(existsSync(siteSocket), true);

  const system = await fetch(`${base}/api/system`).then((response) => response.json());
  assert.equal(system.version, '0.1.1');
  assert.equal(system.access.local_origin, 'http://umbrel.local:8377');
  assert.equal(system.access.onion_origin, `http://${onionHost}`);
  assert.equal(system.access.onion_available, true);
  assert.equal(system.managed_tor.state, 'ready');
  assert.equal(system.managed_tor.bootstrap_progress, 100);

  const templates = await fetch(`${base}/api/templates`).then((response) => response.json());
  assert.equal(templates.length, 9);
  assert.ok(templates.some((template) => template.id === 'portfolio'));
  assert.ok(templates.some((template) => template.id === 'nostr'));

  const preview = await fetch(`${base}/template-preview/portfolio/`);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Alex Morgan/);

  const createdResponse = await fetch(`${base}/api/sites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Onion Demo', slug: 'onion-demo', template: 'portfolio' })
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.slug, 'onion-demo');

  const website = await fetch(`${base}/p/onion-demo/`);
  assert.equal(website.status, 200);
  assert.match(await website.text(), /Onion Demo/i);

  const generatedResponse = await fetch(`${base}/api/sites/${created.id}/onion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate' })
  });
  assert.equal(generatedResponse.status, 200);
  const generated = await generatedResponse.json();
  assert.equal(generated.independent_onion.created, true);
  assert.equal(generated.independent_onion.enabled, true);
  assert.equal(generated.independent_onion.ready, true);
  assert.match(generated.independent_onion.hostname, /^[a-z2-7]{56}\.onion$/);

  const independentWebsite = await getWithHost(generated.independent_onion.hostname);
  assert.equal(independentWebsite.status, 200);
  assert.match(independentWebsite.body, /Onion Demo/i);

  const disabled = await fetch(`${base}/api/sites/${created.id}/onion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disable' })
  }).then((response) => response.json());
  assert.equal(disabled.independent_onion.enabled, false);
  assert.equal(disabled.independent_onion.state, 'disabled');
  assert.equal((await getWithHost(generated.independent_onion.hostname)).status, 410);

  const enabled = await fetch(`${base}/api/sites/${created.id}/onion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enable' })
  }).then((response) => response.json());
  assert.equal(enabled.independent_onion.hostname, generated.independent_onion.hostname);
  assert.equal(enabled.independent_onion.ready, true);
  assert.equal((await getWithHost(generated.independent_onion.hostname)).status, 200);

  const regenerated = await fetch(`${base}/api/sites/${created.id}/onion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'regenerate' })
  }).then((response) => response.json());
  assert.notEqual(regenerated.independent_onion.hostname, generated.independent_onion.hostname);
  assert.equal(regenerated.independent_onion.ready, true);
  assert.equal((await getWithHost(generated.independent_onion.hostname)).status, 410);
  assert.equal((await getWithHost(regenerated.independent_onion.hostname)).status, 200);

  const draftResponse = await fetch(`${base}/api/sites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Private Draft', slug: 'private-draft', template: 'docs', published: false })
  });
  assert.equal(draftResponse.status, 201);
  const draft = await draftResponse.json();
  assert.equal(draft.published, false);
  assert.equal((await fetch(`${base}/p/private-draft/`)).status, 404);
  assert.equal((await fetch(`${base}/p/private-draft/?preview=1`)).status, 200);

  const dashboard = await fetch(`${base}/api/dashboard`).then((response) => response.json());
  assert.equal(dashboard.totals.published, 1);
  assert.equal(dashboard.totals.drafts, 1);

  const qr = await fetch(`${base}/api/share/qr?url=${encodeURIComponent(`http://${onionHost}/p/onion-demo/`)}`);
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type') || '', /image\/svg\+xml/);
  assert.match(await qr.text(), /<svg/);

  console.log('Pages smoke test passed.');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  await new Promise((resolve) => fakeTor.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
