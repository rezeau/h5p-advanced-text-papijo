'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
const library = JSON.parse(fs.readFileSync(path.join(root, 'library.json'), 'utf8'));
const editorLibrary = JSON.parse(fs.readFileSync(path.join(root, 'editor', 'library.json'), 'utf8'));
const english = JSON.parse(fs.readFileSync(path.join(root, 'editor', 'language', 'en.json'), 'utf8'));
const french = JSON.parse(fs.readFileSync(path.join(root, 'editor', 'language', 'fr.json'), 'utf8'));
const widgetSource = fs.readFileSync(
  path.join(root, 'editor', 'advanced-text-papijo-tooltip.js'),
  'utf8'
);
const runtimeSanitizerSource = fs.readFileSync(
  path.join(root, 'advanced-text-papijo-tooltip-sanitizer.js'),
  'utf8'
);
const editorSanitizerSource = fs.readFileSync(
  path.join(root, 'editor', 'advanced-text-papijo-tooltip-sanitizer.js'),
  'utf8'
);

function createWidget() {
  function Html(parent, field, params, setValue) {
    this.parent = parent;
    this.field = field;
    this.value = params;
    this.setValue = setValue;
  }

  Html.prototype.getCKEditorConfig = function () {
    return {
      plugins: ['Essentials', 'Paragraph'],
      toolbar: ['bold']
    };
  };

  const H5PEditor = {
    Html,
    widgets: {},
    t: (_library, key) => english.libraryStrings[key]
  };
  vm.runInNewContext(widgetSource, { H5PEditor });

  return new H5PEditor.widgets.advancedTextPapiJoTooltip(
    {},
    semantics[0],
    '<p>Existing content</p>',
    () => {}
  );
}

test('registers a custom widget while retaining the standard HTML configuration', () => {
  const widget = createWidget();
  const config = widget.getCKEditorConfig();

  assert.deepEqual(Array.from(config.toolbar), ['bold']);
  assert.ok(config.plugins.includes('Essentials'));
  assert.ok(config.plugins.includes('Paragraph'));
  assert.ok(config.plugins.includes('GeneralHtmlSupport'));
});

test('allows only the Phase 1A tooltip span metadata', () => {
  const config = createWidget().getCKEditorConfig();

  assert.deepEqual(JSON.parse(JSON.stringify(config.htmlSupport.allow)), [{
    name: 'span',
    classes: ['papijo-tooltip'],
    attributes: {
      'data-papijo-tooltip': true
    }
  }]);
});

test('registers the tooltip command plugin and sanitizer contract', () => {
  const widget = createWidget();
  const config = widget.getCKEditorConfig();
  const commandPlugins = config.plugins.filter((plugin) => typeof plugin === 'function');

  assert.equal(commandPlugins.length, 1);
  assert.equal(typeof widget.constructor.validateTooltipText, 'function');
  assert.equal(runtimeSanitizerSource, editorSanitizerSource);
});

test('declares model commands for create, edit, and remove', () => {
  const Widget = createWidget().constructor;

  assert.equal(Widget.CREATE_COMMAND, 'createPapijoTooltip');
  assert.equal(Widget.EDIT_COMMAND, 'editPapijoTooltip');
  assert.equal(Widget.REMOVE_COMMAND, 'removePapijoTooltip');
  assert.equal(typeof Widget.detectExistingTooltip, 'function');
});

test('loads complete English and French editor translations', () => {
  const required = [
    'createTooltip',
    'editTooltip',
    'removeTooltip',
    'tooltipText',
    'applyTooltip',
    'updateTooltip',
    'cancel',
    'selectionMustStayInOneTableCell',
    'selectionCrossesTooltipBoundary',
    'selectionContainsTooltip',
    'tooltipUpdated',
    'tooltipRemoved'
  ];

  required.forEach((key) => {
    assert.equal(typeof english.libraryStrings[key], 'string');
    assert.ok(english.libraryStrings[key].length > 0);
    assert.equal(typeof french.libraryStrings[key], 'string');
    assert.ok(french.libraryStrings[key].length > 0);
  });
  assert.equal(english.libraryStrings.createTooltip, 'Create tooltip');
  assert.equal(french.libraryStrings.createTooltip, 'Créer une infobulle');
});

test('declares the widget, span tag, dependency, and release versions', () => {
  assert.equal(semantics[0].widget, 'advancedTextPapiJoTooltip');
  assert.ok(semantics[0].tags.includes('span'));
  assert.equal(library.patchVersion, 14);
  assert.deepEqual(library.editorDependencies, [{
    machineName: 'H5PEditor.AdvancedTextPapiJoTooltip',
    majorVersion: 1,
    minorVersion: 0
  }]);
  assert.equal(editorLibrary.runnable, 0);
  assert.equal(editorLibrary.machineName, 'H5PEditor.AdvancedTextPapiJoTooltip');
  assert.deepEqual(editorLibrary.preloadedCss, [{
    path: 'advanced-text-papijo-tooltip.css'
  }]);
  assert.deepEqual(library.preloadedJs, [
    { path: 'advanced-text-papijo-tooltip-sanitizer.js' },
    { path: 'advanced-text-papijo-speech-bubble.js' },
    { path: 'advanced-text-papijo-tooltip-runtime.js' },
    { path: 'text.js' }
  ]);
  assert.deepEqual(editorLibrary.preloadedJs, [
    { path: 'advanced-text-papijo-tooltip-sanitizer.js' },
    { path: 'advanced-text-papijo-tooltip.js' }
  ]);
  assert.deepEqual(library.preloadedCss, [
    { path: 'text.css' },
    { path: 'advanced-text-papijo-speech-bubble.css' },
    { path: 'advanced-text-papijo-tooltip-runtime.css' }
  ]);
});
