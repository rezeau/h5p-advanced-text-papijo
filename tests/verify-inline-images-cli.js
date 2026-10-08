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
  for (const [id, style] of [
    ['97dd2fde-fd7f-46e2-bb2d-7b686993880f', 'alignLeft'],
    ['2200ad5e-671e-42e3-835b-93cbcc338fae', 'alignRight']
  ]) {
    const attribute = 'data-papijo-inline-image-id="' + id + '"';
    assert.ok(source.params.text.includes(attribute));
    source.params.text = source.params.text.replace(attribute,
      attribute + ' data-papijo-inline-image-style="' + style + '"');
  }
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
  // Preserve the established five cases and render five replacement results.
  // A remains in the semantic store, while the left occurrence uses new B.
  for (const [route, contentId, type, original] of cases.slice()) {
    const params = JSON.parse(JSON.stringify(original));
    const text = type === 'AdvancedTextPapiJo' ? params : type === 'AccordionPapiJo' ? params.panels[0].content.params : params.content[0].content.params;
    const imageB = text.inlineImages.find(entry => entry.id === '2200ad5e-671e-42e3-835b-93cbcc338fae');
    text.inlineImages.push({ id: 'live-replacement-B', image: JSON.parse(JSON.stringify(imageB.image)), alt: 'Explicit live replacement description' });
    text.text = text.text.replace('data-papijo-inline-image-id="97dd2fde-fd7f-46e2-bb2d-7b686993880f"', 'data-papijo-inline-image-id="live-replacement-B"');
    cases.push([route, contentId, type, params, true]);
  }
  const browser = await chromium.launch({ channel: process.env.PAPIJO_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    for (const [route, contentId, type, params, replacement] of cases) {
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
          await frame.addStyleTag({ path: path.join(root, 'text.css') });
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
            if (type === 'AccordionPapiJo') {
              await new Promise(resolve => $root.find('.h5p-panel-content').promise().done(resolve));
            }
            const textRoot = images[0].closest('.h5p-advanced-text');
            const flow = textRoot.querySelector(':scope > .papijo-inline-image-flow');
            if (!flow || getComputedStyle(flow).display !== 'flow-root') {
              throw Error('Styled AdvancedText must contain floats inside its generated flow container');
            }
            for (const [index, side] of ['left', 'right'].entries()) {
              const marker = images[index].parentElement;
              if (!marker.classList.contains('papijo-inline-image-wrap-' + side) ||
                  getComputedStyle(marker).float !== side) { throw Error('Occurrence must wrap ' + side); }
              if (textRoot.getBoundingClientRect().bottom < marker.getBoundingClientRect().bottom - 1) {
                throw Error('AdvancedText height must include the floated marker');
              }
            }
            if (type === 'AccordionPapiJo') {
              const button = $root.find('.h5p-panel-button')[0]; button.click();
              await new Promise(resolve => $root.find('.h5p-panel-content').promise().done(resolve));
              if (getComputedStyle(textRoot).display !== 'none') { throw Error('Containment must not prevent Accordion collapse'); }
              button.click();
              await new Promise(resolve => $root.find('.h5p-panel-content').promise().done(resolve));
              if (textRoot.getBoundingClientRect().bottom < images[1].getBoundingClientRect().bottom - 1) {
                throw Error('Reopened Accordion must still contain floats');
              }
            }
            const trigger = $root[0].querySelector('.papijo-tooltip'); trigger.click();
            const tooltip = $root[0].querySelector('img:not(.papijo-managed-inline-image)');
            if (!tooltip) { throw Error('Tooltip image must render'); } await tooltip.decode();
            const output = { type, contentId, widths: images.map(image => image.naturalWidth),
              tooltipWidth: tooltip.naturalWidth, floatContainment: true, calls };
            trigger.click(); return output;
          }
          finally { H5P.getPath = getPath; $root.remove(); }
        }, { contentId, type, params });
        assert.deepEqual(result.widths, replacement ? [460, 460] : [425, 460]); assert.equal(result.tooltipWidth, 320);
        assert.ok(result.calls.every(call => call[1] === contentId));
        const childParams = type === 'AdvancedTextPapiJo' ? params : type === 'AccordionPapiJo' ? params.panels[0].content.params : params.content[0].content.params;
        for (const id of [replacement ? 'live-replacement-B' : '97dd2fde-fd7f-46e2-bb2d-7b686993880f', '2200ad5e-671e-42e3-835b-93cbcc338fae']) {
          assert.ok(result.calls.some(call => call[0] === childParams.inlineImages.find(entry => entry.id === id).image.path));
        }
        if (replacement) { assert.ok(childParams.inlineImages.find(entry => entry.id === '97dd2fde-fd7f-46e2-bb2d-7b686993880f'), 'Inactive A must remain retained'); }
        console.log('LIVE CLI ' + (replacement ? 'REPLACEMENT ' : '') + 'PASS ' + JSON.stringify(result));
      }
      finally { await page.close(); }
    }
  }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
