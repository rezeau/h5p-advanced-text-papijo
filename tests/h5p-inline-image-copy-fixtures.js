'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const environment = 'C:\\my_first_h5p_environment';

// Actual installed functions, not a reimplementation of H5P's clipboard rules.
function clipboardSource() {
  const core = fs.readFileSync(path.join(environment, 'libraries/h5p-php-library/js/h5p.js'), 'utf8');
  const start = core.indexOf('  H5P.ClipboardItem = function');
  const end = core.indexOf('  // Init H5P when page is fully loadded', start);
  assert.ok(start > 0 && end > start, 'Installed clipboard section must be found');
  return core.slice(start, end);
}

function sourceParams() {
  // Historical IDs/occurrences, with deterministic repository-owned images.
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/inline-image-copy-source.json'), 'utf8'));
}

function imageFixture(imagePath) {
  const files = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/inline-image-copy-files.json'), 'utf8'));
  assert.ok(Object.hasOwn(files, imagePath), 'Every semantic image requires repository-owned bytes: ' + imagePath);
  assert.match(imagePath, /^images\/[\w-]+\.svg$/);
  assert.match(files[imagePath], /^[\w-]+\.svg$/);
  return path.join(__dirname, 'fixtures', files[imagePath]);
}

function contentFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'papijo-copy-fixture-'));
  function cleanup() {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('papijo-copy-fixture-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  try {
    fs.mkdirSync(path.join(root, 'temp'));
    const source = sourceParams();
    const core = clipboard();
    core.copy({ library: 'H5P.AdvancedTextPapiJo 1.2', params: source, subContentId: 'fixture-child' }, 'text-01');
    const children = Object.fromEntries(['acordion-papijo-001', 'col-pj', 'interactive-book'].map(id => [id, core.paste(id)]));
    const contents = [
      ['text-01', 'H5P.AdvancedTextPapiJo', 1, 2, source],
      ['acordion-papijo-001', 'H5P.AccordionPapiJo', 1, 1,
        { panels: [{ title: 'Copied child', content: children['acordion-papijo-001'] }] }],
      ['col-pj', 'H5P.ColumnPapiJo', 1, 20,
        { content: [{ content: children['col-pj'], useSeparator: 'auto' }] }],
      ['interactive-book', 'H5P.InteractiveBookPapiJo', 1, 16,
        { chapters: [{ chapter: { library: 'H5P.ColumnPapiJo 1.20', params: {
          content: [{ content: children['interactive-book'], useSeparator: 'auto' }] } } }] }]
    ];
    for (const [id, library, majorVersion, minorVersion, params] of contents) {
      const folder = path.join(root, 'content', id);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'content.json'), JSON.stringify(params));
      fs.writeFileSync(path.join(folder, 'h5p.json'), JSON.stringify({ title: 'Deterministic copy fixture',
        mainLibrary: library, language: 'en', license: 'U', embedTypes: ['div'],
        preloadedDependencies: [{ machineName: library, majorVersion, minorVersion }] }));
    }
    fs.mkdirSync(path.join(root, 'content/text-01/images'));
    for (const entry of source.inlineImages.concat(source.tooltipImages)) {
      fs.copyFileSync(imageFixture(entry.image.path), path.join(root, 'content/text-01', entry.image.path));
    }
    if (t) { t.after(cleanup); }
    return { root, cleanup };
  }
  catch (error) { cleanup(); throw error; }
}

function clipboard() {
  const values = new Map();
  const context = {
    H5P: { externalDispatcher: { trigger() {} } }, H5PEditor: {}, window: {}, console,
    localStorage: { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) }
  };
  context.window.H5PEditor = context.H5PEditor;
  vm.createContext(context);
  vm.runInContext(clipboardSource(), context);
  return {
    copy(params, contentId) {
      context.H5PEditor.contentId = contentId;
      context.input = JSON.stringify(params);
      vm.runInContext('H5P.clipboardify(JSON.parse(input));', context);
      return JSON.parse(values.get('h5pClipboard'));
    },
    paste(contentId, contentRelUrl) {
      context.H5PEditor.contentId = contentId;
      context.H5PEditor.contentRelUrl = contentRelUrl;
      return JSON.parse(vm.runInContext('JSON.stringify(H5P.getClipboard().generic)', context));
    }
  };
}

module.exports = { environment, clipboardSource, sourceParams, clipboard, imageFixture, contentFixture };
