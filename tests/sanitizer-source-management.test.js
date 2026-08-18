'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const canonicalPath = path.join(
  root,
  'shared',
  'advanced-text-papijo-tooltip-sanitizer.js'
);
const runtimePath = path.join(root, 'advanced-text-papijo-tooltip-sanitizer.js');
const editorPath = path.join(
  root,
  'editor',
  'advanced-text-papijo-tooltip-sanitizer.js'
);
const scriptPath = path.join(root, 'scripts', 'sync-sanitizer.js');

test('canonical sanitizer source exists', () => {
  assert.equal(fs.statSync(canonicalPath).isFile(), true);
});

test('runtime sanitizer equals the canonical source', () => {
  assert.deepEqual(fs.readFileSync(runtimePath), fs.readFileSync(canonicalPath));
});

test('editor sanitizer equals the canonical source', () => {
  assert.deepEqual(fs.readFileSync(editorPath), fs.readFileSync(canonicalPath));
});

test('runtime and editor sanitizer copies remain byte-identical', () => {
  assert.deepEqual(fs.readFileSync(runtimePath), fs.readFileSync(editorPath));
});

test('check detects drift and synchronization restores deterministic bytes', () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'advanced-text-papijo-sanitizer-')
  );

  try {
    const fixtureCanonical = path.join(
      fixtureRoot,
      'shared',
      'advanced-text-papijo-tooltip-sanitizer.js'
    );
    const fixtureRuntime = path.join(
      fixtureRoot,
      'advanced-text-papijo-tooltip-sanitizer.js'
    );
    const fixtureEditor = path.join(
      fixtureRoot,
      'editor',
      'advanced-text-papijo-tooltip-sanitizer.js'
    );
    const fixtureScript = path.join(fixtureRoot, 'scripts', 'sync-sanitizer.js');
    const canonicalBytes = fs.readFileSync(canonicalPath);

    fs.mkdirSync(path.dirname(fixtureCanonical), { recursive: true });
    fs.mkdirSync(path.dirname(fixtureEditor), { recursive: true });
    fs.mkdirSync(path.dirname(fixtureScript), { recursive: true });
    fs.writeFileSync(fixtureCanonical, canonicalBytes);
    fs.writeFileSync(fixtureRuntime, canonicalBytes);
    fs.writeFileSync(fixtureEditor, canonicalBytes);
    fs.copyFileSync(scriptPath, fixtureScript);

    const initialCheck = spawnSync(
      process.execPath,
      [fixtureScript, '--check'],
      { encoding: 'utf8' }
    );
    assert.equal(initialCheck.status, 0, initialCheck.stderr);

    fs.writeFileSync(fixtureRuntime, Buffer.from('intentional drift\n'));
    const driftCheck = spawnSync(
      process.execPath,
      [fixtureScript, '--check'],
      { encoding: 'utf8' }
    );
    assert.notEqual(driftCheck.status, 0);
    assert.match(driftCheck.stderr, /Sanitizer copy differs/);

    const synchronization = spawnSync(
      process.execPath,
      [fixtureScript],
      { encoding: 'utf8' }
    );
    assert.equal(synchronization.status, 0, synchronization.stderr);
    assert.deepEqual(fs.readFileSync(fixtureRuntime), canonicalBytes);
    assert.deepEqual(fs.readFileSync(fixtureEditor), canonicalBytes);

    const secondSynchronization = spawnSync(
      process.execPath,
      [fixtureScript],
      { encoding: 'utf8' }
    );
    assert.equal(secondSynchronization.status, 0, secondSynchronization.stderr);
    assert.deepEqual(fs.readFileSync(fixtureRuntime), canonicalBytes);
    assert.deepEqual(fs.readFileSync(fixtureEditor), canonicalBytes);
  }
  finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
