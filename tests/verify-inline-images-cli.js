'use strict';

// Optional live CLI check. GET requests and disposable browser DOM only;
// no content saves/uploads and no changes to the user's clipboard or fixtures.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const { sourceParams, clipboard, imageFixture } = require('./h5p-inline-image-copy-fixtures');

(async () => {
  const origin = process.env.PAPIJO_CLI_ORIGIN || 'http://localhost:8080';
  const source = { library: 'H5P.AdvancedTextPapiJo 1.2', params: sourceParams() };
  const fixturePaths = new Set(source.params.inlineImages.concat(source.params.tooltipImages).map(entry => entry.image.path));
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
  // Keep all ten established cases and add linked originals/replacements.
  for (const [route, contentId, type, original, replacement] of cases.slice()) {
    const params = JSON.parse(JSON.stringify(original));
    const text = type === 'AdvancedTextPapiJo' ? params : type === 'AccordionPapiJo' ? params.panels[0].content.params : params.content[0].content.params;
    text.text = text.text.replace(/data-papijo-inline-image-id="([^"]+)"/g, (attribute, id) =>
      attribute + ' data-papijo-inline-image-link="' + (id === '2200ad5e-671e-42e3-835b-93cbcc338fae' ?
        'http://example.com/Y' : 'https://example.com/X?q=1&amp;b=2#details') + '"');
    cases.push([route, contentId, type, params, replacement, true]);
  }
  for (const [route, contentId, type, original, replacement, linked] of cases.slice()) {
    const params = JSON.parse(JSON.stringify(original));
    const text = type === 'AdvancedTextPapiJo' ? params : type === 'AccordionPapiJo' ? params.panels[0].content.params : params.content[0].content.params;
    text.text = text.text.replace(/data-papijo-inline-image-id="([^"]+)"/g, (attribute, id) =>
      attribute + ' data-papijo-inline-image-width="' + (id === '2200ad5e-671e-42e3-835b-93cbcc338fae' ? '70' : '55.5') + '"');
    cases.push([route, contentId, type, params, replacement, linked, true]);
  }
  const browser = await chromium.launch({ channel: process.env.PAPIJO_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    for (const [route, contentId, type, params, replacement, linked, resized] of cases) {
      const page = await browser.newPage();
      try {
        await page.route('**/*', route => {
          if (!['GET', 'HEAD'].includes(route.request().method())) { return route.abort(); }
          const imagePath = 'images/' + path.posix.basename(new URL(route.request().url()).pathname);
          // Exercise the real getPath/foreign references with deterministic bytes,
          // without installing files into the user's manually editable content.
          return fixturePaths.has(imagePath) ? route.fulfill({ path: imageFixture(imagePath), contentType: 'image/svg+xml' }) : route.continue();
        });
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
        const result = await frame.evaluate(async ({ contentId, type, params, linked, resized }) => {
          const calls = []; const getPath = H5P.getPath;
          H5P.getPath = function (imagePath, id) { calls.push([imagePath, id]); return getPath.apply(this, arguments); };
          const $root = H5P.jQuery('<div>').appendTo(document.body);
          try {
            const instance = new H5P[type](params, contentId, {}); instance.attach($root);
            if (type === 'AccordionPapiJo') { $root.find('.h5p-panel-button')[0].click(); }
            const images = Array.from($root[0].querySelectorAll('img.papijo-managed-inline-image'));
            if (images.length !== 2) { throw Error('Both managed occurrences must render'); }
            for (const image of images) {
              // SVG decode may finish before the runtime's load handler projects
              // the intrinsic-size cap. Measure after both decode and that event.
              const loaded = image.complete && (!resized ||
                image.closest('.papijo-inline-image').style.getPropertyValue('--papijo-image-natural-width')) ?
                Promise.resolve() : new Promise(resolve => image.addEventListener('load', resolve, { once: true }));
              await Promise.all([image.decode(), loaded]);
            }
            if (type === 'AccordionPapiJo') {
              await new Promise(resolve => $root.find('.h5p-panel-content').promise().done(resolve));
            }
            const textRoot = images[0].closest('.h5p-advanced-text');
            const flow = textRoot.querySelector(':scope > .papijo-inline-image-flow');
            if (!flow || getComputedStyle(flow).display !== 'flow-root') {
              throw Error('Styled AdvancedText must contain floats inside its generated flow container');
            }
            for (const [index, side] of ['left', 'right'].entries()) {
              const marker = images[index].closest('.papijo-inline-image');
              if (!marker.classList.contains('papijo-inline-image-wrap-' + side) ||
                  getComputedStyle(marker).float !== side) { throw Error('Occurrence must wrap ' + side); }
              if (textRoot.getBoundingClientRect().bottom < marker.getBoundingClientRect().bottom - 1) {
                throw Error('AdvancedText height must include the floated marker');
              }
              if (resized) {
                const bounds = images[index].getBoundingClientRect();
                if (!marker.classList.contains('papijo-inline-image-sized') ||
                    !marker.style.getPropertyValue('--papijo-image-width') || bounds.width > images[index].naturalWidth + 0.5 ||
                    bounds.width > textRoot.clientWidth + 0.5 ||
                    Math.abs(bounds.width / bounds.height - images[index].naturalWidth / images[index].naturalHeight) > 0.02) {
                  throw Error('Live resized image must preserve local bounds, intrinsic cap and aspect ratio');
                }
              }
            }
            if (linked) {
              for (const image of images) {
                const anchor = image.parentElement;
                if (!anchor.matches('a.papijo-inline-image-link') ||
                    anchor.getAttribute('href') !== image.closest('.papijo-inline-image').getAttribute('data-papijo-inline-image-link') ||
                    Array.from(anchor.attributes).map(attribute => attribute.name).sort().join(',') !== 'class,href' || !image.alt) {
                  throw Error('Live managed image must have a URL-only semantic link and ALT');
                }
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
              tooltipWidth: tooltip.naturalWidth, floatContainment: true, linked: !!linked, calls };
            trigger.click(); return output;
          }
          finally { H5P.getPath = getPath; $root.remove(); }
        }, { contentId, type, params, linked, resized });
        assert.ok(result.calls.every(call => call[1] === contentId));
        const childParams = type === 'AdvancedTextPapiJo' ? params : type === 'AccordionPapiJo' ? params.panels[0].content.params : params.content[0].content.params;
        const activeIds = [replacement ? 'live-replacement-B' : '97dd2fde-fd7f-46e2-bb2d-7b686993880f', '2200ad5e-671e-42e3-835b-93cbcc338fae'];
        assert.deepEqual(result.widths, activeIds.map(id => childParams.inlineImages.find(entry => entry.id === id).image.width));
        assert.equal(result.tooltipWidth, childParams.tooltipImages[0].image.width);
        for (const id of [replacement ? 'live-replacement-B' : '97dd2fde-fd7f-46e2-bb2d-7b686993880f', '2200ad5e-671e-42e3-835b-93cbcc338fae']) {
          assert.ok(result.calls.some(call => call[0] === childParams.inlineImages.find(entry => entry.id === id).image.path));
        }
        if (replacement) { assert.ok(childParams.inlineImages.find(entry => entry.id === '97dd2fde-fd7f-46e2-bb2d-7b686993880f'), 'Inactive A must remain retained'); }
        console.log('LIVE CLI ' + (resized ? 'RESIZE ' : '') + (linked ? 'LINK ' : '') + (replacement ? 'REPLACEMENT ' : '') + 'PASS ' + JSON.stringify(result));
      }
      finally { await page.close(); }
    }
  }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
