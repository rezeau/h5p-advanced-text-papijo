'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { environment, sourceParams, clipboard } = require('./h5p-inline-image-copy-fixtures');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/advanced-text-papijo-inline-images.js'), 'utf8'), context);
const managed = context.PapijoManagedInlineImages;

test('installed content clipboard preserves per-occurrence presentation through parent and repeated copies', () => {
  const source = sourceParams();
  for (const [id, style] of [
    ['97dd2fde-fd7f-46e2-bb2d-7b686993880f', 'alignLeft'],
    ['2200ad5e-671e-42e3-835b-93cbcc338fae', 'alignRight']
  ]) {
    const attribute = 'data-papijo-inline-image-id="' + id + '"';
    assert.ok(source.text.includes(attribute));
    source.text = source.text.replace(attribute, attribute + ' data-papijo-inline-image-style="' + style + '"');
  }
  const core = clipboard();
  core.copy({ library: 'H5P.AdvancedTextPapiJo 1.2', params: source }, 'text-01');
  for (const destination of ['acordion-papijo-001', 'col-pj', 'interactive-book', 'text-01']) {
    const pasted = core.paste(destination);
    assert.equal(pasted.params.text, source.text);
    pasted.params.inlineImages.forEach((entry, index) => {
      assert.deepEqual(Object.keys(entry), Object.keys(source.inlineImages[index]));
      assert.equal(entry.id, source.inlineImages[index].id);
      assert.equal(entry.alt, source.inlineImages[index].alt);
      assert.ok(managed.validPath(entry.image.path));
    });
    core.copy(pasted, destination);
  }
});

test('installed H5P content clipboard preserves stores/IDs and produces accepted exact references', () => {
  const source = sourceParams();
  const action = { library: 'H5P.AdvancedTextPapiJo 1.2', params: source, subContentId: 'old-child-id' };
  const core = clipboard();
  const raw = core.copy(action, 'text-01');
  assert.deepEqual(raw.specific.action.params, source);
  assert.equal(raw.contentId, 'text-01');
  for (const destination of ['acordion-papijo-001', 'col-pj', 'interactive-book', 'text-01']) {
    const pasted = core.paste(destination);
    assert.equal(pasted.subContentId, undefined, 'Core clears copied subContentId separately from managed IDs');
    assert.equal(pasted.params.text, source.text);
    for (const store of ['inlineImages', 'tooltipImages']) {
      assert.equal(pasted.params[store].length, source[store].length);
      pasted.params[store].forEach((entry, index) => {
        const original = source[store][index];
        assert.deepEqual(entry, { ...original, image: { ...original.image, path: '../text-01/' + original.image.path } });
        assert.ok(fs.existsSync(path.resolve(environment, 'content', destination, entry.image.path)));
        assert.equal(managed.validPath(entry.image.path), true);
        let called;
        assert.ok(managed.resolve(entry, destination, (...args) => {
          called = args; return '/content/' + destination + '/' + args[0];
        }));
        assert.deepEqual(called, [entry.image.path, destination]);
      });
    }
  }
  const accordion = core.paste('acordion-papijo-001');
  core.copy(accordion, 'acordion-papijo-001');
  const column = core.paste('col-pj');
  core.copy(column, 'col-pj');
  const book = core.paste('interactive-book');
  for (const entry of book.params.inlineImages.concat(book.params.tooltipImages)) {
    assert.match(entry.image.path, /^\.\.\/col-pj\/\.\.\/acordion-papijo-001\/\.\.\/text-01\/images\//);
    assert.equal(managed.validPath(entry.image.path), true);
    assert.ok(fs.existsSync(path.resolve(environment, 'content/interactive-book', entry.image.path)));
  }
});

test('installed clipboard new-content prefixes and temporary files retain their separate behavior', () => {
  const core = clipboard();
  core.copy({ library: 'H5P.AdvancedTextPapiJo 1.2', params: sourceParams() }, 42);
  for (const prefix of [undefined, '../../content/']) {
    const pasted = core.paste(undefined, prefix);
    for (const entry of pasted.params.inlineImages) {
      assert.equal(entry.image.path.startsWith((prefix || '../content/') + '42/'), true);
      assert.equal(managed.validPath(entry.image.path), true);
    }
  }
  const params = sourceParams(); params.inlineImages[0].image.path += '#tmp';
  core.copy({ library: 'H5P.AdvancedTextPapiJo 1.2', params }, 'text-01');
  assert.equal(core.paste('col-pj').params.inlineImages[0].image.path, params.inlineImages[0].image.path);
});

test('captured Accordion and Column occurrence references validate with their original IDs', () => {
  // These paths/IDs were captured in both real destinations during diagnosis.
  const captures = [
    ['acordion-papijo-001', '2200ad5e-671e-42e3-835b-93cbcc338fae', '../text-01/images/bde121d522e93dba9bc7e80efbac0c63.jpg'],
    ['col-pj', '97dd2fde-fd7f-46e2-bb2d-7b686993880f', '../text-01/images/cb5b8cb112fe972fbfeb21a9f3112ca7.jpg'],
    ['col-pj', '2200ad5e-671e-42e3-835b-93cbcc338fae', '../text-01/images/bde121d522e93dba9bc7e80efbac0c63.jpg']
  ];
  for (const [parent, id, imagePath] of captures) {
    const original = sourceParams().inlineImages.find(entry => entry.id === id);
    const entry = { ...original, image: { ...original.image, path: imagePath } };
    assert.ok(managed.lookup([entry], id), parent + ':' + id);
    assert.equal(managed.validDefinition(entry), true);
  }
});
