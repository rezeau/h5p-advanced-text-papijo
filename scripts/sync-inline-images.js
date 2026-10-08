'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared', 'advanced-text-papijo-inline-images.js'));
for (const destination of ['advanced-text-papijo-inline-images.js',
  'editor/advanced-text-papijo-inline-images.js']) {
  const target = path.join(root, destination);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || !source.equals(fs.readFileSync(target))) {
      throw new Error('Inline-image contract differs: ' + destination);
    }
  }
  else {
    fs.writeFileSync(target, source);
  }
}
