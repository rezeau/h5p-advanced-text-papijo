'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const runtimeSource = fs.readFileSync(path.join(root, 'text.js'), 'utf8');
const runtimeCssSource = fs.readFileSync(path.join(root, 'text.css'), 'utf8');
const speechBubbleCssSource = fs.readFileSync(
  path.join(root, 'advanced-text-papijo-speech-bubble.css'),
  'utf8'
);

test('uses the primary text color for a themed root with a safe fallback', () => {
  const rootRule = runtimeCssSource.match(
    /\.h5p-theme\s+\.h5p-advanced-text\s*\{([^}]*)\}/
  );

  assert.ok(rootRule, 'the themed authored text root must have a color rule');
  assert.match(
    rootRule[1],
    /color:\s*var\(--h5p-theme-text-primary,\s*inherit\)\s*;/
  );
  assert.doesNotMatch(rootRule[1], /background(?:-color)?\s*:/);
  assert.doesNotMatch(runtimeCssSource, /\.h5p-advanced-text\s+\*/);
  assert.doesNotMatch(runtimeCssSource, /!important/);
});

test('keeps the speech bubble light theme independent from authored text', () => {
  const bubbleRule = speechBubbleCssSource.match(
    /\.papijo-runtime-speech-bubble\s*\{([^}]*)\}/
  );

  assert.ok(bubbleRule, 'the speech bubble must retain its own color rule');
  assert.match(bubbleRule[1], /background:\s*#fff\s*;/);
  assert.match(bubbleRule[1], /color:\s*#222\s*;/);
});

function createRuntime(parameters) {
  function EventDispatcher() {}
  EventDispatcher.prototype = {};

  const H5P = {
    EventDispatcher,
    jQuery: function () {}
  };
  vm.runInNewContext(runtimeSource, { H5P });

  const instance = new H5P.AdvancedTextPapiJo(parameters, 1);
  let attachedClass;
  let attachedHtml;
  const container = {
    addClass(value) {
      attachedClass = value;
      return this;
    },
    html(value) {
      attachedHtml = value;
      return this;
    }
  };
  instance.attach(container);

  return { attachedClass, attachedHtml };
}

test('renders a normal text parameter', () => {
  const result = createRuntime({ text: '<p>Normal text</p>' });

  assert.equal(result.attachedClass, 'h5p-advanced-text');
  assert.equal(result.attachedHtml, '<p>Normal text</p>');
});

test('preserves an explicitly empty text string', () => {
  assert.equal(createRuntime({ text: '' }).attachedHtml, '');
});

test('uses the established fallback when text is missing', () => {
  assert.equal(createRuntime({}).attachedHtml, '<em>New text</em>');
  assert.equal(createRuntime({ text: null }).attachedHtml, '<em>New text</em>');
});

test('accepts undefined and null constructor parameters', () => {
  assert.equal(createRuntime(undefined).attachedHtml, '<em>New text</em>');
  assert.equal(createRuntime(null).attachedHtml, '<em>New text</em>');
});

test('accepts the empty child params supplied by AccordionPapiJo', () => {
  const accordionChild = {
    params: {},
    library: 'H5P.AdvancedTextPapiJo 1.1',
    subContentId: 'fbd676e9-858c-40ab-8b14-386350a6961f'
  };

  assert.equal(
    createRuntime(accordionChild.params).attachedHtml,
    '<em>New text</em>'
  );
});

test('keeps responsive table wrapping behavior intact', () => {
  const result = createRuntime({
    text: '<p>Before</p><table><tbody><tr><td>Cell</td></tr></tbody></table>'
  });

  assert.equal(
    result.attachedHtml,
    '<p>Before</p><div style="overflow-x:auto; padding-bottom: 0.6em;"><table><tbody><tr><td>Cell</td></tr></tbody></table></div>'
  );
});
