'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const installed = 'C:/my_first_h5p_environment/libraries/h5p-php-library/js';
const repositories = {
  'H5P.AdvancedTextPapiJo': root,
  'H5P.AccordionPapiJo': path.resolve(root, '../papi-jo-h5p-accordion'),
  'H5P.ColumnPapiJo': path.resolve(root, '../papi-jo-h5p-column'),
  'H5P.InteractiveBookPapiJo': path.resolve(root, '../papi-jo-h5p-interactivebook')
};

test('installed H5P upgrade process preserves 1.2 parameters without a migration, including nested parents', async () => {
  assert.equal(fs.existsSync(path.join(root, 'upgrades.js')), false);
  const context = vm.createContext({ H5P: {}, console, setTimeout });
  for (const file of ['h5p-version.js', 'h5p-content-upgrade-process.js']) {
    vm.runInContext(fs.readFileSync(path.join(installed, file), 'utf8'), context);
  }
  const cases = [
    { text: '<p>Plain rich text.</p>' },
    { text: '<p><strong>Bold</strong> <em>italic</em> <a href="https://example.com/">link</a></p>' },
    { text: '<p><span class="papijo-tooltip" data-papijo-tooltip="A &lt;strong&gt;term&lt;/strong&gt;">Tooltip</span></p>' },
    { text: '<p><span class="papijo-tooltip" data-papijo-tooltip="Photo" data-papijo-tooltip-id="legacy-tip">Tooltip image</span></p>',
      tooltipImages: [{ id: 'legacy-tip', image: { path: 'images/legacy.png', mime: 'image/png', width: 32, height: 16 }, alt: 'Legacy photo' }] }
  ];
  const upgrade = (name, from, to, params) => new Promise((resolve, reject) => {
    context.input = JSON.stringify({ params, metadata: { title: 'Legacy content' } });
    context.load = (libraryName, version, next) => {
      const repo = repositories[libraryName];
      assert.ok(repo, libraryName);
      const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'library.json')));
      assert.deepEqual([version.major, version.minor], [manifest.majorVersion, manifest.minorVersion]);
      next(null, { name: libraryName, semantics: JSON.parse(fs.readFileSync(path.join(repo, 'semantics.json'))), upgradesScript: null });
    };
    context.done = (error, result) => error ? reject(error) : resolve(JSON.parse(result));
    context.upgradeName = name; context.from = from; context.to = to;
    vm.runInContext('new H5P.ContentUpgradeProcess(upgradeName, new H5P.Version(from), new H5P.Version(to), input, 1, load, done)', context);
  });
  for (const params of cases) {
    const standalone = await upgrade('H5P.AdvancedTextPapiJo', '1.2', '1.3', params);
    assert.deepEqual(standalone, { params, metadata: { title: 'Legacy content' } });
    assert.equal(Object.hasOwn(standalone.params, 'inlineImages'), false);
    const action = { library: 'H5P.AdvancedTextPapiJo 1.2', params };
    const column = { content: [{ content: action }] };
    const parents = [
      ['H5P.AccordionPapiJo', '1.1', '1.2', { panels: [{ title: 'Legacy', content: action }] }, p => p.panels[0].content],
      ['H5P.ColumnPapiJo', '1.20', '1.21', column, p => p.content[0].content],
      ['H5P.InteractiveBookPapiJo', '1.16', '1.17', { chapters: [{ library: 'H5P.ColumnPapiJo 1.20', params: column }] }, p => p.chapters[0].params.content[0].content]
    ];
    for (const [name, from, to, parent, getChild] of parents) {
      const result = await upgrade(name, from, to, parent);
      const child = getChild(result.params);
      assert.equal(child.library, 'H5P.AdvancedTextPapiJo 1.3');
      assert.deepEqual(child.params, params);
      assert.equal(Object.hasOwn(child.params, 'inlineImages'), false);
      if (name === 'H5P.InteractiveBookPapiJo') {
        assert.equal(result.params.chapters[0].library, 'H5P.ColumnPapiJo 1.21');
      }
    }
    const accordion = { library: 'H5P.AccordionPapiJo 1.1', params: { panels: [{ title: 'Legacy nested', content: action }] } };
    const nestedColumn = { content: [{ content: accordion }] };
    for (const [name, from, to, parent, getAccordion] of [
      ['H5P.ColumnPapiJo', '1.20', '1.21', nestedColumn, p => p.content[0].content],
      ['H5P.InteractiveBookPapiJo', '1.16', '1.17', { chapters: [{ library: 'H5P.ColumnPapiJo 1.20', params: nestedColumn }] }, p => p.chapters[0].params.content[0].content]
    ]) {
      const result = await upgrade(name, from, to, parent);
      assert.deepEqual(result.metadata, { title: 'Legacy content' });
      const upgradedAccordion = getAccordion(result.params);
      assert.equal(upgradedAccordion.library, 'H5P.AccordionPapiJo 1.2');
      const child = upgradedAccordion.params.panels[0].content;
      assert.equal(child.library, 'H5P.AdvancedTextPapiJo 1.3');
      assert.deepEqual(child.params, params);
      assert.equal(Object.hasOwn(child.params, 'inlineImages'), false);
      if (name === 'H5P.InteractiveBookPapiJo') {
        assert.equal(result.params.chapters[0].library, 'H5P.ColumnPapiJo 1.21');
      }
    }
  }
});
