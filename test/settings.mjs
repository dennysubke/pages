import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'pages-settings-'));
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); });
});
const child = spawn(process.execPath, ['--no-warnings', 'server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATA_DIR: temp, PAGES_DISABLE_AUTH: 'true', APP_HIDDEN_SERVICE: '', DEVICE_DOMAIN_NAME: 'umbrel.local', TOR_CONTROL_SOCKET: path.join(temp, 'missing.sock'), TOR_CONTROL_COOKIE: path.join(temp, 'missing.cookie'), TOR_ONION_TARGET: '127.0.0.1:3000' },
  stdio: ['ignore', 'pipe', 'pipe']
});
const base = `http://127.0.0.1:${port}`;
try {
  for (let i=0;i<50;i++) {
    try { const r=await fetch(`${base}/api/health`); if(r.ok) break; } catch {}
    await new Promise(r=>setTimeout(r,50));
  }
  let response = await fetch(`${base}/api/settings`);
  assert.equal(response.status, 200);
  const initial = await response.json();
  assert.equal(initial.default_template, 'portfolio');
  assert.equal(initial.backup_retention, 10);

  response = await fetch(`${base}/api/settings`, { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({ default_published:false, default_template:'blog', backup_retention:7, editor_font_size:16, statistics_enabled:false }) });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.default_published, false);
  assert.equal(updated.default_template, 'blog');
  assert.equal(updated.backup_retention, 7);
  assert.equal(updated.editor_font_size, 16);
  assert.equal(updated.statistics_enabled, false);

  response = await fetch(`${base}/api/sites`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ name:'Settings test', slug:'settings-test' }) });
  assert.equal(response.status, 201);
  const site = await response.json();
  assert.equal(site.published, false);
  assert.equal(site.template_id, 'blog');

  console.log('Pages settings test passed.');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
  rmSync(temp, { recursive:true, force:true });
}
