'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const fixture = require('./h5p-inline-image-copy-fixtures');
const context = { URL };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/advanced-text-papijo-inline-images.js'), 'utf8'), context);
const managed = context.PapijoManagedInlineImages;

test('image links canonicalize explicit HTTP/HTTPS without losing query or fragment', () => {
  for (const [input, expected] of [
    ['https://example.com/a?q=1&b=2#details', 'https://example.com/a?q=1&b=2#details'],
    ['HTTP://EXAMPLE.COM', 'http://example.com/'],
    [' https://example.com/ ', 'https://example.com/'],
    ['https://example.com/a%20b?q=%26#part', 'https://example.com/a%20b?q=%26#part'],
    ['https://[::1]:8080/path', 'https://[::1]:8080/path'],
    ['https://example.com/été', 'https://example.com/%C3%A9t%C3%A9']
  ]) { assert.equal(managed.normalizeLink(input), expected); assert.equal(managed.normalizeLink(expected), expected); }
});

test('image links reject every deferred scheme and relative form', () => {
  for (const value of ['javascript:x', 'data:text/html,x', 'blob:https://example.com/id', 'file:///C:/x',
    'ftp://example.com', 'ftps://example.com', 'mailto:a@example.com', 'tel:+33123', '//example.com',
    '/path', '../path', '#section', 'example.com', '', null, undefined, {}, 42]) {
    assert.equal(managed.normalizeLink(value), null, String(value));
  }
});

test('image links reject malformed and obfuscated authorities/schemes', () => {
  for (const value of ['JaVaScRiPt:x', 'java\nscript:x', '%6aavascript:x', 'java%73cript:x',
    'jav&#x61;script:x', 'jav&amp;#x61;script:x', 'https&#58;//example.com', 'https%3a//example.com',
    'https://', 'https:///example.com', 'https:////example.com', 'https:\\example.com',
    'https://example.com:', 'https://example.com:99999', 'https://%ZZ', 'https://example.com/%ZZ']) {
    assert.equal(managed.normalizeLink(value), null, value);
  }
});

test('image links reject credentials, controls, whitespace, backslashes and markup', () => {
  for (const value of ['https://user:secret@example.com', 'http://user@example.com', 'https://@example.com',
    'https://example.com/\u0000', '\nhttps://example.com', 'https://example.com/\u007f', 'https://example.com/\ufffd',
    'https://example.com/a b', 'https://example.com/a\u00a0b', 'https://example.com/a\\b',
    'https://example.com/<svg>', 'https://example.com/"x', "https://example.com/'x", 'https://example.com/`x']) {
    assert.equal(managed.normalizeLink(value), null, value);
  }
});

test('link contract does not change definition fields or managed file path validation', () => {
  const definition = fixture.sourceParams().inlineImages[3];
  assert.deepEqual(Object.keys(definition).sort(), ['alt', 'id', 'image']);
  assert.equal(managed.validDefinition(definition), true);
  assert.equal(managed.linkAttribute, 'data-papijo-inline-image-link');
  const semantics = JSON.parse(fs.readFileSync(path.join(__dirname, '../semantics.json'), 'utf8'));
  assert.deepEqual(semantics.find(x => x.name === 'inlineImages').field.fields.map(x => x.name), ['id', 'image', 'alt']);
});

test('installed H5P clipboard preserves independent X/Y/unlinked occurrences and physical references', t => {
  const files = fixture.contentFixture(t);
  const source = fixture.sourceParams(), id = source.inlineImages[3].id;
  source.text = '<p>' + ['https://example.com/X?q=1&amp;b=2#x', 'http://example.com/Y', null].map(href =>
    '<span class="papijo-inline-image" data-papijo-inline-image-id="' + id + '"' +
    (href ? ' data-papijo-inline-image-link="' + href + '"' : '') + '></span>').join(' ') + '</p>';
  const before = JSON.stringify(source.inlineImages);
  const core = fixture.clipboard(); core.copy({ library: 'H5P.AdvancedTextPapiJo 1.2', params: source, subContentId: 'source-child' }, 'text-01');
  for (const destination of ['text-01', 'acordion-papijo-001', 'col-pj', 'interactive-book']) {
    const pasted = core.paste(destination);
    assert.equal(pasted.params.text, source.text);
    assert.equal(pasted.subContentId, undefined);
    for (const entry of pasted.params.inlineImages) {
      assert.ok(managed.validDefinition(entry));
      assert.ok(fs.existsSync(path.resolve(files.root, 'content', destination, entry.image.path)));
      assert.equal(Object.hasOwn(entry, 'link'), false);
    }
    core.copy(pasted, destination);
  }
  assert.equal(JSON.stringify(source.inlineImages), before);
});
