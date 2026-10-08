'use strict';

// Optional live CLI check. GET requests and disposable browser DOM only;
// no content saves/uploads and no changes to the user's clipboard or fixtures.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { sourceParams, clipboard } = require('./h5p-inline-image-copy-fixtures');

(async () => {
  const origin = process.env.PAPIJO_CLI_ORIGIN || 'http://localhost:8080';
  const source = { library: 'H5P.AdvancedTextPapiJo 1.2', params: sourceParams() };
  const core = clipboard(); core.copy(source, 'text-01');
  const accordion = core.paste('acordion-papijo-001');
  const column = core.paste('col-pj');
  core.copy(accordion, 'acordion-papijo-001');
  const child = core.paste('col-pj');
  core.copy(child, 'col-pj');
  const repeated = core.paste('acordion-papijo-001');
  const cases = [
    ['h5p-advanced-text-papi-jo', 'text-01', 'AdvancedTextPapiJo', source.params],
    ['h5p-accordion-papi-jo', 'acordion-papijo-001', 'AccordionPapiJo', { panels: [{ title: 'Copied child', content: accordion }] }],
    ['h5p-column-papi-jo', 'col-pj', 'ColumnPapiJo', { content: [{ content: column, useSeparator: 'auto' }] }],
    ['h5p-column-papi-jo', 'col-pj', 'ColumnPapiJo', { content: [{ content: child, useSeparator: 'auto' }] }],
    ['h5p-accordion-papi-jo', 'acordion-papijo-001', 'AccordionPapiJo', { panels: [{ title: 'Repeated copy', content: repeated }] }]
  ];
  const browser = await chromium.launch({ channel: process.env.PAPIJO_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    for (const [route, contentId, type, params] of cases) {
      const page = await browser.newPage();
      try {
        await page.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
        await page.goto(origin + '/view/' + route + '/' + contentId);
        await page.locator('iframe').first().waitFor();
        const frame = await (await page.locator('iframe').first().elementHandle()).contentFrame();
        await frame.waitForFunction(() => window.H5P && H5P.instances && H5P.instances.length);
        // A live Accordion may no longer contain AdvancedText after manual tests.
        // Load this repository's actual runtime only if the page did not need it.
        const root = path.resolve(__dirname, '..');
        if (!await frame.evaluate(() => typeof H5P.AdvancedTextPapiJoInlineImageRuntime === 'function')) {
          for (const file of ['advanced-text-papijo-inline-images.js', 'advanced-text-papijo-tooltip-sanitizer.js',
            'advanced-text-papijo-speech-bubble.js', 'advanced-text-papijo-tooltip-runtime.js',
            'advanced-text-papijo-inline-image-runtime.js', 'text.js']) {
            await frame.addScriptTag({ path: path.join(root, file) });
          }
        }
        const result = await frame.evaluate(async ({ contentId, type, params }) => {
          const calls = []; const getPath = H5P.getPath;
          H5P.getPath = function (imagePath, id) { calls.push([imagePath, id]); return getPath.apply(this, arguments); };
          const $root = H5P.jQuery('<div>').appendTo(document.body);
          try {
            const instance = new H5P[type](params, contentId, {}); instance.attach($root);
            if (type === 'AccordionPapiJo') { $root.find('.h5p-panel-button')[0].click(); }
            const images = Array.from($root[0].querySelectorAll('img.papijo-managed-inline-image'));
            if (images.length !== 2) { throw Error('Both managed occurrences must render'); }
            for (const image of images) { await image.decode(); }
            const trigger = $root[0].querySelector('.papijo-tooltip'); trigger.click();
            const tooltip = $root[0].querySelector('img:not(.papijo-managed-inline-image)');
            if (!tooltip) { throw Error('Tooltip image must render'); } await tooltip.decode();
            const output = { type, contentId, widths: images.map(image => image.naturalWidth),
              tooltipWidth: tooltip.naturalWidth, calls };
            trigger.click(); return output;
          }
          finally { H5P.getPath = getPath; $root.remove(); }
        }, { contentId, type, params });
        assert.deepEqual(result.widths, [425, 460]); assert.equal(result.tooltipWidth, 320);
        assert.ok(result.calls.every(call => call[1] === contentId));
        const childParams = type === 'AdvancedTextPapiJo' ? params : type === 'AccordionPapiJo' ? params.panels[0].content.params : params.content[0].content.params;
        for (const id of ['97dd2fde-fd7f-46e2-bb2d-7b686993880f', '2200ad5e-671e-42e3-835b-93cbcc338fae']) {
          assert.ok(result.calls.some(call => call[0] === childParams.inlineImages.find(entry => entry.id === id).image.path));
        }
        console.log('LIVE CLI PASS ' + JSON.stringify(result));
      }
      finally { await page.close(); }
    }
  }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
