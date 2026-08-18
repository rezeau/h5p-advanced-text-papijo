'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const routes = {
  '/': path.join(__dirname, 'phase1a-ckeditor-harness.html'),
  '/phase1b.html': path.join(__dirname, 'phase1b-ckeditor-harness.html'),
  '/phase1c.html': path.join(__dirname, 'phase1c-ckeditor-harness.html'),
  '/integration-stability.html': path.join(__dirname, 'integration-stability-harness.html'),
  '/selection-validation.html': path.join(__dirname, 'selection-validation-harness.html'),
  '/phase1d-runtime.html': path.join(__dirname, 'phase1d-runtime-harness.html'),
  '/phase1f-editor.html': path.join(__dirname, 'phase1f-editor-harness.html'),
  '/phase1f-runtime.html': path.join(__dirname, 'phase1f-runtime-harness.html'),
  '/jquery.js': 'C:\\my_first_h5p_environment\\libraries\\h5p-php-library\\js\\jquery.js',
  '/ckeditor.js': 'C:\\my_first_h5p_environment\\libraries\\h5p-editor-php-library\\ckeditor\\ckeditor.js',
  '/h5peditor-html.js': 'C:\\my_first_h5p_environment\\libraries\\h5p-editor-php-library\\scripts\\h5peditor-html.js',
  '/advanced-text-papijo-tooltip.js': path.join(
    root,
    'editor',
    'advanced-text-papijo-tooltip.js'
  ),
  '/advanced-text-papijo-tooltip-sanitizer.js': path.join(
    root,
    'advanced-text-papijo-tooltip-sanitizer.js'
  ),
  '/text.js': path.join(root, 'text.js'),
  '/advanced-text-papijo-speech-bubble.js': path.join(root, 'advanced-text-papijo-speech-bubble.js'),
  '/advanced-text-papijo-tooltip-runtime.js': path.join(root, 'advanced-text-papijo-tooltip-runtime.js'),
  '/advanced-text-papijo-speech-bubble.css': path.join(root, 'advanced-text-papijo-speech-bubble.css'),
  '/advanced-text-papijo-tooltip-runtime.css': path.join(root, 'advanced-text-papijo-tooltip-runtime.css'),
  '/accordion.js': 'C:\\my_first_h5p_environment\\libraries\\H5P.AccordionPapiJo-1.0\\h5p-accordion.js',
  '/semantics.json': path.join(root, 'semantics.json'),
  '/language/en.json': path.join(root, 'editor', 'language', 'en.json'),
  '/language/fr.json': path.join(root, 'editor', 'language', 'fr.json')
};

const server = http.createServer((request, response) => {
  const filePath = routes[request.url];

  if (!filePath) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  const contentType = filePath.endsWith('.html') ? 'text/html' :
    filePath.endsWith('.json') ? 'application/json' :
      filePath.endsWith('.css') ? 'text/css' : 'text/javascript';
  response.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  console.log('PHASE1A_HARNESS_URL=http://127.0.0.1:' + address.port + '/');
});
