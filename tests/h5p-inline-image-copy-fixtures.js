'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  // Captured source parameters: manual testing can change installed content.
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/inline-image-copy-source.json'), 'utf8'));
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

module.exports = { environment, clipboardSource, sourceParams, clipboard };
