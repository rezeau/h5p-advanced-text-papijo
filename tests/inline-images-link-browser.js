/* Native image links against the actual bundle AND host HTML-widget config. */
window.runPapijoInlineImageLinks = async function (h) {
  'use strict';
  var assert = h.assert, managed = PapijoManagedInlineImages;
  var A = { id: 'link-shared-A', image: { path: 'images/a.png', mime: 'image/png' }, alt: 'Visit photograph details' };
  var X = 'https://example.com/X?q=1&b=2#details', Y = 'http://example.com/Y';
  var originalTranslate = H5PEditor.t;
  var translations = {};
  for (var language of ['en', 'fr']) {
    translations[language] = (await fetch('/language/' + language + '.json').then(function (r) { return r.json(); })).libraryStrings;
  }
  function escape(value) { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function marker(href, style, id) {
    return '<span class="papijo-inline-image" data-papijo-inline-image-id="' + (id || A.id) + '"' +
      (style ? ' data-papijo-inline-image-style="' + style + '"' : '') +
      (href ? ' data-papijo-inline-image-link="' + escape(href) + '"' : '') + '></span>';
  }
  async function open(html, language) {
    H5PEditor.t = function (library, key) {
      return ['linkInlineImage', 'enterValidImageLink', 'imageLinkTargetUnavailable'].includes(key) ?
        translations[language || 'en'][key] : originalTranslate(library, key);
    };
    return h.open(html || '<p>' + marker() + ' ' + marker() + ' ' + marker() + '</p>',
      [JSON.parse(JSON.stringify(A))], language);
  }
  function imageToolbar(ctx) {
    var balloon = ctx.editor.plugins.get('ContextualBalloon');
    return Array.from(balloon.view.content).flatMap(function (view) { return view.content ? Array.from(view.content) : [view]; })
      .find(function (view) { return view.items && Array.from(view.items).some(function (item) { return item.papijoManagedImageButton; }); });
  }
  function assertImageToolbar(ctx, original) {
    var toolbar = imageToolbar(ctx), balloon = ctx.editor.plugins.get('ContextualBalloon');
    assert(toolbar && (!original || toolbar === original) && balloon.hasView(toolbar), 'Same native image toolbar remains registered and displayed');
    var rect = toolbar.element.getBoundingClientRect();
    assert(rect.width && rect.height && rect.left >= 0 && rect.right <= innerWidth &&
      balloon.view.element.contains(toolbar.element), 'Image toolbar physically visible inside native balloon');
    var buttons = Array.from(toolbar.element.querySelectorAll('button'));
    assert(buttons.length === 9 && buttons.every(function (button) {
      var bounds = button.getBoundingClientRect(), hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      return bounds.width && bounds.height && hit && button.contains(hit);
    }), 'All nine image controls remain directly reachable');
    return toolbar;
  }
  async function form(ctx) {
    await h.selectImage(ctx);
    var balloon = ctx.editor.plugins.get('ContextualBalloon');
    var toolbar = assertImageToolbar(ctx);
    var button = Array.from(toolbar.items || []).find(function (item) { return item.label === translations[ctx.editor.locale.uiLanguage].linkInlineImage; });
    assert(button && button.icon && !button.withText && button.tooltip && button.element.querySelector('svg'), 'Native chain icon and image-specific label');
    button.element.click();
    var ui = ctx.editor.plugins.get('LinkUI');
    if (balloon.visibleView === ui.actionsView) { ui.actionsView.editButtonView.element.click(); }
    assert(balloon.visibleView === ui.formView && ui.formView.element.closest('.papijo-managed-image-link-ui'), 'Native scoped Link form');
    assertImageToolbar(ctx, toolbar);
    assert(document.activeElement === ui.formView.urlInputView.fieldView.element, 'Native URL focus');
    assert(Array.from(ui.formView.element.querySelectorAll('.ck-switchbutton')).every(function (item) {
      return !item.getClientRects().length;
    }), 'Image decorator controls must be hidden');
    return ui.formView;
  }
  function submit(view, href) {
    view.urlInputView.fieldView.element.value = href;
    view.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }
  function history(ctx, action) {
    var before = ctx.editor.getData(); action(); var after = ctx.editor.getData();
    assert(after !== before, 'History action must change data');
    ctx.editor.execute('undo'); assert(ctx.editor.getData() === before, 'One Undo restores exact data');
    ctx.editor.execute('redo'); assert(ctx.editor.getData() === after, 'One Redo restores exact data');
  }
  function clean(ctx) {
    var data = document.createElement('div'); data.innerHTML = ctx.editor.getData();
    assert(!data.querySelector('img,figure'), 'No raw image or block persistence');
    data.querySelectorAll('span.papijo-inline-image').forEach(function (item) {
      assert(!item.closest('a'), 'No native image anchor persistence');
      assert(Array.from(item.attributes).every(function (attribute) {
        return ['class', managed.attribute, managed.styleAttribute, managed.linkAttribute, managed.widthAttribute].includes(attribute.name);
      }), 'Canonical image marker attribute allowlist');
    });
    Array.from(ctx.editor.model.createRangeIn(ctx.editor.model.document.getRoot()).getItems()).forEach(function (item) {
      assert(item.name !== 'imageBlock', 'No block conversion');
      if (item.name !== 'imageInline') { return; }
      assert(Array.from(item.getAttributeKeys()).every(function (key) { return !/^link/.test(key) || key === 'linkHref'; }), 'No decorator model state');
    });
    ctx.editor.editing.view.getDomRoot().querySelectorAll('a').forEach(function (item) {
      assert(!item.hasAttribute('target') && !item.hasAttribute('rel') && !item.hasAttribute('download'), 'No editing image decorators');
    });
    assert(!ctx.editor.commands.get('replaceImageSource').isEnabled && !ctx.editor.commands.get('insertImage').isEnabled &&
      !ctx.editor.plugins.has('ImageUpload') && !ctx.editor.plugins.has('FileRepository'), 'Managed upload/file ownership unchanged');
  }
  async function acceptanceRegressions(language) {
    // Real pointer checks need a representative image, not the 1px transport
    // stub used by serialization tests. Retain managed resolution/projection.
    var previousPath = H5P.getPath;
    H5P.getPath = function () { return '/fixture-large.svg'; };
    var ctx = await open('<p>Before ' + marker() + ' after ' + marker(X) + ' end</p>', language);
    var editor = ctx.editor, balloon = editor.plugins.get('ContextualBalloon'), ui = editor.plugins.get('LinkUI');
    async function settle() { editor.ui.update(); await new Promise(function (resolve) { setTimeout(resolve, 25); }); }
    async function click(element) {
      element.setAttribute('data-papijo-acceptance-click', 'target');
      try { await window.papijoHarnessClick('[data-papijo-acceptance-click="target"]'); }
      finally { element.removeAttribute('data-papijo-acceptance-click'); }
      await settle();
    }
    async function selectAndClickImage(index) {
      var image = await h.selectImage(ctx, index);
      var preview = editor.editing.view.getDomRoot().querySelectorAll('img')[index || 0];
      await preview.decode(); await click(preview);
      assert(editor.model.document.selection.getSelectedElement() === image, 'Real mouse click selects expected image');
      assert(ctx.widget.$createTooltipButton.prop('hidden'), 'Add Tooltip hidden for real image selection');
      return assertImageToolbar(ctx);
    }
    function textSelection() {
      var block = editor.model.document.getRoot().getChild(0);
      editor.model.change(function (writer) {
        writer.setSelection(writer.createRange(writer.createPositionAt(block, 0), writer.createPositionAt(block, 6)));
      });
    }
    function noTooltipCreation(message) {
      var before = editor.getData(), result = editor.execute('createPapijoTooltip', { tooltipText: 'Must not annotate objects' });
      assert(ctx.widget.$createTooltipButton.prop('hidden') && !result.valid && editor.getData() === before, message);
    }
    try {
      textSelection(); await settle();
      assert(!ctx.widget.$createTooltipButton.prop('hidden'), 'Text selection offers Add Tooltip before selecting image');
      h.caret(ctx, 3); await settle(); noTooltipCreation('Collapsed caret cannot create tooltip');
      var toolbar = await selectAndClickImage(0);
      assert(balloon.visibleView === toolbar, 'Unlinked click shows native image toolbar');
      noTooltipCreation('Unlinked image cannot create tooltip');
      await click(Array.from(toolbar.items).find(function (item) { return item.label === translations[language].linkInlineImage; }).element);
      var view = ui.formView;
      assert(balloon.visibleView === view && document.activeElement === view.urlInputView.fieldView.element, 'Native image form URL focus');
      assertImageToolbar(ctx, toolbar);
      view.urlInputView.fieldView.element.value = X;
      await click(view.saveButtonView.element);
      assert(h.imageModel(ctx).getAttribute('linkHref') === X, 'Native Save links selected image');
      assertImageToolbar(ctx, toolbar);
      await selectAndClickImage(0);
      assert(balloon.visibleView === ui.actionsView, 'Real linked-image click opens native actions beside image toolbar');
      assertImageToolbar(ctx, toolbar); noTooltipCreation('Linked image cannot create tooltip');
      await click(Array.from(toolbar.items).find(function (item) { return item.label === translations[language].linkInlineImage; }).element);
      assert(balloon.visibleView === view, 'Chain button remains usable while actions are open');
      assertImageToolbar(ctx, toolbar);
      var before = editor.getData(); view.urlInputView.fieldView.element.value = Y;
      await click(view.cancelButtonView.element);
      assert(editor.getData() === before && balloon.visibleView === ui.actionsView, 'Native Cancel keeps link and actions');
      assertImageToolbar(ctx, toolbar);
      await click(ui.actionsView.editButtonView.element);
      assert(balloon.visibleView === view, 'Native Edit opens form');
      assertImageToolbar(ctx, toolbar);
      view.urlInputView.fieldView.element.setAttribute('data-papijo-acceptance-key', 'url');
      await window.papijoHarnessPressKey('[data-papijo-acceptance-key="url"]', 'Escape');
      view.urlInputView.fieldView.element.removeAttribute('data-papijo-acceptance-key'); await settle();
      assert(editor.getData() === before && document.activeElement === editor.editing.view.getDomRoot(), 'Escape keeps data and native editable focus');
      assertImageToolbar(ctx, toolbar);
      await selectAndClickImage(0); await click(ui.actionsView.editButtonView.element);
      view.urlInputView.fieldView.element.value = Y; await click(view.saveButtonView.element);
      assert(h.imageModel(ctx).getAttribute('linkHref') === Y, 'Native edited URL Save');
      assertImageToolbar(ctx, toolbar);
      await selectAndClickImage(0); await click(ui.actionsView.unlinkButtonView.element);
      assert(!h.imageModel(ctx).hasAttribute('linkHref'), 'Native Unlink');
      assertImageToolbar(ctx, toolbar);
      assert(await selectAndClickImage(1) === toolbar && balloon.visibleView === ui.actionsView,
        'Another linked image uses same toolbar with native actions');
      await click(ui.actionsView.editButtonView.element); assertImageToolbar(ctx, toolbar);
      textSelection(); await settle();
      assert(!imageToolbar(ctx) && !ctx.widget.$createTooltipButton.prop('hidden'), 'Image/form to text restores Add Tooltip and removes companion toolbar');
      var textButton = editor.ui.componentFactory.create('link'); textButton.render(); textButton.element.click();
      assert(balloon.visibleView === ui.formView && !ui.formView.element.closest('.papijo-managed-image-link-ui') && !imageToolbar(ctx),
        'Ordinary native Link form has no image toolbar or image adaptation');
      await click(ui.formView.cancelButtonView.element);
      textSelection(); await settle();
      assert(!ctx.widget.$createTooltipButton.prop('hidden'), 'Text Add Tooltip restored after ordinary Link UI');
      await click(ctx.widget.$createTooltipButton[0]);
      ctx.widget.$tooltipInput.val('Acceptance tooltip'); ctx.widget.$tooltipForm.trigger('submit');
      assert(editor.getData().includes('data-papijo-tooltip="Acceptance tooltip"'), 'Real Add Tooltip workflow still inserts text annotation');
      h.caret(ctx, 3); await settle();
      assert(!ctx.widget.$editTooltipButton.prop('hidden') && ctx.widget.$createTooltipButton.prop('hidden'), 'Existing text tooltip detection at collapsed caret intact');
      await click(ctx.widget.$editTooltipButton[0]);
      ctx.widget.$tooltipInput.val('Edited acceptance tooltip'); ctx.widget.$tooltipForm.trigger('submit');
      assert(editor.getData().includes('data-papijo-tooltip="Edited acceptance tooltip"'), 'Existing tooltip Edit still works');
      await selectAndClickImage(0); noTooltipCreation('Text/tooltip to image updates button and command guards');
      var block = editor.model.document.getRoot().getChild(0);
      editor.model.change(function (writer) {
        writer.setSelection(writer.createRange(writer.createPositionAt(block, 0), writer.createPositionAt(block, 8)));
      }); await settle(); noTooltipCreation('Mixed text and image object selection cannot create tooltip');
      editor.model.schema.register('papijoAcceptanceObject', { inheritAllFrom: '$inlineObject' });
      ['editingDowncast', 'dataDowncast'].forEach(function (pipeline) {
        editor.conversion.for(pipeline).elementToElement({ model: 'papijoAcceptanceObject',
          view: function (_model, api) { return api.writer.createEmptyElement('span', { 'class': 'papijo-acceptance-object' }); } });
      });
      editor.model.change(function (writer) {
        var object = writer.createElement('papijoAcceptanceObject');
        writer.insert(object, block, 'end'); writer.setSelection(object, 'on');
      }); await settle(); noTooltipCreation('Other inline schema object cannot create tooltip');
      textSelection(); await settle();
      assert(!imageToolbar(ctx) && ctx.widget.$createTooltipButton.prop('hidden') && !ctx.widget.$editTooltipButton.prop('hidden'),
        'Existing annotated text remains an Edit target after object selection');
      h.results.push({ manualBugRegressions: 'real mouse/link form/actions/focus and text-only tooltip guards PASS',
        language: language, viewport: innerWidth });
    }
    finally { H5P.getPath = previousPath; await h.close(ctx); }
  }
  var badUrls = ['', 'javascript:window.papijoExecuted=true', 'JaVaScRiPt:x', 'java\nscript:x',
    'data:text/html,<svg>', 'blob:https://example.com/id', 'file:///C:/x', 'ftp://example.com', 'ftps://example.com',
    'mailto:a@example.com', 'tel:+33123', '//example.com', '../page', '/page', '#section', 'example.com',
    '%6aavascript:x', 'java%73cript:x', 'jav&#x61;script:x', 'https%3a//example.com', 'https&#58;//example.com',
    'https://', 'https:///example.com', 'https:\\example.com', 'https://example.com/%ZZ',
    'https://user:secret@example.com', 'https://@example.com', 'https://example.com/a b',
    'https://example.com/a\u00a0b', 'https://example.com/\u0000', 'https://example.com/\u007f',
    'https://example.com/a\\b', 'https://example.com/<x>', 'https://example.com/"x'];
  try {
    var host = await fetch('/harness-host.json').then(function (r) { return r.json(); });
    var hostSource = await fetch('/h5peditor-html.js').then(function (r) { return r.text(); });
    assert(host.htmlWidgetPath && host.htmlWidgetSha256, 'Actual host asset identity must be reported');
    var wp = hostSource.includes('addTargetToExternalLinks: true');
    var ctx = await open(); var editor = ctx.editor;
    assert(editor.config.get('link.addTargetToExternalLinks') === wp, 'Editor must use the served actual host link config');
    assert(wp ? !editor.config.get('link.decorators') : editor.config.get('link.decorators').openInNewTab.defaultValue,
      'Host decorator configuration must remain intact');
    assert(!editor.plugins.has('LinkImage') && editor.plugins.has('LinkUI'), 'Use ordinary native Link, no LinkImage');
    var definitions = JSON.stringify(ctx.store.params), before = editor.getData();
    assert(before === '<p>' + marker() + marker() + marker() + '</p>', 'Unlinked persistence unchanged');
    var view = await form(ctx);
    for (var bad of badUrls) {
      submit(view, bad);
      assert(editor.getData() === before && editor.plugins.get('ContextualBalloon').visibleView === view &&
        view.urlInputView.errorText, 'Invalid form URL must keep form open without data/history: ' + bad);
    }
    view.cancelButtonView.element.click();
    assert(editor.getData() === before && !editor.commands.get('undo').isEnabled, 'Cancel invalid form has no history');
    view = await form(ctx); history(ctx, function () { submit(view, X); }); clean(ctx);
    assert(h.imageModel(ctx).getAttribute('linkHref') === X && JSON.stringify(ctx.store.params) === definitions, 'URL occurrence only');
    view = await form(ctx); history(ctx, function () { submit(view, Y); });
    assert(h.imageModel(ctx).getAttribute('alt') === A.alt && h.imageModel(ctx).getAttribute('inlineImageId') === A.id, 'Link edits preserve ID/ALT');
    var ui = editor.plugins.get('LinkUI'); await h.selectImage(ctx);
    if (editor.plugins.get('ContextualBalloon').visibleView !== ui.actionsView) {
      var actionButton = editor.ui.componentFactory.create('papijoLinkImage'); actionButton.render(); actionButton.element.click();
    }
    assert(editor.plugins.get('ContextualBalloon').visibleView === ui.actionsView, 'Native existing-link actions visible');
    history(ctx, function () { ui.actionsView.unlinkButtonView.element.click(); });
    assert(!h.imageModel(ctx).hasAttribute('linkHref'), 'Unlink removes occurrence URL');
    await h.selectImage(ctx); editor.execute('link', X);
    await h.selectImage(ctx, 1); editor.execute('link', Y);
    await h.selectImage(ctx);
    for (var style of ['alignLeft', 'alignRight', 'inline']) {
      history(ctx, function () { editor.execute('imageStyle', { value: style }); });
      assert(h.imageModel(ctx).getAttribute('linkHref') === X, 'Style history preserves URL');
    }
    history(ctx, function () { editor.execute('imageTextAlternative', { newValue: 'Revised destination description' }); });
    assert(h.imageModel(ctx).getAttribute('linkHref') === X, 'ALT revision history preserves URL');
    editor.execute('imageStyle', { value: 'alignLeft' });
    editor.editing.view.getDomRoot().setAttribute('data-papijo-link-keyboard', 'replace-target');
    await window.papijoHarnessPressKey('[data-papijo-link-keyboard="replace-target"]', 'Escape');
    var target = await h.selectImage(ctx), replaceToolbar = editor.plugins.get('ContextualBalloon').visibleView;
    Array.from(replaceToolbar.items).find(function (item) { return item.papijoManagedImageButton; }).element.click();
    var state = ctx.widget.inlineImageUi;
    state.imageWidget.setValue({ name: 'image' }, { path: 'images/b.png', mime: 'image/png' }); state.$alt.val('Replacement destination description');
    history(ctx, function () { state.$form.trigger('submit'); });
    assert(target.getAttribute('inlineImageId') !== A.id && target.getAttribute('linkHref') === X && target.getAttribute('imageStyle') === 'alignLeft', 'Replacement preserves link/style');
    assert(h.imageModel(ctx, 1).getAttribute('inlineImageId') === A.id && h.imageModel(ctx, 1).getAttribute('linkHref') === Y &&
      h.imageModel(ctx, 2).getAttribute('inlineImageId') === A.id && !h.imageModel(ctx, 2).hasAttribute('linkHref'), 'X/Y/unlinked siblings isolated');
    clean(ctx);
    var saved = editor.getData(), reopened = await h.open(saved, JSON.parse(JSON.stringify(ctx.store.params)));
    assert(reopened.editor.getData() === saved && h.imageModel(reopened).getAttribute('linkHref') === X, 'Save/reopen URL/ID/style');
    await h.close(reopened);
    await h.selectImage(ctx); var copied = editor.data.stringify(editor.model.getSelectedContent(editor.model.document.selection));
    editor.model.change(function (writer) { writer.setSelection(editor.model.document.getRoot().getChild(0), 'end'); editor.model.insertContent(editor.data.parse(copied)); });
    assert(h.imageModel(ctx, 3).getAttribute('linkHref') === X && h.imageModel(ctx, 3).getAttribute('inlineImageId') === target.getAttribute('inlineImageId'), 'Same editor native fragment copy');
    await h.close(ctx);
    h.results.push({ imageLinkHistory: 'add/edit/unlink/style/ALT/replace/copy/reopen PASS', actualHost: host, wpAutomaticDecorators: wp });

    // Command, model-write, import and surrounding-anchor security boundaries.
    ctx = await open('<p>' + marker(X, 'alignRight') + '</p>'); editor = ctx.editor; await h.selectImage(ctx);
    for (bad of badUrls) {
      before = editor.getData(); editor.execute('link', bad, { linkOpenInNewTab: true });
      assert(editor.getData() === before, 'Unsafe direct command ignored: ' + bad);
      editor.model.change(function (writer) { writer.setAttribute('linkHref', bad, h.imageModel(ctx)); });
      assert(!h.imageModel(ctx).hasAttribute('linkHref'), 'Unsafe model write removed: ' + bad);
      editor.setData('<p><a href="' + escape(bad) + '" target="_blank" rel="x" download="x" custom="x">' + marker(bad) + '</a></p>');
      assert(!h.imageModel(ctx).hasAttribute('linkHref') && !editor.getData().includes('<a'), 'Unsafe imported wrapper/marker stripped: ' + bad);
      editor.setData('<p>' + marker(X, 'alignRight') + '</p>'); await h.selectImage(ctx);
    }
    for (var pair of [[X, Y, X], ['javascript:x', Y, Y], [null, Y, Y], [X, 'javascript:x', X]]) {
      editor.setData('<p><a href="' + escape(pair[1]) + '" target="_blank" rel="x" download="x" custom="x">' + marker(pair[0]) + '</a></p>');
      assert(h.imageModel(ctx).getAttribute('linkHref') === pair[2], 'Explicit valid marker wins; otherwise supported wrapper fallback'); clean(ctx);
    }
    editor.setData('<p><a href="https://example.com/text" target="_blank" rel="noopener noreferrer">before ' + marker(X) + ' after</a></p>');
    var parsed = document.createElement('div'); parsed.innerHTML = editor.getData();
    assert(parsed.querySelectorAll('a').length === 2 && parsed.querySelector('span').getAttribute(managed.linkAttribute) === X,
      'Imported surrounding anchor becomes image attribute and preserves adjacent text links');
    assert(Array.from(parsed.querySelectorAll('a')).every(function (a) { return a.getAttribute('href') === 'https://example.com/text'; }), 'Text href preserved');
    await h.close(ctx);

    for (var failure of ['moved-selection', 'changed-id', 'deleted', 'read-only']) {
      ctx = await open(); editor = ctx.editor; view = await form(ctx); target = h.imageModel(ctx);
      if (failure === 'moved-selection') { await h.selectImage(ctx, 1); }
      if (failure === 'changed-id') {
        var revised = ctx.store.addDefinition(A.image, 'Changed while form open');
        editor.model.change(function (writer) { writer.setAttribute('inlineImageId', revised.id, target); });
      }
      if (failure === 'deleted') { editor.model.change(function (writer) { writer.remove(target); }); }
      if (failure === 'read-only') { editor.enableReadOnlyMode('link-test'); }
      before = editor.getData(); definitions = JSON.stringify(ctx.store.params); submit(view, X);
      assert(editor.getData() === before && JSON.stringify(ctx.store.params) === definitions, 'Stale/read-only form cannot redirect or change data: ' + failure);
      if (failure === 'read-only') { editor.disableReadOnlyMode('link-test'); }
      await h.close(ctx);
    }
    ctx = await h.open('<p>' + marker(null, null, 'missing-definition') + '</p>', []); await h.selectImage(ctx);
    assert(!ctx.editor.commands.get('link').isEnabled && !ctx.editor.commands.get('unlink').isEnabled, 'Missing definition disables link commands');
    await h.close(ctx);

    // Reused native form must retain ordinary text decorators and sizing.
    ctx = await open('<p>' + marker() + ' Ordinary text</p>'); editor = ctx.editor;
    view = await form(ctx); view.cancelButtonView.element.click();
    editor.model.change(function (writer) { writer.setSelection(writer.createRange(writer.createPositionAt(editor.model.document.getRoot().getChild(0), 2),
      writer.createPositionAt(editor.model.document.getRoot().getChild(0), 10))); });
    var textButton = editor.ui.componentFactory.create('link'); textButton.render(); textButton.element.click();
    ui = editor.plugins.get('LinkUI'); view = ui.formView;
    assert(!view.element.closest('.papijo-managed-image-link-ui'), 'Ordinary Link form not adapted');
    assert(wp ? !view.element.querySelector('.ck-switchbutton') : view.element.querySelector('.ck-switchbutton').getClientRects().length,
      'Ordinary host text decorator UI intact');
    submit(view, 'example.com/text');
    assert(editor.getData().includes('href="http://example.com/text"') && editor.getData().includes('target="_blank"') &&
      editor.getData().includes('rel="noopener noreferrer"'), 'Native text default protocol and host decorators unchanged');
    await h.close(ctx);

    // Both languages at each runner viewport, native keyboard and form/actions bounds.
    for (language of ['en', 'fr']) {
      ctx = await open('<p>' + marker() + '</p>', language); editor = ctx.editor; await h.selectImage(ctx);
      var balloon = editor.plugins.get('ContextualBalloon'), toolbar = balloon.visibleView;
      var rect = toolbar.element.getBoundingClientRect();
      var toolbarHeight = rect.height;
      assert(rect.left >= 0 && rect.right <= innerWidth && toolbar.element.querySelectorAll('button').length === 9, 'Nine image controls fit viewport');
      assert(!editor.config.get('toolbar.shouldNotGroupWhenFull'), 'Main toolbar grouping unchanged');
      editor.editing.view.getDomRoot().setAttribute('data-papijo-link-keyboard', 'editable');
      await window.papijoHarnessPressKey('[data-papijo-link-keyboard="editable"]', 'Control+k');
      ui = editor.plugins.get('LinkUI'); assert(balloon.visibleView === ui.formView, 'Ctrl+K opens native image form');
      view = ui.formView; rect = view.element.getBoundingClientRect();
      assert(rect.left >= 0 && rect.right <= innerWidth, 'Native image Link form fits viewport ' + innerWidth);
      view.urlInputView.fieldView.element.setAttribute('data-papijo-link-keyboard', 'url');
      before = editor.getData();
      await window.papijoHarnessPressKey('[data-papijo-link-keyboard="url"]', 'Escape');
      assert(editor.getData() === before && document.activeElement === editor.editing.view.getDomRoot(), 'Escape/focus no history');
      view = await form(ctx); submit(view, X); await h.selectImage(ctx);
      Array.from(balloon.visibleView.items).find(function (item) { return item.label === translations[language].linkInlineImage; }).element.click();
      assert(balloon.visibleView === ui.actionsView, 'Native Edit/Unlink actions visible');
      rect = ui.actionsView.element.getBoundingClientRect(); assert(rect.left >= 0 && rect.right <= innerWidth, 'Native actions fit viewport ' + innerWidth);
      assert(ui.actionsView.editButtonView.element.getBoundingClientRect().width && ui.actionsView.unlinkButtonView.element.getBoundingClientRect().width, 'Edit/Unlink usable');
      h.results.push({ imageLinkLanguage: language, viewport: innerWidth, toolbarHeight: toolbarHeight, linkActionsWidth: rect.width });
      await h.close(ctx);
      await acceptanceRegressions(language);
    }

    // Actual runtime DOM: URL-only anchors, float geometry, Enter, repeat lifecycle.
    var nativePath = H5P.getPath; H5P.getPath = function () { return '/fixture-large.svg'; };
    try {
      for (var style of [null, 'alignLeft', 'alignRight']) {
        var root = document.createElement('div'); root.className = 'h5p-advanced-text'; root.style.width = Math.min(220, innerWidth - 20) + 'px';
        root.innerHTML = '<p><a href="' + Y + '" target="_blank" rel="x" download="x" custom="x">before <em>' + marker(X, style) + '</em> after</a></p>';
        document.body.appendChild(root);
        var runtime = new H5P.AdvancedTextPapiJoInlineImageRuntime(root, 17, [A]); runtime.initialize();
        var image = root.querySelector('img'), anchor = image.parentElement; await image.decode();
        assert(anchor.matches('a.papijo-inline-image-link') && anchor.getAttribute('href') === X &&
          Array.from(anchor.attributes).map(function (a) { return a.name; }).sort().join(',') === 'class,href', 'Runtime URL/class only');
        assert(!anchor.parentElement.closest('a') && image.alt === A.alt, 'No nested anchor; ALT on img');
        assert(root.textContent.includes('before') && root.textContent.includes('after'), 'Splitting preserves adjacent text');
        assert(Array.from(root.querySelectorAll('a:not(.papijo-inline-image-link)')).every(function (a) { return a.href === Y; }), 'Adjacent ordinary runtime text hrefs unchanged');
        assert(Math.abs(anchor.getBoundingClientRect().height - image.getBoundingClientRect().height) < 1 &&
          image.getBoundingClientRect().bottom <= root.getBoundingClientRect().bottom + 1, 'Link focus box and float containment');
        var activation = 0; anchor.addEventListener('click', function (event) { event.preventDefault(); activation++; });
        anchor.setAttribute('data-papijo-link-keyboard', 'runtime');
        await window.papijoHarnessPressKey('[data-papijo-link-keyboard="runtime"]', 'Enter');
        anchor.removeAttribute('data-papijo-link-keyboard'); assert(activation === 1, 'Native Enter activation');
        assert(!anchor.hasAttribute('role') && !anchor.hasAttribute('tabindex') && !anchor.hasAttribute('aria-label'), 'No redundant accessibility attributes');
        runtime.initialize(); assert(root.querySelectorAll('img').length === 1 && root.querySelectorAll('a.papijo-inline-image-link').length === 1, 'Reinitialize no nested/duplicate links');
        runtime.destroy(); root.remove();
      }
      for (pair of [[X, Y, X], ['javascript:x', Y, Y], [null, Y, Y], [X, 'javascript:x', X]]) {
        root = document.createElement('div');
        root.innerHTML = '<p><a href="' + escape(pair[1]) + '" target="_blank" download="x">' + marker(pair[0]) + '</a></p>';
        runtime = new H5P.AdvancedTextPapiJoInlineImageRuntime(root, 17, [A]); runtime.initialize();
        anchor = root.querySelector('img').parentElement;
        assert(anchor.getAttribute('href') === pair[2] && root.querySelector('span').getAttribute(managed.linkAttribute) === pair[2] &&
          !anchor.parentElement.closest('a') && !anchor.hasAttribute('target') && !anchor.hasAttribute('download'),
          'Runtime explicit marker precedence / valid nearest wrapper fallback');
        runtime.destroy();
      }
      for (bad of badUrls.concat(['jav&#x61;script:window.papijoExecuted=true'])) {
        root = document.createElement('div'); root.className = 'h5p-advanced-text';
        root.innerHTML = '<p><a href="' + escape(bad) + '">' + marker(bad) + '</a></p>'; document.body.appendChild(root);
        runtime = new H5P.AdvancedTextPapiJoInlineImageRuntime(root, 17, [A]); runtime.initialize();
        assert(root.querySelector('img') && !root.querySelector('img').closest('a') && !root.querySelector('span').hasAttribute(managed.linkAttribute), 'Invalid marker/wrapper renders unlinked');
        runtime.destroy(); root.remove();
      }
      root = document.createElement('div'); root.innerHTML = '<a href="jav&#x61;script:x">' + marker() + '</a>';
      runtime = new H5P.AdvancedTextPapiJoInlineImageRuntime(root, 17, [A]); runtime.initialize();
      assert(!root.querySelector('img').closest('a'), 'DOM-decoded entity scheme cannot bypass runtime'); runtime.destroy();
    }
    finally { H5P.getPath = nativePath; }
    h.results.push('Image Link security/runtime: strict URLs, form/command/model/upcast/runtime, marker precedence, surrounding anchors, native Enter, text/decorator isolation PASS');
  }
  finally { H5PEditor.t = originalTranslate; }
};

// Native navigation is intercepted by the runner with HTTP 204, never by this
// click probe. This keeps the document alive while recording real attempts.
window.runPapijoManagedLinkClick = async function (h) {
  'use strict';
  var originalPath = H5P.getPath, contexts = [], outcomes = [];
  var definition = { id: 'linked-click', image: { path: 'images/large.svg' }, alt: 'Required image ALT' };
  async function click(element, options) {
    // Use an exposed point inside the image; native balloons may cover its
    // center while preserving other directly clickable parts of the image.
    if (element.tagName === 'IMG' && !options) {
      var rect = element.getBoundingClientRect();
      for (var point of [[0.5, 0.98], [0.98, 0.98], [0.02, 0.98], [0.5, 0.8], [0.5, 0.5], [0.2, 0.8], [0.8, 0.8]]) {
        if (document.elementFromPoint(rect.left + rect.width * point[0], rect.top + rect.height * point[1]) === element) {
          options = { position: { x: rect.width * point[0], y: rect.height * point[1] } }; break;
        }
      }
      if (!options) { throw Error('No exposed image hit point: ' + JSON.stringify({ rect: rect.toJSON(), viewport: [innerWidth, innerHeight],
        hit: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.outerHTML.slice(0, 300),
        toolbarRect: document.querySelector('.ck-balloon-panel')?.getBoundingClientRect().toJSON(), widget: element.closest('.image-inline')?.className })); }
    }
    element.setAttribute('data-managed-link-click', 'target');
    try { await papijoHarnessClick('[data-managed-link-click="target"]', options); }
    finally { element.removeAttribute('data-managed-link-click'); }
    await new Promise(function (resolve) { setTimeout(resolve, 60); });
  }
  function toolbar(ctx) {
    var balloon = ctx.editor.plugins.get('ContextualBalloon');
    return Array.from(balloon.view.content).flatMap(function (view) { return view.content ? Array.from(view.content) : [view]; })
      .find(function (view) { return view.items && Array.from(view.items).some(function (item) { return item.papijoManagedImageButton; }); });
  }
  try {
    H5P.getPath = function () { return '/fixture-large.svg'; };
    for (var captioned of [false, true]) {
      var url = 'https://example.com/papijo-editor-click-probe?captioned=' + captioned;
      var marker = '<span class="papijo-inline-image" data-papijo-inline-image-id="linked-click" data-papijo-inline-image-width="25">' +
        (captioned ? '<span class="papijo-image-caption">Unlinked caption</span>' : '') + '</span>';
      var ctx = await h.open('<p>Cursor before image</p><p>' + marker + '</p><p>Cursor after image</p>', [definition]); contexts.push(ctx);
      var editor = ctx.editor, root = editor.editing.view.getDomRoot(), target = await h.selectImage(ctx);
      editor.execute('link', url);
      h.caret(ctx, 0);
      editor.ui.update(); await new Promise(function (resolve) { setTimeout(resolve, 60); });
      var image = root.querySelector('img'); await image.decode();
      var events = [];
      function record(event) { events.push({ event: event, path: event.composedPath().filter(function (node) { return node.nodeType === 1; })
        .map(function (node) { return node.tagName + (node.className ? '.' + String(node.className).replace(/\s+/g, '.') : ''); }) }); }
      root.addEventListener('click', record);
      var before = await papijoHarnessNavigations(), data = editor.getData(), version = editor.model.document.version;
      var anchor = image.closest('a'), dom = anchor.outerHTML;
      for (var repeat = 0; repeat < 2; repeat++) await click(image);
      var after = await papijoHarnessNavigations(); root.removeEventListener('click', record);
      var outcome = { captioned: captioned, editingDocument: window !== top, anchorEditable: anchor.isContentEditable,
        href: anchor.getAttribute('href'), dom: dom, defaultPrevented: events.map(function (record) { return record.event.defaultPrevented; }),
        trustedClicks: events.every(function (record) { return record.event.isTrusted; }), path: events[0] && events[0].path,
        navigations: after.slice(before.length), selected: editor.model.document.selection.getSelectedElement() === target,
        imageToolbar: !!toolbar(ctx), linkUi: editor.plugins.get('ContextualBalloon').visibleView === editor.plugins.get('LinkUI').actionsView };
      outcomes.push(outcome);
      h.assert(editor.getData() === data && editor.model.document.version === version && target.getAttribute('linkHref') === url,
        'Repeated image clicks preserve managed data/history and actual link');
      // Modifier-click must not reach native LinkEditing's explicit popup path.
      before = await papijoHarnessNavigations();
      await click(image, { position: { x: image.clientWidth / 2, y: image.clientHeight * 0.98 }, modifiers: ['Control'] });
      after = await papijoHarnessNavigations();
      h.assert(after.length === before.length && editor.model.document.selection.getSelectedElement() === target,
        'Managed modifier-click cannot navigate the frame, top window or a popup');
      if (captioned) {
        var caption = root.querySelector('.papijo-image-caption'); before = await papijoHarnessNavigations();
        h.caret(ctx, 0); await click(caption); after = await papijoHarnessNavigations();
        h.assert(after.length === before.length && editor.model.document.selection.getSelectedElement() === target && !caption.closest('a'),
          'Caption click selects the atomic image without navigation or linking caption');
        var captionButton = Array.from(toolbar(ctx).items).find(function (button) {
          return button.label === H5PEditor.t('H5PEditor.AdvancedTextPapiJoTooltip', 'editImageCaption');
        });
        h.assert(captionButton && captionButton.isEnabled, 'Caption Edit remains available after image/caption clicks');
        await click(captionButton.element);
        var captionForm = editor.commands.get('papijoImageCaption').form;
        h.assert(document.activeElement === captionForm.input && captionForm.input.value === 'Unlinked caption', 'Caption Edit opens its captured form');
        await click(captionForm.cancel.element);
      }

      var chain = Array.from(toolbar(ctx).items).find(function (button) {
        return button.label === H5PEditor.t('H5PEditor.AdvancedTextPapiJoTooltip', 'linkInlineImage');
      });
      h.assert(chain && chain.isEnabled, 'Link image action remains available');
      await click(chain.element);
      var ui = editor.plugins.get('LinkUI'), balloon = editor.plugins.get('ContextualBalloon');
      if (balloon.visibleView === ui.actionsView) { await click(ui.actionsView.editButtonView.element); }
      h.assert(balloon.visibleView === ui.formView && ui.formView.urlInputView.fieldView.element.value === url, 'Native Link form retains real href');
      var edited = url + '&edited=1', beforeEdit = editor.getData();
      ui.formView.urlInputView.fieldView.element.value = edited; await click(ui.formView.saveButtonView.element);
      var afterEdit = editor.getData(); h.assert(target.getAttribute('linkHref') === edited, 'Native Link Edit applies after direct image click');
      editor.execute('undo'); h.assert(editor.getData() === beforeEdit, 'Link Edit is one Undo');
      editor.execute('redo'); h.assert(editor.getData() === afterEdit, 'Link Edit is one Redo');
      await h.selectImage(ctx); root.focus(); await papijoHarnessPressFocusedKey('Control+k');
      h.assert(balloon.visibleView === ui.formView, 'Ctrl+K remains available after linked image selection');
      await click(ui.formView.cancelButtonView.element);
      h.assert(target.getAttribute('linkHref') === edited && (!captioned || target.getAttribute('papijoImageCaption') === 'Unlinked caption'),
        'Link UI retains href and caption state');
      var altButton = Array.from(toolbar(ctx).items).find(function (button) { return button.label === editor.t('Change image text alternative'); });
      await click(altButton.element);
      var altForm = balloon.visibleView;
      h.assert(altForm.labeledInput.fieldView.element.value === definition.alt, 'ALT remains usable on clicked linked image');
      await click(altForm.cancelButtonView.element);
      var replaceButton = Array.from(toolbar(ctx).items).find(function (button) { return button.papijoManagedImageButton; });
      await click(replaceButton.element);
      var picker = ctx.widget.inlineImageUi;
      h.assert(picker.open && picker.target === target && picker.$alt.val() === '', 'Replace captures clicked linked image and still requires new ALT');
      var pickerCancel = picker.$form.find('button[type="button"]').last()[0];
      pickerCancel.setAttribute('data-managed-link-cancel', 'target');
      await papijoHarnessPressKey('[data-managed-link-cancel="target"]', 'Enter');
      pickerCancel.removeAttribute('data-managed-link-cancel');
      h.assert(!picker.open && target.getAttribute('linkHref') === edited, 'Replace Cancel preserves clicked linked occurrence');
      var handles = Array.from(editor.ui.view.body).filter(function (view) { return view.element?.classList.contains('papijo-image-resize-handle'); });
      h.assert(handles.length === 4 && handles.every(function (handle) { return handle.element.getBoundingClientRect().width > 0; }), 'Four Resize handles remain addressable');
      var beforeResize = editor.getData(); root.focus(); await papijoHarnessPressFocusedKey('Tab');
      h.assert(document.activeElement === handles[3].element, 'Linked image keeps sequential Tab entry to southeast handle');
      await papijoHarnessPressFocusedKey('ArrowRight'); await papijoHarnessPressFocusedKey('Escape');
      var afterResize = editor.getData();
      h.assert(target.getAttribute('papijoImageWidth') === 25.1 && target.getAttribute('linkHref') === edited &&
        (!captioned || target.getAttribute('papijoImageCaption') === 'Unlinked caption'), 'Linked keyboard Resize preserves URL and caption');
      editor.execute('undo'); h.assert(editor.getData() === beforeResize, 'Linked Resize is one Undo');
      editor.execute('redo'); h.assert(editor.getData() === afterResize, 'Linked Resize is one Redo');
      editor.execute('undo');
      root.focus(); await papijoHarnessPressFocusedKey('Escape');
      h.caret(ctx, 0); editor.ui.update();
      await new Promise(function (resolve) { setTimeout(resolve, 60); });

      // A real runtime click must reach the browser's default navigation path.
      // Its anchor is outside the editable root; the production editor guard
      // must neither see nor cancel it, even in the same test document.
      var runtimeRoot = document.createElement('div'); runtimeRoot.className = 'h5p-advanced-text';
      runtimeRoot.style.width = Math.min(320, innerWidth - 16) + 'px';
      var parsed = new DOMParser().parseFromString(editor.getData(), 'text/html');
      Array.from(parsed.body.childNodes).forEach(function (node) { runtimeRoot.appendChild(node); });
      document.getElementById('fixture').appendChild(runtimeRoot);
      var runtime = new H5P.AdvancedTextPapiJoInlineImageRuntime(runtimeRoot, 17, [definition]);
      try {
        runtime.initialize(); var runtimeImage = runtimeRoot.querySelector('img'); await runtimeImage.decode();
        var runtimeAnchor = runtimeImage.closest('a'), runtimeCaption = runtimeRoot.querySelector('.papijo-image-caption');
        h.assert(runtimeAnchor.getAttribute('href') === edited && !runtimeAnchor.hasAttribute('target') &&
          (!captioned || runtimeCaption && !runtimeCaption.closest('a')), 'Runtime retains active image-only href and unlinked caption');
        var runtimeEvents = []; runtimeRoot.addEventListener('click', function (event) { runtimeEvents.push(event); });
        before = await papijoHarnessNavigations(); await click(runtimeImage); after = await papijoHarnessNavigations();
        var attempts = after.slice(before.length);
        h.assert(attempts.length === 1 && attempts[0].navigation && attempts[0].url === edited &&
          attempts[0].context === (window !== top ? 'editor-frame' : 'top-window') && runtimeEvents.length === 1 && !runtimeEvents[0].defaultPrevented,
          'Runtime real image click still causes normal browsing-context navigation: ' + JSON.stringify(attempts));
        outcome.runtimeNavigations = attempts;
      }
      finally { runtime.destroy(); runtimeRoot.remove(); }
      await h.close(ctx); contexts.pop();
    }
    h.results.push({ managedImageClick: outcomes });
    h.assert(outcomes.every(function (outcome) { return outcome.navigations.length === 0 && outcome.selected && outcome.imageToolbar && outcome.trustedClicks; }),
      'Editor image clicks must never navigate any browsing context: ' + JSON.stringify(outcomes));
  }
  finally { for (var ctx of contexts) await h.close(ctx); H5P.getPath = originalPath; }
};
