'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const fixtureFiles = require('./h5p-inline-image-copy-fixtures');
const scope = { H5PEditor: {} };
vm.runInNewContext(fs.readFileSync('editor/advanced-text-papijo-inline-image-paragraph.js', 'utf8'), scope);
const { assess } = scope.H5PEditor.AdvancedTextPapiJoInlineImageParagraph;
function fixture(left = '', right = '', leftAttrs = {}, rightAttrs = {}) {
  const root = { rootName: 'main', isAttached: () => true };
  function element(name, attrs = {}) { return { is: (type, value) => type === 'element' && name === value, getAttributeKeys: () => Object.keys(attrs) }; }
  function text(data, attrs) { return { data, is: type => type === '$text', getAttributeKeys: () => Object.keys(attrs) }; }
  const paragraph = { ...element('paragraph'), parent: root };
  const image = { ...element('imageInline'), parent: paragraph, root };
  const children = [...(left ? [text(left, leftAttrs)] : []), image, ...(right ? [text(right, rightAttrs)] : [])];
  paragraph.getChildren = () => children;
  const editor = { isReadOnly: false, model: { document: { getRoot: () => root }, canEditAt: () => true,
    createPositionBefore: node => ({ parent: node.parent }), schema: { checkChild: () => true } } };
  return { editor, image, paragraph, children, root, check: () => assess(editor, image, () => true) };
}
test('root-only eligibility distinguishes one image from mixed text without blanket trimming', () => {
  assert.equal(fixture().check().mode, 'only');
  const mixed = fixture('Some  text   ', '   more  text', { bold: true }, { italic: true });
  assert.equal(mixed.check().mode, 'mixed');
  assert.equal(mixed.check().left, 3); assert.equal(mixed.check().right, 3);
  assert.equal(mixed.children[0].data, 'Some  text   ');
  assert.equal(fixture(' ', ' ').check().mode, 'mixed');
});
test('adjacent special whitespace defers extraction; internal special whitespace is preserved', () => {
  for (const value of ['\u00a0', '\t', '\n', '\u2003', '\u0085', '\u200b', '\u2060', ' \u00a0 ']) {
    assert.equal(fixture('Text' + value, '').check(), null);
    assert.equal(fixture('', value + 'Text').check(), null);
  }
  assert.equal(fixture('Two\u00a0words ', ' more').check().left, 1);
});
test('only ordinary visual/link separators normalize; semantic/code/GHS boundary state defers', () => {
  assert.equal(fixture('Text ', ' text', { bold: true, linkHref: 'https://example.org' }).check().left, 1);
  for (const attrs of [{ htmlSpan: {} }, { code: true }, { customAnnotation: 'x' }]) {
    assert.equal(fixture('Text ', '', attrs).check(), null);
    assert.equal(fixture('', ' text', {}, attrs).check(), null);
    assert.equal(fixture('Annotated text', '', attrs).check().mode, 'mixed');
  }
});
test('lists, tables, headings, soft breaks and multiple images cannot masquerade as ordinary root paragraphs', () => {
  for (const key of ['listType', 'listIndent', 'listItemId', 'htmlP']) {
    const f = fixture(); f.paragraph.getAttributeKeys = () => [key]; assert.equal(f.check(), null);
  }
  let f = fixture(); f.paragraph.parent = { name: 'tableCell' }; assert.equal(f.check(), null);
  f = fixture(); f.paragraph.is = () => false; assert.equal(f.check(), null);
  for (const name of ['softBreak', 'imageInline', 'otherInlineObject']) {
    f = fixture(); f.children.push({ is: (type, value) => type === 'element' && value === name }); assert.equal(f.check(), null);
  }
});
test('unresolved, detached, read-only, noneditable and schema-disallowed images are rejected', () => {
  let f = fixture(); assert.equal(assess(f.editor, f.image, () => false), null);
  f = fixture(); f.root.isAttached = () => false; assert.equal(f.check(), null);
  f = fixture(); f.editor.isReadOnly = true; assert.equal(f.check(), null);
  f = fixture(); f.editor.model.canEditAt = () => false; assert.equal(f.check(), null);
  f = fixture(); f.editor.model.schema.checkChild = () => false; assert.equal(f.check(), null);
});
test('paragraph controller is an editor-only manifest asset before adapter; all four labels synchronize', () => {
  const editor = JSON.parse(fs.readFileSync('editor/library.json'));
  const runtime = JSON.parse(fs.readFileSync('library.json'));
  const paths = editor.preloadedJs.map(a => a.path);
  assert.ok(paths.indexOf('advanced-text-papijo-inline-image-resize.js') < paths.indexOf('advanced-text-papijo-inline-image-paragraph.js'));
  assert.ok(paths.indexOf('advanced-text-papijo-inline-image-paragraph.js') < paths.indexOf('advanced-text-papijo-inline-image.js'));
  assert.ok(!runtime.preloadedJs.some(a => a.path.includes('paragraph')));
  assert.deepEqual([runtime.majorVersion, runtime.minorVersion, runtime.patchVersion], [1, 3, 0]);
  assert.deepEqual([editor.majorVersion, editor.minorVersion, editor.patchVersion], [1, 2, 0]);
  const en = JSON.parse(fs.readFileSync('editor/language/en.json')).libraryStrings;
  const fr = JSON.parse(fs.readFileSync('editor/language/fr.json')).libraryStrings;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const key of ['imageParagraphActions', 'separateImageParagraph', 'insertImageParagraphBefore', 'insertImageParagraphAfter']) {
    assert.ok(en[key] && fr[key]);
  }
});

test('paragraph output and occurrence state survive installed clipboard inside Accordion, Column and InteractiveBook', t => {
  const files = fixtureFiles.contentFixture(t);
  const definition = fixtureFiles.sourceParams().inlineImages[3];
  const text = '<p><strong>Before</strong></p><p><span class="papijo-inline-image" data-papijo-inline-image-id="' + definition.id +
    '" data-papijo-inline-image-style="alignRight" data-papijo-inline-image-width="55.5" data-papijo-inline-image-link="https://example.org/image"></span></p><p>After</p><p></p>';
  const child = { library: 'H5P.AdvancedTextPapiJo 1.3', subContentId: 'paragraph-child', params: { text, inlineImages: [definition] } };
  const column = { library: 'H5P.ColumnPapiJo 1.21', params: { content: [{ content: child, useSeparator: 'auto' }] } };
  const bookSemantics = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../papi-jo-h5p-interactivebook/semantics.json')));
  assert.ok(bookSemantics.find(field => field.name === 'chapters').field.fields.find(field => field.name === 'chapter').options.includes(column.library));
  const hosts = [
    { library: 'H5P.AccordionPapiJo 1.2', params: { panels: [{ title: 'Paragraph child', content: child }] } },
    column,
    { library: 'H5P.InteractiveBookPapiJo 1.17', params: { chapters: [column] } }
  ];
  function findChild(value) {
    if (!value || typeof value !== 'object') { return undefined; }
    if (value.library === child.library) { return value; }
    return Object.values(value).map(findChild).find(Boolean);
  }
  for (const host of hosts) {
    const core = fixtureFiles.clipboard(); core.copy(host, 'text-01');
    for (const destination of ['acordion-papijo-001', 'col-pj', 'interactive-book']) {
      const pasted = core.paste(destination), item = findChild(pasted);
      assert.equal(item.params.text, text);
      assert.equal(item.subContentId, undefined);
      assert.equal(item.params.inlineImages.length, 1);
      const retained = item.params.inlineImages[0];
      assert.deepEqual({ ...retained, image: { ...retained.image, path: definition.image.path } }, definition);
      assert.ok(fs.existsSync(path.resolve(files.root, 'content', destination, retained.image.path)));
      core.copy(pasted, destination);
    }
  }
});
