import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const appSource = readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

assert.doesNotMatch(
  appSource,
  /class="modal-backdrop"\s+data-action="close-modal"/,
  'The backdrop must not inherit the close action for every click inside the modal.'
);

const modalBackdrops = appSource.match(/class="modal-backdrop"/g) || [];
const backdropMarkers = appSource.match(/class="modal-backdrop"\s+data-modal-backdrop/g) || [];
assert.ok(modalBackdrops.length >= 6, 'Pages should expose all expected modal types.');
assert.equal(backdropMarkers.length, modalBackdrops.length, 'Every modal backdrop must use the dedicated backdrop marker.');

assert.match(
  appSource,
  /modalBackdrop\s*&&\s*event\.target\s*===\s*modalBackdrop/,
  'A modal may close from the backdrop only when the backdrop itself is clicked.'
);

assert.match(appSource, /data-use-template=/, 'Template cards must expose a create action.');
assert.match(appSource, /data-preview-template=/, 'Template cards must expose a preview action.');

console.log('Pages modal regression test passed.');
