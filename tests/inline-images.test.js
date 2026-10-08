'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const definition = (id = 'inline-1', imagePath = 'images/photo.png', alt = 'A photo') =>
  ({ id, image: { path: imagePath, mime: 'image/png', width: 640, height: 480 }, alt });
const context = { H5P: {}, H5PEditor: { widgets: {} } };
vm.runInNewContext(read('shared/advanced-text-papijo-inline-images.js'), context);
vm.runInNewContext(read('editor/advanced-text-papijo-inline-image.js'), context);
vm.runInNewContext(read('advanced-text-papijo-inline-image-runtime.js'), context);
const managed = context.PapijoManagedInlineImages;
const Store = context.H5PEditor.AdvancedTextPapiJoInlineImage.Store;

test('inlineImages is an independent optional semantic list of required id, image, alt', () => {
  const semantics = JSON.parse(read('semantics.json'));
  const inline = semantics.find(field => field.name === 'inlineImages');
  assert.equal(inline.type, 'list');
  assert.equal(inline.optional, true);
  assert.equal(inline.widget, 'advancedTextPapiJoInlineImagesStore');
  assert.deepEqual(inline.field.fields.map(field => [field.name, field.type, !!field.optional]),
    [['id', 'text', false], ['image', 'image', false], ['alt', 'text', false]]);
  assert.ok(semantics.find(field => field.name === 'tooltipImages'));
  assert.ok(!semantics[0].tags.includes('img'));
});

test('independently packaged validation contracts match and precede their consumers', () => {
  assert.equal(read('advanced-text-papijo-inline-images.js'), read('shared/advanced-text-papijo-inline-images.js'));
  assert.equal(read('editor/advanced-text-papijo-inline-images.js'), read('shared/advanced-text-papijo-inline-images.js'));
  for (const file of ['library.json', 'editor/library.json']) {
    assert.equal(JSON.parse(read(file)).preloadedJs[0].path, 'advanced-text-papijo-inline-images.js');
  }
});

test('managed IDs are unique, valid, and stable in the independently cloned store', () => {
  const ids = Array.from({ length: 200 }, () => managed.createId());
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(managed.validId));
  for (const invalid of ['', ' id', 'a" onclick="x', null, '__bad.id']) {
    assert.equal(managed.validId(invalid), false);
  }
  let saved;
  const store = new Store({}, {}, [], (_field, value) => { saved = value; });
  const image = definition().image;
  const entry = store.addDefinition(image, '  A photo  ');
  image.path = 'images/replaced.png';
  assert.equal(store.getDefinition(entry.id).image.path, 'images/photo.png');
  assert.equal(saved[0].id, entry.id);
  assert.equal(entry.alt, 'A photo');
  assert.equal(store.validate(), true);
  assert.equal(saved.length, 1, 'validation must retain unreferenced definitions');
});

test('alternative text must be nonblank; metadata remains literal text', () => {
  const store = new Store({}, {}, [], () => {});
  for (const alt of ['', ' \n\t', undefined, null, 5]) {
    assert.equal(store.addDefinition(definition().image, alt), null);
    const bad = definition(); bad.alt = alt;
    assert.equal(managed.validDefinition(bad), false);
  }
  assert.ok(store.addDefinition(definition().image, '<script>literal description</script>'));
});

test('managed paths allow H5P image files and temporary suffixes', () => {
  for (const imagePath of ['images/a.png', 'images/a.png#tmp', 'images/sous-dossier/été image.png', 'images/a%20b.png']) {
    assert.equal(managed.validPath(imagePath), true, imagePath);
  }
});

test('H5P content references accept only copy hops and supported content-root prefixes', () => {
  for (const imagePath of ['../text-01/images/file.jpg', '../42/images/file.jpg',
    '../editor/images/file.jpg', '../content/images/file.jpg',
    '../acordion-papijo-001/../text-01/images/file.jpg',
    '../col-pj/../acordion-papijo-001/../text-01/images/file.jpg',
    '../content/text-01/images/file.jpg', '../../content/42/images/file.jpg',
    '../parent/../content/42/images/file.jpg', '../parent/../../content/42/images/file.jpg',
    '../source/images/subfolder/été%20image.jpg',
    '../text-01/images/cb5b8cb112fe972fbfeb21a9f3112ca7.jpg',
    '../text-01/images/bde121d522e93dba9bc7e80efbac0c63.jpg']) {
    assert.equal(managed.validPath(imagePath), true, imagePath);
    const entry = definition('copy', imagePath);
    let args;
    assert.equal(managed.resolve(entry, 'destination', (...values) => {
      args = values; return '/content/destination/' + imagePath;
    }), '/content/destination/' + imagePath);
    assert.deepEqual(args, [imagePath, 'destination'], 'Reference must not be normalized');
  }
});

test('unsafe, external, encoded traversal, absolute, and malformed paths fail closed', () => {
  for (const imagePath of [null, '', ' images/a.png', 'images/a.png ', 'http://x/a.png',
    'https://x/a.png', 'data:image/png;base64,x', 'javascript:x', '//x/a', '/images/a.png',
    'C:\\images\\a.png', 'images\\a.png', '../images/a.png', 'images/../a.png',
    'images/./a.png', 'images//a.png', 'images/', 'images/a?x', 'images/a#other',
    'images/%2e%2e/a.png', 'images/%252e%252e/a.png', 'images/a%2fb.png',
    'images/%00a.png', 'images/%5ca.png', 'images/%zz.png', 'images/a\n.png',
    'blob:https://example.com/id', 'file:///images/a.png', '\\images\\a.png', 'C:/images/a.png',
    '../../images/a.png', '../../source/images/a.png', '../../../content/42/images/a.png',
    '../source/files/a.png', '../source/images/../../a.png', '../source/images/./a.png',
    '../source/other/images/a.png', '../source/../images/a.png', '../source//images/a.png',
    '../source/images/', '../source/images//a.png', '../source/images/a.png?x',
    '../source/images/a.png#other', '../source/../../../content/42/images/a.png',
    '../content/42/../source/images/a.png', '../../content/42/../source/images/a.png',
    '%2e%2e/source/images/a.png', '.%2e/source/images/a.png', '..%2fsource/images/a.png',
    '../%2e%2e/images/a.png', '../source/%2e%2e/other/images/a.png',
    '../source/images/%2E%2E/a.png', '../source/images/a%2fb.png',
    '../source/images/a%5cb.png', '../source/images/a%252fb.png',
    '../source/images/a%0ab.png', '../source/images/a%7fb.png',
    '../source/images/a%00b.png', '../source/images/a%b.png',
    '../sou%72ce/images/a.png', '../source/images/a\t.png', '../source/images/a.png\u007f']) {
    assert.equal(managed.validPath(imagePath), false, String(imagePath));
  }
});

test('lookup rejects missing, malformed and ambiguous definitions', () => {
  const good = definition();
  assert.equal(managed.lookup([good], good.id), good);
  assert.equal(managed.lookup([good], 'missing'), null);
  assert.equal(managed.lookup(undefined, good.id), null);
  for (const bad of [null, {}, { id: good.id }, definition(good.id, 'https://x/a.png'), definition(good.id, 'images/a.png', ' ')]) {
    assert.equal(managed.lookup([bad], good.id), null);
  }
  assert.equal(managed.lookup([good, good], good.id), null);
  const duplicate = new Store({}, {}, [good, good], () => {});
  assert.equal(duplicate.validate(), false);
});

test('resolution calls H5P.getPath with managed path and content ID only', () => {
  let args;
  assert.equal(managed.resolve(definition(), 42, (...values) => {
    args = values; return '/content/42/images/photo.png';
  }), '/content/42/images/photo.png');
  assert.deepEqual(args, ['images/photo.png', 42]);
  assert.equal(managed.resolve(definition(), 42, () => 'javascript:alert(1)'), null);
  assert.equal(managed.resolve(definition(), 42, () => { throw Error('missing content'); }), null);
});

function fixture(ids) {
  const images = [];
  const ownerDocument = { createElement(name) {
    assert.equal(name, 'img');
    const listeners = {};
    const image = {
      listeners,
      addEventListener(event, callback) { listeners[event] = callback; },
      removeEventListener(event) { delete listeners[event]; }
    };
    Object.defineProperty(image, 'innerHTML', { set() { throw Error('unsafe image metadata construction'); } });
    images.push(image);
    return image;
  } };
  const markers = ids.map(id => ({ ownerDocument, getAttribute() { return id; },
    appendChild(image) { this.image = image; } }));
  return { markers, images, querySelectorAll(selector) {
    assert.equal(selector, 'span.papijo-inline-image[data-papijo-inline-image-id]');
    return markers;
  }, contains(image) { return markers.some(marker => marker.image === image); } };
}

test('runtime creates safe responsive image DOM and resizes on load/error', () => {
  const root = fixture(['inline-1']);
  let resized = 0;
  context.H5P.getPath = (imagePath, id) => '/content/' + id + '/' + imagePath;
  const runtime = new context.H5P.AdvancedTextPapiJoInlineImageRuntime(root, 7,
    [definition('inline-1', 'images/photo.png', '"><svg onload=x>')], () => resized++);
  assert.equal(runtime.initialize(), 1);
  const image = root.images[0];
  assert.equal(image.src, '/content/7/images/photo.png');
  assert.equal(image.alt, '"><svg onload=x>');
  assert.equal(image.className, 'papijo-managed-inline-image');
  image.listeners.load(); image.listeners.error();
  assert.equal(resized, 2);
  assert.match(read('text.css'), /\.h5p-advanced-text \.papijo-managed-inline-image\s*\{\s*max-width: 100%;\s*height: auto;/);
  runtime.destroy();
  assert.deepEqual(image.listeners, {});
});

test('runtime skips missing/malformed/unsafe definitions and supports multiple images', () => {
  const root = fixture(['inline-1', 'inline-2', 'missing', 'unsafe', 'no-alt']);
  const runtime = new context.H5P.AdvancedTextPapiJoInlineImageRuntime(root, 1,
    [definition(), definition('inline-2'), definition('unsafe', 'https://x/a.png'),
      definition('no-alt', 'images/a.png', ' ')], () => {});
  assert.equal(runtime.initialize(), 2);
  assert.equal(root.images.length, 2);
  assert.equal(runtime.initialize(), 2, 'repeat initialization rebuilds without stacking listeners');
  assert.deepEqual(root.images[0].listeners, {});
});

test('AdvancedText instances keep their image lookup, tooltip store, content ID, and lifecycle independent', () => {
  const tooltipStores = [];
  context.H5P.EventDispatcher = function () { this.trigger = () => {}; };
  context.H5P.jQuery = {};
  context.H5P.AdvancedTextPapiJoTooltipRuntime = function (root, id, store) {
    tooltipStores.push(store); this.root = root; this.initialize = () => 1; this.destroy = () => {};
  };
  vm.runInNewContext(read('text.js'), context);
  const one = fixture(['shared']); const two = fixture(['shared']);
  function container(root) { return { 0: root, addClass() { return this; }, html() { return this; } }; }
  const tooltips = [definition('tooltip')];
  const first = new context.H5P.AdvancedTextPapiJo({ text: '<p>One</p>', inlineImages: [definition('shared', 'images/one.png')], tooltipImages: tooltips }, 1);
  const second = new context.H5P.AdvancedTextPapiJo({ text: '<p>Two</p>', inlineImages: [definition('shared', 'images/two.png')] }, 2);
  first.attach(container(one)); second.attach(container(two));
  assert.equal(one.images[0].src, '/content/1/images/one.png');
  assert.equal(two.images[0].src, '/content/2/images/two.png');
  assert.equal(tooltipStores[0], tooltips);
  first.attach(container(one));
  assert.deepEqual(one.images[0].listeners, {});
  assert.equal(typeof two.images[0].listeners.load, 'function');
});
