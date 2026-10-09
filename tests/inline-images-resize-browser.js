/* Real native models/UI, real pointer capture through the browser runner. */
window.runPapijoInlineImageResize = async function (h) {
  'use strict';
  var assert = h.assert, managed = PapijoManagedInlineImages;
  var originalPath = H5P.getPath, originalTranslate = H5PEditor.t;
  var A = { id: 'resize-A', image: { path: 'images/large.svg' }, alt: 'Large scene' };
  var B = { id: 'resize-B', image: { path: 'images/small.svg' }, alt: 'Wide small scene' };
  var definitions = [A, B];
  var contexts = [];
  var translations = {};
  for (var language of ['en', 'fr']) {
    translations[language] = (await fetch('/language/' + language + '.json').then(function (r) { return r.json(); })).libraryStrings;
  }
  function marker(width, style, link, id) {
    return '<span class="papijo-inline-image" data-papijo-inline-image-id="' + (id || A.id) + '"' +
      (width === undefined ? '' : ' data-papijo-inline-image-width="' + width + '"') +
      (style ? ' data-papijo-inline-image-style="' + style + '"' : '') +
      (link ? ' data-papijo-inline-image-link="https://example.com/details"' : '') + '></span>';
  }
  async function wait(ctx) {
    var images = Array.from(ctx.editor.editing.view.getDomRoot().querySelectorAll('img'));
    await Promise.all(images.map(function (img) {
      return img.complete ? Promise.resolve() : new Promise(function (resolve) { img.addEventListener('load', resolve, { once: true }); });
    }));
    await new Promise(function (resolve) { setTimeout(resolve, 40); });
  }
  async function open(html, language) {
    H5PEditor.t = function (library, key) { return translations[language || 'en'][key] || originalTranslate(library, key); };
    var ctx = await h.open(html || '<p>' + marker(55.5) + '</p>', JSON.parse(JSON.stringify(definitions)), language);
    contexts.push(ctx); await wait(ctx); return ctx;
  }
  async function close(ctx) { contexts.splice(contexts.indexOf(ctx), 1); await h.close(ctx); }
  function width(ctx, value, index) {
    var image = h.imageModel(ctx, index);
    ctx.editor.model.change(function (writer) {
      if (value === undefined) { writer.removeAttribute('papijoImageWidth', image); }
      else { writer.setAttribute('papijoImageWidth', value, image); }
    });
  }
  function modelWidth(ctx, index) { return h.imageModel(ctx, index).getAttribute('papijoImageWidth'); }
  function handles(ctx) {
    return Array.from(ctx.editor.ui.view.body).filter(function (view) {
      return view.element && view.element.classList.contains('papijo-image-resize-handle');
    });
  }
  function selector(corner) { return '.papijo-image-resize-' + corner + ':not(.ck-hidden)'; }
  function history(ctx, action) {
    var before = ctx.editor.getData(); action(); var after = ctx.editor.getData();
    assert(after !== before, 'Resize history action changes canonical data');
    ctx.editor.execute('undo'); assert(ctx.editor.getData() === before, 'One Undo restores exact width state');
    ctx.editor.execute('redo'); assert(ctx.editor.getData() === after, 'One Redo restores exact width state');
  }
  async function drag(ctx, corner, amount, cancel) {
    await h.selectImage(ctx); await wait(ctx);
    var img = ctx.editor.editing.view.getDomRoot().querySelector('img'), ratio = img.naturalWidth / img.naturalHeight;
    var sx = /East/.test(corner) ? 1 : -1, sy = /south/.test(corner) ? 1 : -1;
    await papijoHarnessDrag(selector(corner), sx * amount, sy * amount / ratio, cancel);
    await wait(ctx);
  }
  async function sequentialKeyboard() {
    for (var language of ['en', 'fr']) {
      var ctx = await open('<p>Before ' + marker(55.5, 'alignLeft', true) + ' after</p>', language);
      // Ordinary neighboring form fields must remain in the editor's logical
      // tab order, even though the fixed overlay lives at the end of UI-body.
      var beforeField = document.createElement('button'), afterField = document.createElement('button');
      beforeField.textContent = 'Previous field'; afterField.textContent = 'Next field';
      ctx.shell[0].before(beforeField); ctx.shell[0].after(afterField);
      var target = await h.selectImage(ctx); await wait(ctx);
      var root = ctx.editor.editing.view.getDomRoot();
      var controls = handles(ctx), entry = controls[3].element;
      var baseline = ctx.editor.getData(), store = JSON.stringify(ctx.store.params);
      var version = ctx.editor.model.document.version;
      var attributes = ['inlineImageId', 'imageStyle', 'linkHref', 'alt', 'src'].map(function (key) { return target.getAttribute(key); });
      var activations = 0;
      root.addEventListener('click', function (event) { if (event.target.closest('a')) { activations++; } });
      assert(document.activeElement === root, 'Sequential resize test starts in selected-image editable');
      await papijoHarnessPressFocusedKey('Tab');
      assert(document.activeElement === entry, 'Real Tab from selected image must reach its southeast resize control');
      assert(entry.tabIndex === 0 && controls.slice(0, 3).every(function (view) { return view.element.tabIndex === -1; }) &&
        ctx.editor.ui.focusTracker.isFocused, 'Only one resize control participates in sequential focus, tracked by its owner');
      assert(entry.matches(':focus-visible') && parseFloat(getComputedStyle(entry).outlineWidth) >= 3 &&
        controls[3].label.includes(translations[language].resizeHandlesouthEast),
        'Real keyboard entry has a visible focus outline and translated accessible resize label');
      assert(ctx.editor.getData() === baseline && ctx.editor.model.document.version === version &&
        !ctx.editor.commands.get('undo').isEnabled, 'Tab/focus creates no model or history entry');
      await papijoHarnessPressFocusedKey('ArrowRight'); assert(modelWidth(ctx) === 55.6, 'Reached control fine Arrow step');
      await papijoHarnessPressFocusedKey('Shift+ArrowLeft'); assert(modelWidth(ctx) === 50.6, 'Reached control coarse Shift+Arrow step');
      await papijoHarnessPressFocusedKey('Control+z'); assert(modelWidth(ctx) === 55.6, 'Actual focused Ctrl+Z undoes coarse step');
      await papijoHarnessPressFocusedKey('Control+z'); assert(ctx.editor.getData() === baseline, 'Actual focused Ctrl+Z undoes fine step');
      await papijoHarnessPressFocusedKey('Control+y'); await papijoHarnessPressFocusedKey('Control+y');
      assert(modelWidth(ctx) === 50.6 && document.activeElement === entry, 'Actual focused Ctrl+Y restores steps and handle focus');
      var resized = ctx.editor.getData(); version = ctx.editor.model.document.version;
      await papijoHarnessPressFocusedKey('Escape');
      assert(document.activeElement === root && ctx.editor.model.document.selection.getSelectedElement() === target &&
        ctx.editor.getData() === resized && ctx.editor.model.document.version === version, 'Escape returns to selected image without resizing/history');
      await papijoHarnessPressFocusedKey('Tab'); assert(document.activeElement === entry, 'Tab re-enters resize');
      await papijoHarnessPressFocusedKey('Shift+Tab');
      assert(document.activeElement === root, 'Shift+Tab from resize returns to the editable');
      await papijoHarnessPressFocusedKey('Shift+Tab');
      assert(document.activeElement === beforeField, 'Backward Tab then continues to previous ordinary field');
      await h.selectImage(ctx); await wait(ctx);
      await papijoHarnessPressFocusedKey('Tab'); assert(document.activeElement === entry, 'Tab enters resize again');
      await papijoHarnessPressFocusedKey('Tab');
      assert(document.activeElement === afterField, 'Forward Tab exits to the next ordinary field, not the UI-body start');
      await wait(ctx);
      assert(controls.every(function (view) { return !view.isVisible && view.element.tabIndex === -1; }), 'Focus exit removes hidden handles from tab order');
      assert(JSON.stringify(attributes) === JSON.stringify(['inlineImageId', 'imageStyle', 'linkHref', 'alt', 'src'].map(function (key) {
        return target.getAttribute(key);
      })) && JSON.stringify(ctx.store.params) === store && !activations, 'Keyboard navigation/resizing preserves managed identity, style, link, ALT, source and definitions');

      var peer = await open(undefined, language); await h.selectImage(peer); await wait(peer);
      await papijoHarnessPressFocusedKey('Tab');
      var peerControls = handles(peer), staleElements = peerControls.map(function (view) { return view.element; });
      assert(document.activeElement === peerControls[3].element && controls.every(function (view) { return !view.isVisible; }),
        'Real Tab is isolated to the selected editor instance');
      await papijoHarnessPressFocusedKey('ArrowLeft'); assert(modelWidth(peer) === 55.4 && modelWidth(ctx) === 50.6,
        'Peer keyboard resize cannot modify original instance');
      await close(peer);
      assert(staleElements.every(function (element) { return !element.isConnected; }), 'Destroy while focused removes all owned controls');
      await h.selectImage(ctx); await wait(ctx); await papijoHarnessPressFocusedKey('Tab');
      assert(document.activeElement === entry, 'Surviving editor remains reachable after peer destruction');
      await papijoHarnessPressFocusedKey('Escape');
      beforeField.remove(); afterField.remove(); await close(ctx);
      for (var structure of ['<p>MARKER</p>', '<ul><li>MARKER</li></ul>', '<table><tr><td><p>MARKER</p></td></tr></table>']) {
        ctx = await open(structure.replace('MARKER', marker(55.5)), language);
        beforeField = document.createElement('button'); afterField = document.createElement('button');
        beforeField.textContent = 'Previous field'; afterField.textContent = 'Next field';
        ctx.shell[0].before(beforeField); ctx.shell[0].after(afterField);
        target = await h.selectImage(ctx); await wait(ctx); baseline = ctx.editor.getData();
        await papijoHarnessPressFocusedKey('Tab');
        assert(document.activeElement === handles(ctx)[3].element && ctx.editor.getData() === baseline,
          'Recreated paragraph/list/cell editor Tab reaches resize without native list indentation or document changes');
        await papijoHarnessPressFocusedKey('ArrowRight'); assert(modelWidth(ctx) === 55.6, 'Recreated control has exactly one fine resize listener');
        await papijoHarnessPressFocusedKey('Control+z'); assert(ctx.editor.getData() === baseline, 'Recreated keyboard action remains one undo step');
        await papijoHarnessPressFocusedKey('Shift+Tab');
        root = ctx.editor.editing.view.getDomRoot();
        assert(document.activeElement === root || root.contains(document.activeElement),
          'Recreated handle returns backward to its outer or native table-cell editable');
        await papijoHarnessPressFocusedKey('Shift+Tab');
        // A table-cell editable has tabindex -1. Native backward navigation
        // visits the outer editable before the previous ordinary form field.
        if (document.activeElement === root) { await papijoHarnessPressFocusedKey('Shift+Tab'); }
        assert(document.activeElement === beforeField && ctx.editor.getData() === baseline,
          'Backward navigation from a selected list image must not outdent or create history');
        await h.selectImage(ctx); await wait(ctx); await papijoHarnessPressFocusedKey('Tab');
        await papijoHarnessPressFocusedKey('Tab');
        assert(document.activeElement === afterField && ctx.editor.getData() === baseline,
          'Recreated paragraph/list/cell forward navigation reaches the next field without indentation/history');
        beforeField.remove(); afterField.remove(); await close(ctx);
      }
    }
  }
  try {
    H5P.getPath = function (path) { return /small/.test(path) ? '/fixture-small.svg' : '/fixture-large.svg'; };
    await sequentialKeyboard();
    var ctx = await open('<p>' + marker() + ' ' + marker(30) + ' ' + marker(70) + ' ' + marker(70, null, true) + ' ' + marker(40, 'alignLeft') + '</p>');
    assert([undefined, 30, 70, 70, 40].every(function (value, index) { return modelWidth(ctx, index) === value; }), 'Repeated A occurrences have independent widths');
    var saved = ctx.editor.getData();
    var reopened = await open(saved);
    assert(reopened.editor.getData() === saved, 'Canonical resize save/reopen exact'); await close(reopened);
    var copy = ctx.editor.data.toModel(ctx.editor.data.processor.toView(saved));
    var copied = Array.from(ctx.editor.model.createRangeIn(copy).getItems()).filter(function (item) { return item.is('element', 'imageInline'); });
    assert(copied.length === 5 && copied[1].getAttribute('papijoImageWidth') === 30 && copied[2].getAttribute('papijoImageWidth') === 70, 'Same-editor clipboard model conversion retains independent sizing');
    h.caret(ctx, 0);
    ctx.editor.plugins.get('ClipboardPipeline').fire('inputTransformation', {
      content: ctx.editor.data.processor.toView('<p>' + marker(30) + '</p>'), method: 'paste'
    });
    assert(h.imageModel(ctx).getAttribute('papijoImageWidth') === 30, 'Real same-editor clipboard insertion preserves width');
    ctx.editor.execute('undo'); assert(ctx.editor.getData() === saved, 'One clipboard Undo restores independent original occurrences');
    var storeBefore = JSON.stringify(ctx.store.params);
    await h.selectImage(ctx, 1); width(ctx, 31, 1);
    assert(modelWidth(ctx) === undefined && modelWidth(ctx, 2) === 70 && JSON.stringify(ctx.store.params) === storeBefore, 'Resize does not mutate siblings or definitions');
    await close(ctx);

    ctx = await open(); await h.selectImage(ctx); await wait(ctx);
    assert(handles(ctx).length === 4 && handles(ctx).every(function (view) {
      return view.isVisible && !view.element.closest('a') && !ctx.editor.editing.view.getDomRoot().contains(view.element);
    }), 'Four editor-owned handles outside links and editable');
    var reset = ctx.editor.ui.componentFactory.create('papijoResetImageSize');
    assert(reset.label === translations.en.resetImageSize && reset.icon && !reset.withText, 'Native Reset size icon and English label'); reset.destroy();
    for (var corner of ['northWest', 'northEast', 'southWest', 'southEast']) {
      width(ctx, 55.5); await wait(ctx); var before = ctx.editor.getData(), changes = 0;
      var listener = function () { changes++; }; ctx.editor.model.document.on('change:data', listener);
      await drag(ctx, corner, -20);
      ctx.editor.model.document.off('change:data', listener);
      var after = ctx.editor.getData();
      assert(modelWidth(ctx) < 55.5 && changes === 1, 'All corners: one model update after six preview moves');
      await papijoHarnessPressKey(selector(corner), 'Control+z'); assert(ctx.editor.getData() === before, 'Pointer resize one Ctrl+Z');
      await papijoHarnessPressKey(selector(corner), 'Control+y'); assert(ctx.editor.getData() === after, 'Pointer resize one Ctrl+Y');
    }
    var prior = modelWidth(ctx); await drag(ctx, 'southEast', 20); assert(modelWidth(ctx) > prior, 'Larger resize');
    for (var cancel of [undefined, 'Escape', 'pointercancel', 'lostpointercapture']) {
      var unchanged = ctx.editor.getData(), version = ctx.editor.model.document.version;
      await drag(ctx, 'southEast', cancel ? -20 : 0, cancel);
      assert(ctx.editor.getData() === unchanged && ctx.editor.model.document.version === version, 'Cancel/no-motion has zero model/history changes: ' + cancel);
    }
    for (var reason of ['readOnly', 'replace', 'delete', 'model', 'selection', 'basis', 'destroy']) {
      var stale = await open(); await h.selectImage(stale); await wait(stale);
      var baseline = stale.editor.getData(), version = stale.editor.model.document.version;
      await papijoHarnessBeginResize(selector('southEast'), -20, -15);
      assert(stale.editor.getData() === baseline && stale.editor.model.document.version === version, 'Many pointermoves are strictly view-only');
      if (reason === 'readOnly') { stale.editor.enableReadOnlyMode('during-drag'); }
      else if (reason === 'replace') { stale.editor.model.change(function (writer) { writer.setAttribute('inlineImageId', B.id, h.imageModel(stale)); }); }
      else if (reason === 'delete') { stale.editor.model.change(function (writer) { writer.remove(h.imageModel(stale)); }); }
      else if (reason === 'model') { stale.editor.model.change(function (writer) { writer.setAttribute('linkHref', 'https://example.com/changed', h.imageModel(stale)); }); }
      else if (reason === 'selection') { h.caret(stale, 0); }
      else if (reason === 'basis') { stale.shell.css('width', '120px'); await wait(stale); }
      if (reason === 'destroy') {
        var staleHandles = handles(stale).map(function (view) { return view.element; });
        await close(stale); await papijoHarnessEndResize();
        assert(staleHandles.every(function (element) { return !element.isConnected; }), 'Destroy during captured drag cleans up');
      }
      else {
        var current = stale.editor.getData(); await papijoHarnessEndResize(); await wait(stale);
        assert(stale.editor.getData() === current, 'Release cannot overwrite stale/cancelled target: ' + reason);
        if (reason === 'readOnly') { stale.editor.disableReadOnlyMode('during-drag'); }
        await close(stale);
      }
      await h.selectImage(ctx); await wait(ctx);
    }
    await h.selectImage(ctx); await wait(ctx);
    width(ctx, 55.5); await wait(ctx);
    await papijoHarnessPressFocusedKey('Tab');
    assert(document.activeElement === handles(ctx)[3].element, 'Existing keyboard regression also enters through real Tab');
    await papijoHarnessPressFocusedKey('ArrowRight'); assert(modelWidth(ctx) === 55.6, 'Fine keyboard step 0.1');
    await papijoHarnessPressFocusedKey('Shift+ArrowLeft'); assert(modelWidth(ctx) === 50.6, 'Larger keyboard step 5');
    await papijoHarnessPressFocusedKey('Control+z'); assert(modelWidth(ctx) === 55.6, 'Focused handle Ctrl+Z undoes coarse resize');
    await papijoHarnessPressFocusedKey('Control+z'); assert(modelWidth(ctx) === 55.5, 'Focused handle Ctrl+Z undoes fine resize');
    await papijoHarnessPressFocusedKey('Control+y');
    await papijoHarnessPressFocusedKey('Control+y'); assert(modelWidth(ctx) === 50.6, 'Focused handle Ctrl+Y restores both steps');
    assert(ctx.editor.ui.focusTracker.isFocused && handles(ctx).some(function (view) { return view.element === document.activeElement; }), 'Handle focus retains editor selection on both hosts');
    await papijoHarnessPressFocusedKey('Control+k');
    assert(ctx.editor.plugins.get('ContextualBalloon').visibleView === ctx.editor.plugins.get('LinkUI').formView &&
      modelWidth(ctx) === 50.6, 'Native Ctrl+K from handle focus preserves sized image');
    ctx.editor.plugins.get('LinkUI').formView.cancelButtonView.element.click();
    history(ctx, function () { ctx.editor.execute('papijoResetImageSize'); });
    assert(modelWidth(ctx) === undefined && !ctx.editor.commands.get('papijoResetImageSize').isEnabled, 'Reset removes width and disables itself for default');
    width(ctx, 55.5);
    ctx.editor.commands.get('papijoResetImageSize').forceDisabled('resize-guard-test');
    ctx.editor.execute('papijoResetImageSize'); assert(modelWidth(ctx) === 55.5, 'Reset respects native force-disabled execution guard');
    ctx.editor.commands.get('papijoResetImageSize').clearForceDisabled('resize-guard-test');
    width(ctx, 100); assert(ctx.editor.getData().includes('data-papijo-inline-image-width="100"'), 'Explicit 100 persists separately from default');
    width(ctx, 0.1); assert(modelWidth(ctx) === 0.1, 'Smallest positive width');
    await h.selectImage(ctx); await wait(ctx);
    assert(new Set(handles(ctx).map(function (view) {
      var box = view.element.getBoundingClientRect(); return Math.round(box.left) + ':' + Math.round(box.top);
    })).size === 4, 'Tiny-image corner controls retain four independent positions');
    var idleRenders = 0, renderCounter = function () { idleRenders++; };
    ctx.editor.editing.view.on('render', renderCounter);
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
    ctx.editor.editing.view.off('render', renderCounter);
    assert(idleRenders <= 2, 'No idle render/animation-frame projection loop');
    for (var invalid of ['0', '-1', '101', 'NaN', 'Infinity', '1e1', ' 30', '30 ', '30%', 'calc(30%)', 'url(x)', '30;float:left', '&lt;img&gt;', '30&#10;', '30.00']) {
      ctx.editor.setData('<p>' + marker(invalid) + '</p>');
      assert(modelWidth(ctx) === undefined && !ctx.editor.getData().includes(managed.widthAttribute), 'Import invalid width defaults: ' + invalid);
    }
    for (var invalidModel of [0, -1, 101, NaN, Infinity, 1.11, '1e1', '55%', 'calc(55%)']) {
      width(ctx, invalidModel); assert(modelWidth(ctx) === undefined, 'Direct invalid model size removed');
    }
    ctx.editor.setData('<p>' + marker('30.0') + '</p>'); assert(modelWidth(ctx) === 30 && ctx.editor.getData().includes('width="30"'), 'Import trailing .0 canonicalizes');
    for (var badRuntime of ['0', '-1', '101', 'NaN', 'Infinity', '1e1', '30%', 'calc(30%)', '&lt;img&gt;', '30&#10;']) {
      var unsafeRoot = document.createElement('div'); unsafeRoot.className = 'h5p-advanced-text';
      unsafeRoot.innerHTML = '<p>' + marker(badRuntime).replace('></span>', ' style="width:9999px;position:fixed"></span>') + '</p>';
      document.body.appendChild(unsafeRoot);
      var unsafeRuntime = new H5P.AdvancedTextPapiJoInlineImageRuntime(unsafeRoot, 17, definitions); unsafeRuntime.initialize();
      var unsafeMarker = unsafeRoot.querySelector('span');
      assert(!unsafeMarker.hasAttribute(managed.widthAttribute) && !unsafeMarker.classList.contains(managed.sizeClass) &&
        !unsafeMarker.hasAttribute('style'), 'DOM-decoded runtime invalid width/CSS falls back to default');
      unsafeRuntime.destroy(); unsafeRoot.remove();
    }
    await close(ctx);

    ctx = await open('<p>' + marker(55.5, 'alignLeft', true) + '</p>'); await h.selectImage(ctx);
    var target = h.imageModel(ctx), id = target.getAttribute('inlineImageId'), alt = target.getAttribute('alt');
    var activations = 0; ctx.editor.editing.view.getDomRoot().addEventListener('click', function (event) { if (event.target.closest('a')) { activations++; } });
    await drag(ctx, 'southEast', -20); assert(!activations, 'Linked image resize never activates anchor');
    assert(target.getAttribute('inlineImageId') === id && target.getAttribute('alt') === alt &&
      target.getAttribute('imageStyle') === 'alignLeft' && target.getAttribute('linkHref') === 'https://example.com/details', 'Resize changes only occurrence width');
    var expected = modelWidth(ctx);
    var balloon = ctx.editor.plugins.get('ContextualBalloon');
    var toolbar = balloon.visibleView;
    Array.from(toolbar.items).find(function (item) { return item.label === translations.en.linkInlineImage; }).element.click();
    var linkUi = ctx.editor.plugins.get('LinkUI');
    if (balloon.visibleView === linkUi.actionsView) { linkUi.actionsView.editButtonView.element.click(); }
    assert(balloon.visibleView === linkUi.formView, 'Native Link form opens with sized image');
    linkUi.formView.urlInputView.fieldView.element.value = 'https://example.com/unsaved';
    await wait(ctx); await papijoHarnessDrag(selector('southEast'), -10, -7.5); await wait(ctx);
    assert(balloon.visibleView === linkUi.formView && balloon.view.element.contains(toolbar.element) &&
      linkUi.formView.urlInputView.fieldView.element.value === 'https://example.com/unsaved' && !activations,
      'Resizing from native Link form retains unsaved input and same companion image toolbar');
    linkUi.formView.cancelButtonView.element.click(); expected = modelWidth(ctx);
    for (var style of ['inline', 'alignLeft', 'alignRight']) {
      ctx.editor.execute('imageStyle', { value: style }); assert(modelWidth(ctx) === expected, 'Style preserves width');
    }
    ctx.editor.execute('link', 'https://example.com/new'); assert(modelWidth(ctx) === expected, 'Link editing preserves width');
    ctx.editor.execute('unlink'); assert(modelWidth(ctx) === expected, 'Unlink preserves width');
    ctx.editor.execute('imageTextAlternative', { newValue: 'New ALT' });
    assert(modelWidth(ctx) === expected && target.getAttribute('alt') === 'New ALT', 'ALT preserves width');
    ctx.editor.execute('link', 'https://example.com/replacement');
    await h.selectImage(ctx);
    history(ctx, function () {
      var toolbar = ctx.editor.plugins.get('ContextualBalloon').visibleView;
      // Reuse the real selection-aware H5P provider, including required ALT.
      Array.from(toolbar.items).find(function (view) { return view.papijoManagedImageButton; }).element.click();
      var state = ctx.widget.inlineImageUi;
      assert(state.open && state.$alt.val() === '', 'Real replacement starts with explicitly empty ALT');
      state.imageWidget.setValue({ name: 'image' }, JSON.parse(JSON.stringify(B.image)));
      state.$alt.val(B.alt); state.$form.trigger('submit');
    });
    await wait(ctx);
    var image = ctx.editor.editing.view.getDomRoot().querySelector('img'), bounds = image.getBoundingClientRect();
    assert(modelWidth(ctx) === expected && bounds.width <= 128.5 && Math.abs(bounds.width / bounds.height - 2) < 0.02, 'Replacement uses new ratio/intrinsic cap while preserving size');
    assert(target.getAttribute('imageStyle') === 'alignRight' && target.getAttribute('linkHref') === 'https://example.com/replacement', 'Real replacement and history preserve width/style/link');
    assert(ctx.store.getDefinition(id) && ctx.store.getDefinition(B.id) && alt === A.alt, 'Retained A/B definitions');
    var persisted = document.createElement('div'); persisted.innerHTML = ctx.editor.getData();
    assert(!persisted.querySelector('img,figure,a') && Array.from(persisted.querySelector('span').attributes).every(function (attr) {
      return ['class', managed.attribute, managed.styleAttribute, managed.linkAttribute, managed.widthAttribute].includes(attr.name);
    }), 'No editing CSS, intrinsic dimensions, anchors or handles enter canonical data');
    await close(ctx);

    for (var structure of ['<p>MARKER</p>', '<ul><li>MARKER</li></ul>', '<table><tbody><tr><td><p>MARKER</p></td><td><p>Other cell</p></td></tr></tbody></table>']) {
      ctx = await open(structure.replace('MARKER', marker(55.5)));
      ctx.shell.css('width', Math.min(480, innerWidth - 32) + 'px');
      var region = ctx.editor.editing.view.getDomRoot().querySelector('img').closest('.image-inline').parentElement;
      region.style.padding = '0 12px'; region.style.marginLeft = '15px';
      await h.selectImage(ctx); await wait(ctx);
      var regionStyle = getComputedStyle(region), basis = region.clientWidth - parseFloat(regionStyle.paddingLeft) - parseFloat(regionStyle.paddingRight);
      var actual = region.querySelector('img').getBoundingClientRect();
      assert(Math.abs(actual.width - basis * 0.555) < 1, 'Padding/indent/list/table use local content-box percentage');
      await drag(ctx, 'southEast', -5); assert(modelWidth(ctx) < 55.5, 'Pointer gesture uses containing region rather than editable or wrapper');
      await close(ctx);
    }

    // Runtime and editor use the same local content-box basis, with intrinsic cap.
    ctx = await open();
    for (var regionWidth of [960, 480, 320, 160]) {
      ctx.shell[0].style.width = Math.min(regionWidth, innerWidth - 32) + 'px';
      for (var style of [null, 'alignLeft', 'alignRight']) {
        for (var link of [false, true]) {
          for (var source of [A, B]) {
            for (var percent of [undefined, 55.5, 100]) {
              ctx.editor.setData('<p>' + marker(percent, style, link, source.id) + '</p>'); await wait(ctx);
              var img = ctx.editor.editing.view.getDomRoot().querySelector('img'), parent = img.closest('.image-inline').parentElement;
              while (getComputedStyle(parent).display === 'inline') { parent = parent.parentElement; }
              var computed = getComputedStyle(parent), basis = parent.clientWidth - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight);
              var rect = img.getBoundingClientRect();
              assert(rect.width <= basis + 0.5 && rect.width <= img.naturalWidth + 0.5 &&
                Math.abs(rect.width / rect.height - img.naturalWidth / img.naturalHeight) < 0.05, 'Editor responsive/intrinsic/ratio protection');
              var root = document.createElement('div'); root.className = 'h5p-advanced-text'; root.style.width = basis + 'px'; root.innerHTML = ctx.editor.getData(); document.body.appendChild(root);
              var runtime = new H5P.AdvancedTextPapiJoInlineImageRuntime(root, 17, definitions); runtime.initialize();
              var runtimeImg = root.querySelector('img');
              if (!runtimeImg.complete) { await new Promise(function (resolve) { runtimeImg.onload = resolve; }); }
              var runtimeRect = runtimeImg.getBoundingClientRect();
              assert(runtimeRect.width <= basis + 0.5 && runtimeRect.width <= runtimeImg.naturalWidth + 0.5,
                'Runtime local/intrinsic cap: ' + JSON.stringify({ basis: basis, source: source.id, percent: percent,
                  style: style, link: link, width: runtimeRect.width, natural: runtimeImg.naturalWidth, html: root.innerHTML }));
              if (percent !== undefined) {
                var gutter = style ? parseFloat(getComputedStyle(root.querySelector('span.papijo-inline-image')).fontSize) * 0.75 : 0;
                var expectedPixels = Math.min(basis * percent / 100, runtimeImg.naturalWidth, basis - gutter);
                assert(Math.abs(runtimeRect.width - expectedPixels) < 1 && Math.abs(rect.width - expectedPixels) < 1, 'Exact containing-region percentage in editor and runtime');
              }
              runtime.destroy(); assert(!root.querySelector('.papijo-inline-image-sized') && !root.querySelector('span').style.getPropertyValue('--papijo-image-width'), 'Runtime destroy clears projections'); root.remove();
            }
          }
        }
      }
    }
    await close(ctx);

    for (var language of ['en', 'fr']) {
      ctx = await open(undefined, language); await h.selectImage(ctx); await wait(ctx);
      assert(handles(ctx).every(function (handle) { return handle.label.includes(translations[language].imageResizeKeys); }), 'Translated accessible handle instructions');
      var resetView = ctx.editor.ui.componentFactory.create('papijoResetImageSize');
      assert(resetView.label === translations[language].resetImageSize, 'Localized Reset'); resetView.destroy();
      ctx.editor.enableReadOnlyMode('resize-test'); await wait(ctx);
      assert(handles(ctx).every(function (view) { return !view.isVisible; }) && !ctx.editor.commands.get('papijoResetImageSize').isEnabled, 'Read-only hides handles/disables reset');
      ctx.editor.disableReadOnlyMode('resize-test'); h.caret(ctx, 0); await wait(ctx);
      assert(handles(ctx).every(function (view) { return !view.isVisible; }), 'Text selection hides handles'); await close(ctx);
    }
    var one = await open(), two = await open();
    await h.selectImage(one); await wait(one); var twoData = two.editor.getData();
    width(one, 30); assert(two.editor.getData() === twoData, 'Controllers are instance local');
    var elements = handles(one).map(function (view) { return view.element; });
    await close(one); assert(elements.every(function (element) { return !element.isConnected; }), 'Destroy removes UI and focus registrations'); await close(two);
    ctx = await open(); await h.selectImage(ctx); await wait(ctx); assert(handles(ctx).length === 4, 'Recreation has exactly four fresh handles'); await close(ctx);
    h.results.push('resize: four real pointer corners, one history step, cancellation, keyboard/reset, strict import/model validation, occurrence independence, Link/ALT/Wrap/Replace, 144 responsive source/style/link/default/percentage combinations, both languages/focus/lifecycle');
  }
  finally {
    for (var remaining of contexts.slice()) { await close(remaining); }
    H5P.getPath = originalPath; H5PEditor.t = originalTranslate;
  }
};
