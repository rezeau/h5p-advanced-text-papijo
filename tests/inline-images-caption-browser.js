/* Production caption converters/UI/projection, real installed CKEditor models. */
window.runPapijoInlineImageCaption = async function (h) {
  'use strict';
  var assert = h.assert, managed = PapijoManagedInlineImages;
  var originalPath = H5P.getPath, originalTranslate = H5PEditor.t, contexts = [];
  var definitions = [
    { id: 'caption-A', image: { path: 'images/large.svg' }, alt: 'Required image ALT' },
    { id: 'caption-B', image: { path: 'images/small.svg' }, alt: 'Second required ALT' }
  ];
  function esc(value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function marker(caption, attrs, id) {
    return '<span class="papijo-inline-image" data-papijo-inline-image-id="' + (id || 'caption-A') + '" ' + (attrs || '') + '>' +
      (caption ? '<span class="papijo-image-caption">' + esc(caption) + '</span>' : '') + '</span>';
  }
  async function settle(ctx) {
    var images = Array.from(ctx.editor.editing.view.getDomRoot().querySelectorAll('img'));
    await Promise.all(images.map(function (image) { return image.decode(); }));
    await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
  }
  async function open(html, language) {
    var ctx = await h.open(html || '<p>' + marker() + '</p>', JSON.parse(JSON.stringify(definitions)), language);
    contexts.push(ctx); await settle(ctx); return ctx;
  }
  async function close(ctx) { contexts.splice(contexts.indexOf(ctx), 1); await h.close(ctx); }
  function caption(ctx, index) { return h.imageModel(ctx, index).getAttribute('papijoImageCaption'); }
  async function form(ctx, index) {
    await h.selectImage(ctx, index);
    var command = ctx.editor.commands.get('papijoImageCaption');
    assert(command.isEnabled, 'Caption command eligible');
    var toolbar = ctx.editor.plugins.get('ContextualBalloon').visibleView;
    var button = toolbar.items && Array.from(toolbar.items).find(function (item) {
      return item.label === H5PEditor.t('', command.value ? 'editImageCaption' : 'addImageCaption');
    });
    assert(button && button.isEnabled, 'Real contextual Caption action has current Add/Edit label');
    button.element.setAttribute('data-caption-open', 'target');
    await papijoHarnessClick('[data-caption-open="target"]'); button.element.removeAttribute('data-caption-open');
    assert(command.form && document.activeElement === command.form.input, 'Caption form owns labelled input focus');
    return command.form;
  }
  async function apply(ctx, value, remove) {
    var f = await form(ctx); f.input.value = value; (remove ? f.remove : f.apply).element.click(); await settle(ctx);
  }
  function history(ctx, before, after) {
    ctx.editor.execute('undo'); assert(ctx.editor.getData() === before, 'One Undo restores exact previous caption state');
    ctx.editor.execute('redo'); assert(ctx.editor.getData() === after, 'One Redo restores exact caption mutation');
  }
  function dom(ctx) { return ctx.editor.editing.view.getDomRoot(); }
  function unit(ctx) { return dom(ctx).querySelector('.image-inline'); }
  function forceWidth(ctx, basis) {
    ctx.editor.editing.view.change(function (writer) {
      var root = ctx.editor.editing.view.document.getRoot();
      Object.entries({ width: basis + 'px', padding: '0', border: '0', 'box-sizing': 'content-box',
        'min-width': '0', 'max-width': 'none', font: '16px Arial' }).forEach(function (pair) { writer.setStyle(pair[0], pair[1], root); });
    });
  }
  try {
    H5P.getPath = function (path) { return path.includes('large') ? '/fixture-large.svg' : '/fixture-small.svg'; };
    var attrs = 'data-papijo-inline-image-style="alignLeft" data-papijo-inline-image-width="55.5" data-papijo-inline-image-link="https://example.org/image?q=1&amp;b=2"';
    var ctx = await open(), values = ['Ordinary', 'Rabbit: garden', "Apostrophe's", '"Quote"', 'Ampersand &',
      'Literal <b>text</b>', 'Été français', '🐇', 'https://example.org/path', '  outer  ', 'Two  internal   spaces',
      'French\u00a0space\u202f!', 'e\u0301', '👩‍👩‍👧‍👦', 'a\r\nb\tc'];
    for (var value of values) {
      ctx.editor.setData('<p>Before' + marker(value, attrs) + 'After</p>');
      var image = h.imageModel(ctx), normalized = managed.normalizeCaption(value), data = ctx.editor.getData();
      var parsed = new DOMParser().parseFromString(data, 'text/html');
      assert(image.getAttribute('papijoImageCaption') === normalized && parsed.querySelector('.papijo-image-caption').textContent === normalized,
        'Caption literal text survives model/data and runtime parsing: ' + value);
      ctx.editor.setData(data); image = h.imageModel(ctx);
      assert(image.name === 'imageInline' && image.childCount === 0 && image.getAttribute('inlineImageId') === 'caption-A' &&
        image.getAttribute('alt') === definitions[0].alt && image.getAttribute('imageStyle') === 'alignLeft' &&
        image.getAttribute('papijoImageWidth') === 55.5 && image.getAttribute('linkHref') === 'https://example.org/image?q=1&b=2' &&
        caption(ctx) === normalized, 'Complete state round trip stays occurrence-local');
      assert(dom(ctx).textContent.includes(normalized) && !unit(ctx).querySelector('a .papijo-image-caption') && !dom(ctx).querySelector('a a'), 'Caption is an unlinked noneditable sibling');
    }
    var malformed = [
      '<span class="papijo-image-caption">A</span><span class="papijo-image-caption">B</span>',
      '<span class="papijo-image-caption"><strong>bold</strong></span>',
      '<span class="papijo-image-caption"><a href="https://example.org">link</a></span>',
      '<span class="papijo-image-caption" onclick="bad()">event</span>',
      '<span><span class="papijo-image-caption">nested</span></span>',
      'unexpected<span class="papijo-image-caption">text</span>',
      '<span class="papijo-image-caption">' + 'x'.repeat(1001) + '</span>'
    ];
    for (var child of malformed) {
      ctx.editor.setData('<p>Before' + marker().replace('</span>', child + '</span>') + 'After</p>');
      assert(caption(ctx) === undefined && ctx.editor.getData() === '<p>Before' + marker().replace(' >', '>') + 'After</p>',
        'Malformed child drops all caption state without leaking text: ' + child.slice(0, 80));
    }
    ctx.editor.setData('<p>' + marker('Caption A') + marker() + marker('Caption B') + '</p>');
    assert(caption(ctx, 0) === 'Caption A' && caption(ctx, 1) === undefined && caption(ctx, 2) === 'Caption B', 'Repeated definition has independent occurrence captions');
    await close(ctx);
    h.results.push('Caption: 15 literal round trips, controlled malformed-child rejection, no text leakage, repeated occurrence isolation');

    for (var language of ['en', 'fr']) {
      var strings = (await fetch('/language/' + language + '.json').then(function (r) { return r.json(); })).libraryStrings;
      H5PEditor.t = function (_library, key) { return strings[key] || key; };
      ctx = await open(null, language); var before = ctx.editor.getData();
      var f = await form(ctx), version = ctx.editor.model.document.version;
      assert(f.input.labels[0].textContent === strings.imageCaption && !f.remove.isVisible, 'Localized labelled Add form has no Remove');
      f.input.value = 'draft'; await papijoHarnessPressFocusedKey('Escape');
      assert(ctx.editor.getData() === before && ctx.editor.model.document.version === version && !ctx.editor.plugins.get('ContextualBalloon').hasView(f), 'Escape/Cancel/open/focus add zero history');
      await apply(ctx, '  Caption: two  spaces 🐇  '); var after = ctx.editor.getData();
      assert(caption(ctx) === 'Caption: two  spaces 🐇', 'Add uses shared normalization'); history(ctx, before, after);
      f = await form(ctx); version = ctx.editor.model.document.version; f.input.value = ' Caption: two  spaces 🐇 '; f.apply.element.click();
      assert(ctx.editor.model.document.version === version && ctx.editor.getData() === after, 'Normalized no-op creates no history');
      f = await form(ctx); f.input.value = '🐇'.repeat(1001); f.apply.element.click();
      assert(f.error.textContent === strings.captionTooLong && ctx.editor.getData() === after, 'Code-point overflow is visible and does not truncate/mutate');
      f.input.value = '\u000b'; f.apply.element.click(); assert(f.error.textContent === strings.captionInvalid, 'Invalid controls produce local validation'); f.cancel.element.click();
      before = after; await apply(ctx, 'Edited'); after = ctx.editor.getData(); history(ctx, before, after);
      before = after; await apply(ctx, '', true); after = ctx.editor.getData(); history(ctx, before, after);
      assert(caption(ctx) === undefined, 'Remove removes only occurrence caption');
      await close(ctx);
    }
    H5PEditor.t = originalTranslate;
    var contextHtml = [
      '<p>' + marker() + '</p>', '<p>Some ' + marker() + ' more</p>',
      '<table><tbody><tr><td><p>' + marker() + '</p></td></tr></tbody></table>',
      '<ul><li>' + marker() + '</li></ul>', '<h2>' + marker() + '</h2>'
    ];
    for (var index = 0; index < contextHtml.length; index++) {
      ctx = await open(contextHtml[index]); await h.selectImage(ctx);
      assert(ctx.editor.commands.get('papijoImageCaption').isEnabled === (index === 0), 'Add eligibility root/mixed/table/list/heading ' + index);
      var target = h.imageModel(ctx); ctx.editor.model.change(function (writer) { writer.setAttribute('papijoImageCaption', 'Existing', target); });
      await apply(ctx, 'Edited context'); assert(caption(ctx) === 'Edited context', 'Existing caption can be edited in deferred context');
      await apply(ctx, '', true); assert(caption(ctx) === undefined, 'Existing caption can be removed in deferred context'); await close(ctx);
    }
    ctx = await open('<p>' + marker('A') + '</p><p>' + marker('B', '', 'caption-B') + '</p>');
    f = await form(ctx); await h.selectImage(ctx, 1); f.input.value = 'Captured A'; f.apply.element.click();
    assert(caption(ctx) === 'Captured A' && caption(ctx, 1) === 'B', 'Selection movement cannot redirect caption edit');
    f = await form(ctx); before = ctx.editor.getData(); ctx.editor.enableReadOnlyMode('caption-test'); f.input.value = 'unsafe'; f.apply.element.click();
    assert(ctx.editor.getData() === before && f.error.textContent, 'Read-only captured target blocks mutation'); f.cancel.element.click(); ctx.editor.disableReadOnlyMode('caption-test');
    f = await form(ctx); target = h.imageModel(ctx); ctx.editor.model.change(function (writer) { writer.setAttribute('inlineImageId', 'caption-B', target); });
    before = ctx.editor.getData(); f.input.value = 'stale'; f.apply.element.click(); assert(ctx.editor.getData() === before && f.error.textContent, 'Replaced identity blocks captured caption mutation'); f.cancel.element.click();
    f = await form(ctx); target = h.imageModel(ctx); ctx.editor.model.change(function (writer) { writer.remove(target); });
    before = ctx.editor.getData(); f.apply.element.click(); assert(ctx.editor.getData() === before && f.error.textContent, 'Deleted target cannot mutate another occurrence'); f.cancel.element.click();
    var peer = await open(); var peerData = peer.editor.getData(); var detachedForm = f.element; await close(ctx);
    f.apply.element.click(); assert(!detachedForm.isConnected && peer.editor.getData() === peerData, 'Destroy releases form and stale callbacks cannot mutate peer'); await close(peer);
    ctx = await open(); f = await form(ctx); detachedForm = f.element;
    await close(ctx); assert(!detachedForm.isConnected, 'Destroy while Caption form is open removes the owned balloon view');
    h.results.push('Caption form EN/FR: Add/Edit/Remove, history, validation, no-op/Cancel, deferred contexts, captured selection/read-only/replaced/deleted/destroy guards');

    ctx = await open('<p>' + marker('', attrs) + '</p>');
    await apply(ctx, 'Preserved'); await settle(ctx);
    assert(!unit(ctx).closest('a') && !unit(ctx).querySelector('a .papijo-image-caption'), 'Adding caption to an existing link moves image anchor inside without linking caption');
    await apply(ctx, '', true); await settle(ctx);
    assert(unit(ctx).closest('a'), 'Removing caption restores established uncaptioned native link ownership');
    await apply(ctx, 'Preserved'); await h.selectImage(ctx); await settle(ctx);
    var cap = unit(ctx).querySelector('.papijo-image-caption'); cap.setAttribute('data-caption-click', 'target');
    h.caret(ctx, 0); await papijoHarnessClick('[data-caption-click="target"]');
    assert(ctx.editor.model.document.selection.getSelectedElement() === h.imageModel(ctx), 'Real caption click selects atomic image');
    await papijoHarnessPressFocusedKey('Control+k');
    var linkUi = ctx.editor.plugins.get('LinkUI'), balloon = ctx.editor.plugins.get('ContextualBalloon');
    assert(balloon.visibleView === linkUi.formView, 'Real Ctrl+K opens native Link form on captioned image');
    linkUi.formView.urlInputView.fieldView.element.value = 'https://example.org/new'; linkUi.formView.fire('submit');
    assert(caption(ctx) === 'Preserved' && !unit(ctx).querySelector('a .papijo-image-caption') && !dom(ctx).querySelector('a a'), 'Native Link Apply keeps caption outside anchor');
    linkUi.actionsView.editButtonView.fire('execute'); linkUi.formView.urlInputView.fieldView.element.value = 'https://example.org/edited'; linkUi.formView.fire('submit');
    linkUi.actionsView.unlinkButtonView.fire('execute'); assert(!unit(ctx).querySelector('a') && caption(ctx) === 'Preserved', 'Native Edit/Unlink preserve caption');
    await h.selectImage(ctx); h.submitAlt(h.altForm(ctx), 'Revised ALT'); assert(caption(ctx) === 'Preserved' && h.imageModel(ctx).getAttribute('alt') === 'Revised ALT', 'ALT revision preserves occurrence caption');
    await h.selectImage(ctx); Array.from(balloon.visibleView.items).find(function (button) { return button.papijoManagedImageButton; }).element.click();
    var state = ctx.widget.inlineImageUi; state.imageWidget.setValue({ name: 'image' }, { path: 'images/small.svg' }); state.$alt.val('Replacement ALT'); state.$form.trigger('submit');
    assert(caption(ctx) === 'Preserved' && h.imageModel(ctx).getAttribute('papijoImageWidth') === 55.5 && h.imageModel(ctx).getAttribute('imageStyle') === 'alignLeft', 'Real shared Replace picker preserves caption, width and wrap');
    ctx.editor.execute('undo'); assert(caption(ctx) === 'Preserved', 'Replace Undo preserves caption'); ctx.editor.execute('redo'); assert(caption(ctx) === 'Preserved', 'Replace Redo preserves caption');
    await h.selectImage(ctx); ctx.editor.execute('papijoImageParagraphBefore'); assert(caption(ctx) === 'Preserved', 'Before preserves caption');
    await h.selectImage(ctx); ctx.editor.execute('papijoImageParagraphAfter'); assert(caption(ctx) === 'Preserved', 'After preserves caption');
    ctx.editor.model.change(function (writer) { writer.insertText('Text ', writer.createPositionBefore(h.imageModel(ctx))); writer.setSelection(h.imageModel(ctx), 'on'); });
    ctx.editor.execute('papijoSeparateImageParagraph'); assert(caption(ctx) === 'Preserved', 'Explicit paragraph extraction preserves caption'); await close(ctx);
    h.results.push('Captioned image: real click/Ctrl+K, native Link Apply/Edit/Unlink, ALT, H5P Replace/history and Paragraph Actions preservation');

    ctx = await open(); var sizes = [[32, 16], [128, 64], [1800, 900], [240, 960]], count = 0;
    function appearance(captionElement, owner, image, gap, label) {
      var css = getComputedStyle(captionElement), parentCss = getComputedStyle(owner);
      var font = parseFloat(css.fontSize), cr = captionElement.getBoundingClientRect(), ur = owner.getBoundingClientRect();
      assert(css.backgroundColor === 'rgb(242, 242, 242)' && css.boxSizing === 'border-box' &&
        Math.abs(parseFloat(css.paddingTop) - 0.4 * font) < 0.01 && Math.abs(parseFloat(css.paddingBottom) - 0.4 * font) < 0.01 &&
        Math.abs(parseFloat(css.paddingLeft) - 0.7 * font) < 0.01 && Math.abs(parseFloat(css.paddingRight) - 0.7 * font) < 0.01,
        label + ' caption has the agreed background and padding inside its border box');
      assert(Math.abs(cr.width - ur.width) < 0.1 && cr.left >= ur.left - 0.1 && cr.right <= ur.right + 0.1 &&
        Math.abs(cr.top - image.getBoundingClientRect().bottom - gap) < 0.1,
        label + ' padded caption stays inside its unit and preserves image/caption spacing');
      assert(css.fontFamily === parentCss.fontFamily && css.fontSize === parentCss.fontSize &&
        css.fontWeight === parentCss.fontWeight && css.fontStyle === parentCss.fontStyle && css.textAlign === parentCss.textAlign,
        label + ' caption typography and alignment remain inherited');
      assert(document.getElementById(image.getAttribute('aria-describedby')) === captionElement,
        label + ' padded caption retains its occurrence description association');
    }
    async function layout(basis, dimensions, percentage, presentation, text) {
      H5P.getPath = function () { return '/caption-size-' + dimensions[0] + '-' + dimensions[1] + '.svg'; };
      forceWidth(ctx, basis);
      ctx.editor.setData('<p>' + marker(text || 'A caption with extraordinarilylongunbrokenwords and ordinary text.',
        (percentage === null ? '' : 'data-papijo-inline-image-width="' + percentage + '" ') +
        (presentation === 'inline' ? '' : 'data-papijo-inline-image-style="' + presentation + '"')) + '</p><p>Following text avoids the entire floated caption footprint.</p>');
      await settle(ctx); await new Promise(function(resolve){setTimeout(resolve,40);}); var image = dom(ctx).querySelector('img'), u = unit(ctx), captionElement = u.querySelector('.papijo-image-caption');
      var style = getComputedStyle(u), gutter = presentation === 'inline' ? 0 : parseFloat(style.marginLeft) + parseFloat(style.marginRight);
      var expected = managed.captionSize(dimensions[0], basis, gutter, percentage, parseFloat(getComputedStyle(captionElement).fontSize));
      var ir = image.getBoundingClientRect(), ur = u.getBoundingClientRect(), cr = captionElement.getBoundingClientRect(), rr = dom(ctx).getBoundingClientRect();
      assert(Math.abs(ir.width - expected.image) < 0.1 && Math.abs(ur.width - expected.unit) < 0.1 && Math.abs(cr.width - ur.width) < 0.1,
        'Editor image/unit/caption contract: ' + [basis, dimensions[0], percentage, presentation] + ' ' + JSON.stringify({expected:expected,image:ir.width,unit:ur.width,caption:cr.width,display:style.display,styles:u.getAttribute('style'),root:dom(ctx).className}));
      assert(dom(ctx).scrollWidth <= dom(ctx).clientWidth + 1 && ur.bottom <= rr.bottom + 0.5 && ir.width <= dimensions[0] + 0.1,
        'Editor containment/no overflow/no upscale');
      assert(h.imageModel(ctx).getAttribute('papijoImageWidth') === (percentage === null ? undefined : percentage), 'Projection never changes stored percentage');
      appearance(captionElement, u, image, u.classList.contains('ck-widget_selected') ? 28 : 8, 'Editor');
      if (percentage === null) assert(Math.abs(ur.width - ir.width) < 0.1, 'Default unit exactly follows displayed image');
      var runtimeRoot = document.createElement('div'); runtimeRoot.className = 'h5p-advanced-text'; runtimeRoot.style.cssText = 'font:16px Arial;width:' + basis + 'px';
      var fragment = new DOMParser().parseFromString(ctx.editor.getData(), 'text/html');
      Array.from(fragment.body.childNodes).forEach(function (node) { runtimeRoot.appendChild(node); }); document.getElementById('fixture').appendChild(runtimeRoot);
      var runtime = new H5P.AdvancedTextPapiJoInlineImageRuntime(runtimeRoot, 17, definitions); runtime.initialize();
      var runtimeImage = runtimeRoot.querySelector('img'); await runtimeImage.decode(); runtime.projectCaptions();
      var markerElement = runtimeImage.closest('.papijo-inline-image'), runtimeCaption = markerElement.querySelector('.papijo-image-caption');
      appearance(runtimeCaption, markerElement, runtimeImage, 8, 'Runtime');
      assert(Math.abs(runtimeImage.getBoundingClientRect().width - expected.image) < 0.1 && Math.abs(markerElement.getBoundingClientRect().width - expected.unit) < 0.1,
        'Runtime uses same width contract: ' + JSON.stringify({basis:basis,dimensions:dimensions,percentage:percentage,presentation:presentation,expected:expected,image:runtimeImage.getBoundingClientRect().width,unit:markerElement.getBoundingClientRect().width,styles:markerElement.getAttribute('style'),className:markerElement.className,computedWidth:getComputedStyle(markerElement).width,maxWidth:getComputedStyle(markerElement).maxWidth,captionFont:getComputedStyle(runtimeCaption).fontSize}));
      assert(runtimeRoot.scrollWidth <= runtimeRoot.clientWidth + 1 && runtimeCaption.textContent === caption(ctx) &&
        document.getElementById(runtimeImage.getAttribute('aria-describedby')) === runtimeCaption && !runtimeCaption.closest('a'), 'Runtime safe text/unique association/no overflow');
      var range = document.createRange(); range.selectNodeContents(runtimeRoot.querySelector('.papijo-inline-image-flow')?.lastChild || runtimeRoot.lastChild);
      var mr = markerElement.getBoundingClientRect();
      assert(Array.from(range.getClientRects()).every(function (r) { return presentation === 'inline' || r.bottom <= mr.top || r.top >= mr.bottom ||
        (presentation === 'alignLeft' ? r.left >= mr.right - 0.5 : r.right <= mr.left + 0.5); }), 'Following runtime text avoids complete float footprint');
      runtime.destroy(); runtime.initialize(); assert(runtimeRoot.querySelector('.papijo-image-caption').textContent === caption(ctx), 'Runtime reinitialize preserves canonical caption');
      runtime.destroy(); runtimeRoot.remove(); count++;
    }
    for (var basis of [1280, 600, 320, 160]) for (var dimensions of sizes) for (var percentage of [null, 100, 75, 55.5, 25, 10, 5, 2, 1, 0.5, 0.1]) {
      for (var presentation of ['inline', 'alignLeft', 'alignRight']) await layout(basis, dimensions, percentage, presentation);
    }
    for (var basis of [600, 320, 160]) for (var percentage of [10, 5, 2, 1, 0.5, 0.1]) for (var presentation of ['inline', 'alignLeft', 'alignRight']) {
      for (var text of ['Rabbit', 'A normal sentence about the garden.', 'Extraordinarilylongunbrokenword'.repeat(4),
        'https://example.org/long/path?parameter=value&another=string', 'Été français : le lapin est à côté.', '🐇🌷漢字αβγ']) await layout(basis, [1800, 900], percentage, presentation, text);
    }
    assert(count === 852, 'Full editor/runtime layout matrix completed');
    await close(ctx);
    H5P.getPath = function () { return '/fixture-large.svg'; };
    ctx = await open('<p>' + marker('Resize caption', 'data-papijo-inline-image-width="25"') + '</p>');
    forceWidth(ctx, Math.min(600, window.innerWidth - 48)); await h.selectImage(ctx); await settle(ctx);
    var handles = Array.from(ctx.editor.ui.view.body).filter(function (view) { return view.element?.classList.contains('papijo-image-resize-handle'); });
    assert(handles.length === 4, 'Caption retains four owned Resize handles');
    var imageRect = dom(ctx).querySelector('img').getBoundingClientRect(), capRect = unit(ctx).querySelector('.papijo-image-caption').getBoundingClientRect();
    assert(Math.abs(capRect.top - imageRect.bottom - 28) < 0.1, 'Selected caption keeps tested 28px gap');
    for (var handle of handles) assert(handle.element.getBoundingClientRect().bottom < capRect.top, 'Handles do not collide with caption text');
    var widthBefore = h.imageModel(ctx).getAttribute('papijoImageWidth');
    dom(ctx).focus(); await papijoHarnessPressFocusedKey('Tab');
    assert(document.activeElement === handles[3].element, 'Real sequential Tab enters southeast handle');
    await papijoHarnessPressFocusedKey('ArrowRight'); assert(h.imageModel(ctx).getAttribute('papijoImageWidth') === widthBefore + 0.1, 'Arrow keeps 0.1% resize');
    await papijoHarnessPressFocusedKey('Shift+ArrowRight'); assert(h.imageModel(ctx).getAttribute('papijoImageWidth') === widthBefore + 5.1, 'Shift Arrow keeps 5% resize');
    await papijoHarnessPressFocusedKey('Escape'); assert(document.activeElement === dom(ctx), 'Escape returns focus to image editor');
    for (var i = 0; i < 4; i++) {
      ctx.editor.model.change(function (writer) { writer.setAttribute('papijoImageWidth', 25, h.imageModel(ctx)); }); await h.selectImage(ctx); await settle(ctx);
      before = ctx.editor.getData(); handles[i].element.setAttribute('data-caption-handle', String(i));
      await papijoHarnessDrag('[data-caption-handle="' + i + '"]', i % 2 ? 10 : -10, i >= 2 ? 5 : -5); await settle(ctx);
      after = ctx.editor.getData(); assert(after !== before && caption(ctx) === 'Resize caption', 'Real corner pointer gesture changes width and preserves caption'); history(ctx, before, after);
    }
    ctx.editor.execute('papijoResetImageSize'); await settle(ctx); assert(h.imageModel(ctx).getAttribute('papijoImageWidth') === undefined && caption(ctx) === 'Resize caption', 'Reset preserves caption and restores default');
    var versions = ctx.editor.model.document.version; var currentData = ctx.editor.getData(); await new Promise(function (resolve) { setTimeout(resolve, 100); });
    assert(ctx.editor.model.document.version === versions && ctx.editor.getData() === currentData, 'Idle sizing adds no model/history writes');
    await close(ctx);
    h.results.push('Caption layout: 852 editor + 852 runtime cases, background/padding/border-box/typography/description and spacing checks, default/intrinsic and all explicit widths, float footprint, safe runtime lifecycle; real four-corner pointer and Tab/Arrow/Shift/Escape/Reset/history');
    await runPapijoCaptionSupplement(h);
  }
  finally { for (var ctx of contexts.slice()) await h.close(ctx); H5P.getPath = originalPath; H5PEditor.t = originalTranslate; }
};

// Short independently runnable coverage for font-dependent fallback, geometry and IDs.
window.runPapijoCaptionSupplement = async function (h) {
  var previous = H5P.getPath, contexts = [], roots = [], runtimes = [], assert = h.assert;
  var definition = { id: 'caption-geometry', image: { path: 'images/large.svg' }, alt: 'Required ALT' };
  var marker = function (width, style) { return '<span class="papijo-inline-image" data-papijo-inline-image-id="caption-geometry"' +
    (width === null ? '' : ' data-papijo-inline-image-width="' + width + '"') +
    (style === 'inline' ? '' : ' data-papijo-inline-image-style="' + style + '"') +
    '><span class="papijo-image-caption">Caption: two  spaces &amp; &lt;b&gt;literal&lt;/b&gt;</span></span>'; };
  async function wait(ctx) {
    await ctx.editor.editing.view.getDomRoot().querySelector('img').decode();
    await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
    await new Promise(function (resolve) { setTimeout(resolve, 50); });
  }
  try {
    H5P.getPath = function () { return '/fixture-large.svg'; };
    var ctx = await h.open('<p>' + marker(1, 'inline') + '</p>', [definition]); contexts.push(ctx);
    var viewRoot = ctx.editor.editing.view.document.getRoot(), count = 0;
    for (var font of [12, 16, 24, 32]) for (var style of ['inline', 'alignLeft', 'alignRight']) {
      ctx.editor.editing.view.change(function (writer) {
        Object.entries({ width: '160px', padding: '0', border: '0', 'box-sizing': 'content-box',
          'min-width': '0', 'max-width': 'none', font: font + 'px Arial' }).forEach(function (entry) { writer.setStyle(entry[0], entry[1], viewRoot); });
      });
      ctx.editor.setData('<p>' + marker(0.1, style) + '</p>'); await h.selectImage(ctx); await wait(ctx);
      var root = ctx.editor.editing.view.getDomRoot(), unit = root.querySelector('.image-inline'), image = unit.querySelector('img'), caption = unit.querySelector('.papijo-image-caption');
      var css = getComputedStyle(unit), gutter = style === 'inline' ? 0 : parseFloat(css.marginLeft) + parseFloat(css.marginRight);
      var expected = PapijoManagedInlineImages.captionSize(image.naturalWidth, 160, gutter, 0.1, font);
      assert(Math.abs(unit.getBoundingClientRect().width - expected.unit) < 0.1 && Math.abs(image.getBoundingClientRect().width - expected.image) < 0.1,
        'Production 8em fallback follows font size and clamps container: ' + font + '/' + style + ' ' + JSON.stringify({
          actualUnit: unit.getBoundingClientRect().width, actualImage: image.getBoundingClientRect().width,
          expected: expected, styles: unit.getAttribute('style'), font: getComputedStyle(caption).fontSize
        }));
      assert(root.scrollWidth <= root.clientWidth + 1, 'Font-dependent fallback stays contained'); count++;
    }
    ctx.editor.editing.view.change(function (writer) { writer.setStyle('font', '16px Arial', viewRoot); });
    for (var style of ['inline', 'alignLeft', 'alignRight']) for (var width of [55.5, 10, 1, 0.1]) {
      ctx.editor.setData('<p>' + marker(width, style) + '</p>'); await h.selectImage(ctx); await wait(ctx);
      var image = ctx.editor.editing.view.getDomRoot().querySelector('img'), ir = image.getBoundingClientRect();
      var cr = ctx.editor.editing.view.getDomRoot().querySelector('.papijo-image-caption').getBoundingClientRect();
      assert(Math.abs(cr.top - ir.bottom - 28) < 0.1, 'Selected caption keeps 28px clearance');
      var handles = Array.from(ctx.editor.ui.view.body).filter(function (v) { return v.element?.classList.contains('papijo-image-resize-handle'); });
      handles.forEach(function (handle, index) {
        var rect = handle.element.getBoundingClientRect();
        var x = Math.max(8, Math.min(innerWidth - 8, (ir.left + ir.right) / 2 + (index % 2 ? 1 : -1) * Math.max(32, ir.width) / 2));
        var y = Math.max(8, Math.min(innerHeight - 8, (ir.top + ir.bottom) / 2 + (index >= 2 ? 1 : -1) * Math.max(32, ir.height) / 2));
        assert(Math.abs((rect.left + rect.right) / 2 - x) < 0.1 && Math.abs((rect.top + rect.bottom) / 2 - y) < 0.1 && rect.bottom < cr.top,
          'Each handle tracks image/minimum hit grid, not caption bottom');
      });
    }
    var ids = [];
    for (var rootIndex = 0; rootIndex < 2; rootIndex++) {
      var root = document.createElement('div'); root.className = 'h5p-advanced-text'; root.style.width = '320px';
      var parsed = new DOMParser().parseFromString('<p>' + marker(1, 'inline').repeat(3) + '</p>', 'text/html');
      root.appendChild(parsed.body.firstChild); document.getElementById('fixture').appendChild(root); roots.push(root);
      var runtime = new H5P.AdvancedTextPapiJoInlineImageRuntime(root, rootIndex, [definition]); runtimes.push(runtime); runtime.initialize();
      for (var image of root.querySelectorAll('img')) {
        await image.decode(); var caption = image.closest('.papijo-inline-image').querySelector('.papijo-image-caption');
        ids.push(caption.id); assert(document.getElementById(image.getAttribute('aria-describedby')) === caption &&
          caption.textContent === 'Caption: two  spaces & <b>literal</b>' && !caption.querySelector('*'), 'Runtime literal text and occurrence description are safe');
      }
    }
    assert(ids.length === 6 && new Set(ids).size === 6, 'Repeated definition across two content roots has six unique caption IDs');
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
    var idleWrites = 0;
    var observer = new MutationObserver(function (records) { idleWrites += records.length; });
    observer.observe(ctx.editor.editing.view.getDomRoot().querySelector('.image-inline'), { attributes: true, attributeFilter: ['style'] });
    roots.forEach(function (root) { root.querySelectorAll('.papijo-inline-image').forEach(function (marker) {
      observer.observe(marker, { attributes: true, attributeFilter: ['style'] });
    }); });
    await new Promise(function (resolve) { setTimeout(resolve, 120); }); observer.disconnect();
    assert(idleWrites === 0, 'Stable editor/runtime sizing has no recurring idle style writes');
    h.results.push('Caption supplement: 12 font/clamp cases, 48 handle positions across widths/styles, six repeated runtime descriptions across two roots');
  }
  finally { runtimes.forEach(function (runtime) { runtime.destroy(); }); roots.forEach(function (root) { root.remove(); });
    for (var ctx of contexts) await h.close(ctx); H5P.getPath = previous; }
};
