import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = path.join(root, 'templates');
const manifest = JSON.parse(await readFile(path.join(templatesDir, 'manifest.json'), 'utf8'));

assert.equal(manifest.length, 9, 'The template library should ship nine templates');
assert.equal(new Set(manifest.map(template => template.id)).size, manifest.length, 'Template IDs must be unique');

for (const template of manifest) {
  assert.match(template.id, /^[a-z0-9-]+$/, `Unsafe template ID: ${template.id}`);
  assert.ok(template.name && template.description && template.category, `Incomplete metadata for ${template.id}`);

  const directory = path.join(templatesDir, template.id);
  const indexFile = path.join(directory, 'index.html');
  const stylesheet = path.join(directory, 'styles.css');
  assert.ok((await stat(indexFile)).isFile(), `${template.id} is missing index.html`);
  assert.ok((await stat(stylesheet)).isFile(), `${template.id} is missing styles.css`);

  const html = await readFile(indexFile, 'utf8');
  const css = await readFile(stylesheet, 'utf8');
  assert.match(html, /\{\{SITE_NAME\}\}/, `${template.id} should contain the editable site-name placeholder`);
  assert.match(html, /<meta\s+name="viewport"/i, `${template.id} should be responsive`);
  assert.match(html, /styles\.css/i, `${template.id} should load its local stylesheet`);
  assert.doesNotMatch(html, /<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//i, `${template.id} must not load remote assets`);
  assert.doesNotMatch(css, /url\(["']?https?:\/\//i, `${template.id} must not load remote CSS assets`);
}

const nostrVerification = JSON.parse(await readFile(path.join(templatesDir, 'nostr', '.well-known', 'nostr.json'), 'utf8'));
assert.ok(nostrVerification.names && typeof nostrVerification.names === 'object', 'The Nostr template must include a NIP-05 names object');

console.log('Pages template library test passed.');
