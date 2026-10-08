'use strict';

// Requires Playwright from the local runtime (or NODE_PATH); no package installation.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const paths = ['/inline-images.html', '/', '/phase1b.html', '/phase1c.html',
  '/table-sort.html', '/selection-validation.html', '/integration-stability.html',
  '/phase1d-runtime.html', '/phase1f-editor.html', '/phase1f-runtime.html',
  '/r0-characterization.html', '/r2-lifecycle.html', '/r3-selection-classifier.html',
  '/r5-runtime-lifecycle.html'];

(async () => {
  let server;
  let origin = process.argv[2];
  if (origin === '--local') {
    server = spawn(process.execPath, [path.join(__dirname, 'phase1a-harness-server.js')], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'inherit']
    });
    origin = await new Promise((resolve, reject) => {
      server.stdout.on('data', data => {
        const match = String(data).match(/PHASE1A_HARNESS_URL=(http:\/\/127\.0\.0\.1:\d+\/)/);
        if (match) { resolve(match[1]); }
      });
      server.on('error', reject);
      server.on('exit', code => reject(Error('Harness server exited: ' + code)));
    });
  }
  if (!origin || !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(origin)) {
    throw Error('Usage: node tests/run-browser-harnesses.js http://127.0.0.1:<port>');
  }
  let browser;
  let failed = false;
  try {
    browser = await chromium.launch({ channel: process.env.PAPIJO_BROWSER_CHANNEL || 'msedge', headless: true });
    for (const route of process.argv[3] ? [process.argv[3]] : paths) {
      for (const width of route === '/inline-images.html' ? [1280, 160, 480] : [1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.exposeFunction('papijoHarnessPressKey', async (selector, key) => {
          await page.locator(selector).press(key);
        });
        page.on('request', request => {
          if (route === '/inline-images.html' && request.resourceType() === 'image' &&
              request.url().startsWith('https://example.com/')) {
            failed = true;
            console.error('Unmanaged test image was requested: ' + request.url());
          }
        });
        page.on('pageerror', error => {
          failed = true;
          console.error(route + ' PAGE ERROR: ' + error.message);
        });
        try {
          await page.goto(new URL(route, origin).href);
          await page.waitForFunction(() => ['pass', 'fail'].includes(document.documentElement.dataset.testStatus), null, { timeout: 60000 });
          const status = await page.locator('html').getAttribute('data-test-status');
          if (status !== 'pass') {
            failed = true;
            console.error(route + '\n' + await page.locator('#result').innerText());
          }
          else { console.log('PASS ' + route + (route === '/inline-images.html' ? ' viewport=' + width : '')); }
        }
        catch (error) { failed = true; console.error(route + ': ' + error.message); }
        finally { await page.close(); }
      }
    }
  }
  finally { if (browser) { await browser.close(); } if (server) { server.kill(); } }
  if (failed) { process.exitCode = 1; }
})().catch(error => { console.error(error); process.exitCode = 1; });
