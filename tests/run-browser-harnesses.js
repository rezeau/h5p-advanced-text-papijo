'use strict';

// Requires Playwright from the local runtime (or NODE_PATH); no package installation.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const paths = ['/inline-images.html', '/managed-link-frame.html', '/', '/phase1b.html', '/phase1c.html',
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
      const framed = route === '/managed-link-frame.html';
      const imageRoute = route.startsWith('/inline-images.html') || framed;
      const widths = process.env.PAPIJO_HARNESS_WIDTHS ? process.env.PAPIJO_HARNESS_WIDTHS.split(',').map(Number) : [1280, 160, 320, 480];
      for (const width of imageRoute ? widths : [1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const controls = framed ? page.frameLocator('#papijo-editor-frame') : page;
        const navigations = [];
        // A 204 records the actual default navigation request without replacing
        // the disposable document or contacting the destination server.
        await page.context().route('https://example.com/papijo-editor-click-probe**', async requestRoute => {
          const request = requestRoute.request();
          let context = 'new-window';
          try {
            const frame = request.frame();
            context = frame.page() !== page ? 'new-window' : frame.parentFrame() ? 'editor-frame' : 'top-window';
          } catch (_) { /* An early popup request may not have its Frame yet. */ }
          navigations.push({ url: request.url(), context, navigation: request.isNavigationRequest() });
          await requestRoute.fulfill({ status: 204 });
        });
        await page.exposeFunction('papijoHarnessNavigations', async () => navigations.slice());
        await page.exposeFunction('papijoHarnessPressKey', async (selector, key) => {
          await controls.locator(selector).press(key);
        });
        // Do not focus a locator: navigation regressions must start at the
        // browser's actual active element, as a user's keyboard does.
        await page.exposeFunction('papijoHarnessPressFocusedKey', async key => {
          await page.keyboard.press(key);
        });
        await page.exposeFunction('papijoHarnessClick', async (selector, options) => {
          await controls.locator(selector).click(options);
        });
        await page.exposeFunction('papijoHarnessDrag', async (selector, dx, dy, cancel) => {
          const box = await controls.locator(selector).boundingBox();
          if (!box) { throw Error('Resize handle is not visible: ' + selector); }
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
          if (cancel === 'Escape') { await page.keyboard.press('Escape'); }
          else if (cancel) {
            await controls.locator(selector).evaluate((element, event) => {
              if (event === 'lostpointercapture') { element.releasePointerCapture(1); }
              else { element.dispatchEvent(new PointerEvent(event, { pointerId: 1, bubbles: true })); }
            }, cancel);
          }
          await page.mouse.up();
        });
        await page.exposeFunction('papijoHarnessBeginResize', async (selector, dx, dy) => {
          const box = await controls.locator(selector).boundingBox();
          if (!box) { throw Error('Resize handle unavailable'); }
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
        });
        await page.exposeFunction('papijoHarnessEndResize', async () => { await page.mouse.up(); });
        page.on('request', request => {
          if (imageRoute && request.resourceType() === 'image' &&
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
          const harness = framed ? page.frame({ name: 'papijo-editor-frame' }) : page;
          await harness.waitForFunction(() => ['pass', 'fail'].includes(document.documentElement.dataset.testStatus), null, { timeout: 180000 });
          const status = await harness.locator('html').getAttribute('data-test-status');
          if (status !== 'pass') {
            failed = true;
            console.error(route + '\n' + await harness.locator('#result').innerText());
          }
          else {
            console.log('PASS ' + route + (imageRoute ? ' viewport=' + width : ''));
            if (framed) {
              const report = JSON.parse(await harness.locator('#result').innerText());
              const proof = report.results.find(item => item.managedImageClick).managedImageClick;
              console.log('Navigation proof: ' + JSON.stringify(proof.map(item => ({
                captioned: item.captioned, editorAttempts: item.navigations.length,
                defaultPrevented: item.defaultPrevented, runtimeContexts: item.runtimeNavigations.map(attempt => attempt.context)
              }))));
            }
          }
        }
        catch (error) { failed = true; console.error(route + ': ' + error.message); }
        finally { await page.close(); }
      }
    }
  }
  finally { if (browser) { await browser.close(); } if (server) { server.kill(); } }
  if (failed) { process.exitCode = 1; }
})().catch(error => { console.error(error); process.exitCode = 1; });
