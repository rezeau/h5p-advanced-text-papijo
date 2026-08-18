'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const canonicalPath = path.join(
  root,
  'shared',
  'advanced-text-papijo-tooltip-sanitizer.js'
);
const targetPaths = [
  path.join(root, 'advanced-text-papijo-tooltip-sanitizer.js'),
  path.join(root, 'editor', 'advanced-text-papijo-tooltip-sanitizer.js')
];

function isIdentical(targetPath, source) {
  try {
    return fs.readFileSync(targetPath).equals(source);
  }
  catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function checkCopies(source) {
  const mismatches = targetPaths.filter((targetPath) => {
    return !isIdentical(targetPath, source);
  });

  if (mismatches.length > 0) {
    mismatches.forEach((targetPath) => {
      console.error('Sanitizer copy differs: ' + path.relative(root, targetPath));
    });
    process.exitCode = 1;
    return;
  }

  console.log('Sanitizer copies match the canonical source.');
}

function synchronize(source) {
  targetPaths.forEach((targetPath) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, source);
  });
  console.log('Synchronized sanitizer copies from the canonical source.');
}

const argumentsList = process.argv.slice(2);
if (argumentsList.some((argument) => argument !== '--check')) {
  console.error('Usage: node scripts/sync-sanitizer.js [--check]');
  process.exitCode = 1;
}
else {
  try {
    const source = fs.readFileSync(canonicalPath);
    if (argumentsList.includes('--check')) {
      checkCopies(source);
    }
    else {
      synchronize(source);
    }
  }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
