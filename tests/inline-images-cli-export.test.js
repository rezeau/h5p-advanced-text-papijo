'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { imageFixture, contentFixture } = require('./h5p-inline-image-copy-fixtures');

test('installed CLI content export/reimport is self-contained only for local image references', async () => {
  const cwd = process.cwd();
  const files = contentFixture();
  const temporary = files.root;
  try {
    process.chdir(temporary);
    const logic = require('C:\\nvm4w\\nodejs\\node_modules\\h5p-cli\\logic.js');
    for (const folder of ['text-01', 'acordion-papijo-001', 'col-pj']) {
      // Parameters, metadata and image bytes were built from repository fixtures.
      // Only the actual installed CLI/core code is used from the H5P environment.
      const contentFile = path.join(temporary, 'content', folder, 'content.json');
      const captured = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
      const header = JSON.parse(fs.readFileSync(path.join(temporary, 'content', folder, 'h5p.json'), 'utf8'));
      const archive = await logic.export(header.mainLibrary, folder, true, path.join(temporary, 'exports'));
      const imported = folder + '-reimport';
      assert.equal(logic.import(imported, archive), imported);
      const params = JSON.parse(fs.readFileSync(path.join(temporary, 'content', imported, 'content.json'), 'utf8'));
      const child = folder === 'text-01' ? params : folder === 'col-pj' ? params.content[0].content.params : params.panels[0].content.params;
      const original = folder === 'text-01' ? captured : folder === 'col-pj' ? captured.content[0].content.params : captured.panels[0].content.params;
      assert.deepEqual(child, original, 'Reimport must preserve both stores, IDs, metadata and occurrence state');
      const missing = [];
      for (const store of ['inlineImages', 'tooltipImages']) {
        for (const entry of child[store]) {
          const local = path.resolve(temporary, 'content', imported, entry.image.path);
          if (entry.image.path.startsWith('images/')) {
            assert.ok(fs.existsSync(local), local);
            assert.deepEqual(fs.readFileSync(local), fs.readFileSync(imageFixture(entry.image.path)),
              'Local inline/tooltip images must reimport with identical bytes');
          }
          else {
            assert.equal(entry.image.path.startsWith('../text-01/images/'), true);
            assert.equal(fs.existsSync(path.join(temporary, 'content', imported, 'images', path.basename(entry.image.path))), false,
              'CLI does not include the foreign source file');
            missing.push(store + ':' + entry.image.path);
          }
        }
      }
      assert.equal(missing.length, folder === 'text-01' ? 0 : 6);
      console.log('CLI CONTENT EXPORT/REIMPORT ' + folder + ': ' + (missing.length ?
        'NOT SELF-CONTAINED (' + missing.length + ' foreign inline/tooltip definitions)' : 'SELF-CONTAINED'));
    }
    // Source files only appear accessible above because text-01 was also imported
    // into this test environment. An independent installation has no such source.
    fs.renameSync(path.join(temporary, 'content/text-01'), path.join(temporary, 'source-withheld'));
    for (const folder of ['acordion-papijo-001-reimport', 'col-pj-reimport']) {
      const params = JSON.parse(fs.readFileSync(path.join(temporary, 'content', folder, 'content.json'), 'utf8'));
      const child = folder.startsWith('col') ? params.content[0].content.params : params.panels[0].content.params;
      for (const entry of child.inlineImages.concat(child.tooltipImages).filter(entry => entry.image.path.startsWith('../'))) {
        assert.equal(fs.existsSync(path.resolve(temporary, 'content', folder, entry.image.path)), false);
      }
    }
  }
  finally {
    process.chdir(cwd);
    files.cleanup();
  }
});
