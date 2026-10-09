'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const fixtures = require('./h5p-inline-image-copy-fixtures');
const scope = { URL };
vm.runInNewContext(fs.readFileSync('shared/advanced-text-papijo-inline-images.js', 'utf8'), scope);
const m = scope.PapijoManagedInlineImages;

test('caption preserves literal punctuation, Unicode and internal ordinary spaces', () => {
  for (const value of ['Rabbit: garden', "Apostrophe's", '"Quote" & <b>literal</b>', 'https://example.org',
    'Été français', '🐇👩‍👩‍👧‍👦', 'Two  ordinary   spaces', 'French\u00a0space\u202f!', 'e\u0301']) {
    assert.equal(m.normalizeCaption(value), value);
  }
  assert.equal(m.normalizeCaption('  text  '), 'text');
  assert.equal(m.normalizeCaption('a\r\nb\rc\nd\te\u0085f\u2028g\u2029h'), 'a b c d e f g h');
});
test('caption blank input removes state and invalid input is rejected without truncation', () => {
  for (const value of [undefined, null, '', '  \t\n', '\u00a0\u202f', '\u200b\u200d\u2060']) {
    assert.equal(m.validateCaption(value).value, null); assert.equal(m.validateCaption(value).error, null);
  }
  for (const value of [42, {}, '\u0000', '\u000b', '\u007f', '\u009f', '\ud800', '\udc00']) {
    assert.equal(m.validateCaption(value).error, 'invalid');
  }
  assert.equal(m.validateCaption('🐇'.repeat(1000)).value, '🐇'.repeat(1000));
  assert.equal(m.validateCaption('🐇'.repeat(1001)).error, 'length');
  assert.equal(m.normalizeCaption('  ' + 'a'.repeat(1000) + '  ').length, 1000);
});
test('caption display metrics retain intrinsic/default width and reserve only explicit caption footprint', () => {
  for (const basis of [1280, 600, 320, 160]) for (const natural of [32, 128, 1800, 240]) {
    for (const gutter of [0, 12]) for (const percentage of [null, 100, 75, 55.5, 25, 10, 5, 2, 1, 0.5, 0.1]) {
      const size = m.captionSize(natural, basis, gutter, percentage, 16);
      const actual = Math.min(natural, basis - gutter, percentage === null ? basis - gutter : basis * percentage / 100);
      assert.equal(size.image, actual);
      assert.equal(size.unit, percentage === null ? actual : Math.min(basis - gutter, Math.max(actual, 128)));
      assert.ok(size.image <= natural && size.unit <= basis - gutter);
    }
  }
});
test('caption canonical reader rejects duplicate, nested, attributed and unrelated structures', () => {
  const text = data => ({ nodeType: 3, data });
  const child = (value, attrs = ['class'], nested) => ({ nodeType: 1, nodeName: 'SPAN', attributes: attrs,
    getAttribute: key => key === 'class' ? m.captionClass : null, textContent: value,
    childNodes: nested || [text(value)] });
  const marker = nodes => ({ childNodes: nodes });
  assert.equal(m.readCaption(marker([text('\n '), child('Rabbit: garden'), text(' ')])), 'Rabbit: garden');
  for (const nodes of [[], [child('A'), child('B')], [child('A', ['class', 'onclick'])],
    [child('A', ['class'], [{ nodeType: 1 }])], [text('outside'), child('A')], [child('x'.repeat(1001))]]) {
    assert.equal(m.readCaption(marker(nodes)), null);
  }
});
test('caption manifest, shared contract and localized labels match without schema/version changes', () => {
  const editor = JSON.parse(fs.readFileSync('editor/library.json'));
  const paths = editor.preloadedJs.map(x => x.path);
  assert.ok(paths.indexOf('advanced-text-papijo-inline-image-caption.js') > paths.indexOf('advanced-text-papijo-inline-image-paragraph.js'));
  assert.ok(paths.indexOf('advanced-text-papijo-inline-image-caption.js') < paths.indexOf('advanced-text-papijo-inline-image.js'));
  const en = JSON.parse(fs.readFileSync('editor/language/en.json')).libraryStrings;
  const fr = JSON.parse(fs.readFileSync('editor/language/fr.json')).libraryStrings;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const key of ['addImageCaption', 'editImageCaption', 'imageCaption', 'applyCaption', 'removeImageCaption',
    'captionInvalid', 'captionTooLong', 'captionTargetUnavailable']) assert.ok(en[key] && fr[key]);
  assert.deepEqual(JSON.parse(fs.readFileSync('semantics.json'))[2].field.fields.map(x => x.name), ['id', 'image', 'alt']);
  for (const file of ['advanced-text-papijo-inline-images.js', 'editor/advanced-text-papijo-inline-images.js']) {
    assert.equal(fs.readFileSync(file, 'utf8'), fs.readFileSync('shared/advanced-text-papijo-inline-images.js', 'utf8'));
  }
});
test('captioned occurrences and retained definitions survive actual same/cross/nested content clipboard', t => {
  const files = fixtures.contentFixture(t), source = fixtures.sourceParams();
  const definition = source.inlineImages[3];
  const marker = caption => '<span class="papijo-inline-image" data-papijo-inline-image-id="' + definition.id +
    '" data-papijo-inline-image-width="0.1" data-papijo-inline-image-link="https://example.org/image">' +
    (caption ? '<span class="papijo-image-caption">' + caption + '</span>' : '') + '</span>';
  const text = '<p>' + marker('Caption A: été') + marker('') + marker('Caption B &amp; two  spaces') + '</p>';
  const child = { library: 'H5P.AdvancedTextPapiJo 1.2', subContentId: 'caption-child', params: { text, inlineImages: source.inlineImages } };
  const column = { library: 'H5P.ColumnPapiJo 1.20', params: { content: [{ content: child }] } };
  const hosts = [child, { library: 'H5P.AccordionPapiJo 1.1', params: { panels: [{ title: 'Caption', content: child }] } },
    column, { library: 'H5P.InteractiveBookPapiJo 1.16', params: { chapters: [{ chapter: column }] } }];
  function find(value) {
    if (!value || typeof value !== 'object') return;
    if (value.library === child.library) return value.params;
    return Object.values(value).map(find).find(Boolean);
  }
  for (const host of hosts) for (const destination of ['text-01', 'acordion-papijo-001', 'col-pj', 'interactive-book']) {
    const clipboard = fixtures.clipboard(); clipboard.copy(host, 'text-01'); const pasted = find(clipboard.paste(destination));
    assert.equal(pasted.text, text); assert.equal(pasted.inlineImages.length, source.inlineImages.length);
    for (const entry of pasted.inlineImages) {
      assert.deepEqual(Object.keys(entry), ['id', 'image', 'alt']);
      assert.ok(fs.existsSync(path.resolve(files.root, 'content', destination, entry.image.path)));
    }
  }
});
