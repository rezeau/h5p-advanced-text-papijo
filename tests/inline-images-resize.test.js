'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const context = {};
vm.runInNewContext(fs.readFileSync('shared/advanced-text-papijo-inline-images.js', 'utf8'), context);
const managed = context.PapijoManagedInlineImages;
const { clipboard, sourceParams, contentFixture } = require('./h5p-inline-image-copy-fixtures');
const path = require('node:path');

test('occurrence width accepts finite one-decimal percentages and normalizes trailing .0', () => {
  for (const value of [0.1, 30, 55.5, 100, '0.1', '30', '55.5', '100', '30.0', '100.0']) {
    assert.equal(managed.normalizeWidth(value), Number(value));
    assert.equal(String(managed.normalizeWidth(value)), String(Number(value)));
  }
  assert.equal(managed.widthAttribute, 'data-papijo-inline-image-width');
});

test('width boundary rejects malformed values rather than interpreting CSS or clamping', () => {
  for (const value of [undefined, null, {}, [], true, false, 0, -1, 100.1, 1.11, NaN, Infinity,
    '', '0', '-1', '+1', '101', 'NaN', 'Infinity', '1e1', ' 30', '30 ', '30%', 'calc(50%)',
    'url(x)', '30;float:left', '<img>', '30\n', '30\t', '30\u0000', '30.00', '.1', '01', '1.', '0x10']) {
    assert.equal(managed.normalizeWidth(value), null, String(value));
  }
});

test('explicit 100 and reset/default remain distinct without changing definition semantics', () => {
  assert.equal(managed.normalizeWidth(undefined), null);
  assert.equal(managed.normalizeWidth('100'), 100);
  const semantics = JSON.parse(fs.readFileSync('semantics.json'));
  assert.deepEqual(semantics.find(f => f.name === 'inlineImages').field.fields.map(f => f.name), ['id', 'image', 'alt']);
});

test('resize is a declared local editor asset before the model adapter, with no dependency/version changes', () => {
  const manifest = JSON.parse(fs.readFileSync('editor/library.json'));
  const paths = manifest.preloadedJs.map(item => item.path);
  assert.equal(paths.indexOf('advanced-text-papijo-inline-image-resize.js') + 1,
    paths.indexOf('advanced-text-papijo-inline-image-paragraph.js'));
  assert.equal(paths.indexOf('advanced-text-papijo-inline-image-paragraph.js') + 1,
    paths.indexOf('advanced-text-papijo-inline-image-caption.js'));
  assert.equal(paths.indexOf('advanced-text-papijo-inline-image-caption.js') + 1,
    paths.indexOf('advanced-text-papijo-inline-image.js'));
  assert.deepEqual([manifest.majorVersion, manifest.minorVersion, manifest.patchVersion], [1, 1, 2]);
  assert.ok(!manifest.preloadedDependencies && !manifest.editorDependencies);
});

test('installed H5P clipboard preserves independent widths and retained files across nested/repeated content copies', t => {
  const files = contentFixture(t);
  const source = sourceParams(), A = source.inlineImages[3];
  source.text = '<p>' + [undefined, 30, 70, 100, 55.5, 0.1].map((width, i) =>
    '<span class="papijo-inline-image" data-papijo-inline-image-id="' + A.id + '"' +
    (width === undefined ? '' : ' data-papijo-inline-image-width="' + width + '"') +
    (i === 2 ? ' data-papijo-inline-image-link="https://example.com/details"' : '') +
    (i === 4 ? ' data-papijo-inline-image-style="alignLeft"' : '') + '></span>').join(' ') + '</p>';
  const core = clipboard();
  core.copy({ library: 'H5P.AdvancedTextPapiJo 1.2', params: source }, 'text-01');
  for (const destination of ['acordion-papijo-001', 'col-pj', 'interactive-book', 'text-01']) {
    const pasted = core.paste(destination);
    assert.equal(pasted.params.text, source.text);
    pasted.params.inlineImages.forEach((entry, index) => {
      assert.deepEqual(Object.keys(entry), ['id', 'image', 'alt']);
      assert.equal(entry.id, source.inlineImages[index].id);
      assert.ok(managed.validDefinition(entry));
      assert.ok(fs.existsSync(path.resolve(files.root, 'content', destination, entry.image.path)));
    });
    core.copy(pasted, destination);
  }
});
