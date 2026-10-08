'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { environment, sourceParams, clipboard } = require('./h5p-inline-image-copy-fixtures');

test('installed CLI content export/reimport is self-contained only for local image references', async () => {
  const cwd = process.cwd();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'papijo-cli-export-'));
  try {
    fs.mkdirSync(path.join(temporary, 'temp'));
    fs.mkdirSync(path.join(temporary, 'content'));
    process.chdir(temporary);
    const logic = require('C:\\nvm4w\\nodejs\\node_modules\\h5p-cli\\logic.js');
    for (const folder of ['text-01', 'acordion-papijo-001', 'col-pj']) {
      // Isolated copies only. No installed content, CLI config, or library writes.
      fs.cpSync(path.join(environment, 'content', folder), path.join(temporary, 'content', folder), { recursive: true });
      // Build the copied child in the isolated folder using the actual clipboard.
      // Do not depend on a user leaving a particular panel in their live fixture.
      const source = sourceParams();
      const contentFile = path.join(temporary, 'content', folder, 'content.json');
      const captured = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
      if (folder === 'text-01') { fs.writeFileSync(contentFile, JSON.stringify(source)); }
      else {
        const core = clipboard();
        core.copy({ library: 'H5P.AdvancedTextPapiJo 1.2', params: source }, 'text-01');
        const action = core.paste(folder);
        if (folder === 'col-pj') { captured.content = [{ content: action, useSeparator: 'auto' }]; }
        else { captured.panels = [{ title: 'Copied child', content: action }]; }
        fs.writeFileSync(contentFile, JSON.stringify(captured));
      }
      const header = JSON.parse(fs.readFileSync(path.join(temporary, 'content', folder, 'h5p.json'), 'utf8'));
      const archive = await logic.export(header.mainLibrary, folder, true, path.join(temporary, 'exports'));
      const imported = folder + '-reimport';
      assert.equal(logic.import(imported, archive), imported);
      const params = JSON.parse(fs.readFileSync(path.join(temporary, 'content', imported, 'content.json'), 'utf8'));
      const child = folder === 'text-01' ? params : folder === 'col-pj' ? params.content[0].content.params : params.panels[0].content.params;
      const missing = [];
      for (const store of ['inlineImages', 'tooltipImages']) {
        for (const entry of child[store]) {
          const local = path.resolve(temporary, 'content', imported, entry.image.path);
          if (entry.image.path.startsWith('images/')) { assert.ok(fs.existsSync(local), local); }
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
    const resolved = fs.realpathSync(temporary);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('papijo-cli-export-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
