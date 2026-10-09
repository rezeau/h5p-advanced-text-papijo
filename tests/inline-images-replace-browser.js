/* Replacement checks against the installed CKEditor and H5P image widget. */
window.runPapijoInlineImageReplacement = async function (h) {
  'use strict';
  var assert = h.assert;
  var A = { id: 'replace-A', image: { path: 'images/a.png', mime: 'image/png', width: 1, height: 1,
    copyright: { license: 'CC0', title: 'Not alternative text' } }, alt: 'Original photograph' };
  var B = { path: 'images/b.svg#tmp', mime: 'image/svg+xml', width: 1280, height: 960,
    copyright: { license: 'CC BY', title: 'Also not alternative text' } };
  function marker(id, style) {
    return '<span class="papijo-inline-image" data-papijo-inline-image-id="' + id + '"' +
      (style ? ' data-papijo-inline-image-style="' + style + '"' : '') + '></span>';
  }
  async function open(style, language) {
    return h.open('<p>' + marker(A.id, style) + ' and ' + marker(A.id, 'alignRight') + '</p>',
      [JSON.parse(JSON.stringify(A))], language);
  }
  async function picker(ctx, index) {
    var target = await h.selectImage(ctx, index);
    var toolbar = ctx.editor.plugins.get('ContextualBalloon').visibleView;
    var button = Array.from(toolbar.items)[4];
    assert(button.label === ctx.editor.t('Replace image') && button.icon && !button.withText && button.tooltip &&
      button.element.getAttribute('data-cke-tooltip-text') === button.label,
      'Selected image must expose native translated Replace image icon');
    var main = Array.from(ctx.editor.ui.view.toolbar.items).find(function (item) { return item.papijoManagedImageButton; });
    assert(main.label === button.label && main.isEnabled, 'Main and contextual providers must share selection awareness');
    button.focus(); assert(document.activeElement === button.element, 'Replace must support native keyboard focus');
    // Playwright sends a real key, including the browser's default button click.
    // The click fallback keeps this harness usable directly in a browser.
    if (window.papijoHarnessPressKey) {
      button.element.setAttribute('data-papijo-harness-keyboard', 'replace');
      await window.papijoHarnessPressKey('[data-papijo-harness-keyboard="replace"]', 'Enter');
      button.element.removeAttribute('data-papijo-harness-keyboard');
    }
    else { button.element.click(); }
    var state = ctx.widget.inlineImageUi;
    assert(state.open && state.target === target && state.expectedId === target.getAttribute('inlineImageId') &&
      state.editor === ctx.editor, 'Picker must capture exact model/editor/ID');
    assert(state.imageWidget instanceof H5PEditor.widgets.image && state.draft === undefined && state.$alt.val() === '',
      'Replacement must reuse H5P picker with empty draft and explicit empty alt');
    return state;
  }
  function draft(state, alt) {
    state.imageWidget.setValue({ name: 'image' }, JSON.parse(JSON.stringify(B)));
    state.$alt.val(alt);
  }
  function submit(state) { state.$form[0].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
  function cancel(state) { state.$form.find('button[type="button"]').last()[0].click(); }
  function pickerControls(state) {
    assert(state.$form[0].contains(state.$status[0]) && state.$status.is(':visible') &&
      state.$controls.find('.papijo-inline-image-insert').length === 0,
      'Picker errors belong inside the open form; no external insertion control');
    assert(state.imageWidget.field.disableCopyright === true &&
      state.$image.find('.h5p-editing-image-button, .h5p-copyright-button').length === 0,
      'Managed Insert/Replace must omit both generic controls, including after file selection');
    assert(state.imageWidget.$editImage.length === 1 && !state.imageWidget.$editImage[0].isConnected &&
      !H5PEditor.$.hasData(state.imageWidget.$editImage[0]),
      'Only the local edit-image trigger must be detached, with its DOM listeners removed');
  }
  async function checkPickerControls() {
    var $ = H5PEditor.$;
    for (var language of ['en', 'fr']) {
      var strings = (await fetch('/language/' + language + '.json').then(function (r) { return r.json(); })).libraryStrings;
      H5PEditor.t = function (_library, key) { return strings[key] || key; };
      var ctx = await open(null, language);
      var peer = await open(null, language);
      await h.selectImage(peer);
      Array.from(peer.editor.plugins.get('ContextualBalloon').visibleView.items)
        .find(function (item) { return item.papijoManagedImageButton; }).element.click();
      var peerState = peer.widget.inlineImageUi;
      var peerWidget = peerState.imageWidget;
      pickerControls(peerState);
      // Ordinary native H5P image widgets must retain both controls.
      var $ordinary = $('<div>').appendTo('#fixture');
      var ordinary = new H5PEditor.widgets.image({ library: 'H5P.Other', ready: function (fn) { fn(); } },
        { name: 'image', type: 'image' }, JSON.parse(JSON.stringify(A.image)), function () {});
      ordinary.appendTo($ordinary);
      assert($ordinary.find('.h5p-editing-image-button:not(.hidden), .h5p-copyright-button:not(.hidden)').length === 2,
        'Ordinary H5P image widget must still expose both generic controls');
      // Exercise the unchanged tooltip policy with the same installed image widget.
      ctx.widget.tooltipImageDraft = JSON.parse(JSON.stringify(A.image));
      ctx.widget.tooltipFormMode = 'create';
      ctx.widget.mountTooltipImageWidget();
      assert(ctx.widget.tooltipImageWidget.field.disableCopyright === true &&
        ctx.widget.$tooltipImageField.find('.h5p-editing-image-button, .h5p-copyright-button').length === 0 &&
        ctx.widget.$tooltipImageField.find('.thumbnail img').length === 1,
        'Tooltip image suppression and native preview must remain unchanged');
      ctx.widget.destroyTooltipImageWidget(); ctx.widget.tooltipFormMode = null;
      for (var mode of ['insert', 'replace']) {
        var listenerCount;
        for (var cycle = 0; cycle < 4; cycle++) {
          var before = ctx.editor.getData();
          var definitions = JSON.stringify(ctx.store.params);
          var state;
          if (mode === 'replace') { state = await picker(ctx); }
          else {
            h.caret(ctx, 1);
            Array.from(ctx.editor.ui.view.toolbar.items).find(function (item) { return item.papijoManagedImageButton; }).element.click();
            state = ctx.widget.inlineImageUi;
          }
          pickerControls(state);
          assert(state.$image.children().length === 1 && state.$controls.find('form').length === 1 && state.$alt.val() === '',
            'Repeated picker opening must keep one native widget/form and fresh ALT');
          var count = [state.$form[0], state.$form.find('button[type="button"]').last()[0]]
            .reduce(function (total, element) {
              var events = $._data(element, 'events') || {};
              return total + Object.keys(events).reduce(function (sum, event) { return sum + events[event].length; }, 0);
            }, 0);
          if (listenerCount === undefined) { listenerCount = count; }
          assert(count === listenerCount, 'Repeated picker cycles must not accumulate control listeners');
          var imageWidget = state.imageWidget;
          var lateCallback = imageWidget.setValue;
          var selections = 0;
          // Stub only file transport; click the real native Add/Change control,
          // render its real preview and deliver its native upload lifecycle events.
          imageWidget.openFileSelector = function () {
            selections++;
            this.trigger('upload');
            this.params = JSON.parse(JSON.stringify(B));
            this.setValue(this.field, this.params);
            this.addFile();
            this.trigger('fileUploaded', { width: B.width, height: B.height });
          };
          state.$image.find('.add')[0].click();
          var preview = state.$image.find('.thumbnail img')[0];
          await preview.decode();
          assert(selections === 1 && preview.naturalWidth === 1280 && state.draft.path === B.path,
            'Native Add must still select/upload and display the managed draft preview');
          pickerControls(state);
          state.$alt.val('Previous draft description');
          state.$image.find('.thumbnail')[0].click();
          assert(selections === 2 && state.$alt.val() === 'Previous draft description', 'Native Change remains usable');
          pickerControls(state);
          state.$alt.val('  '); submit(state);
          assert(state.open && state.$status.text() === strings.enterImageAltText && ctx.editor.getData() === before &&
            JSON.stringify(ctx.store.params) === definitions, 'Required ALT remains localized and blocks empty submissions');
          if (cycle === 2) {
            state.$alt.val('Explicit managed description'); submit(state);
            assert(!state.open && ctx.editor.getData() !== before, 'Insert/Replace with explicit ALT must still apply');
            ctx.editor.execute('undo');
            assert(ctx.editor.getData() === before, 'Insert/Replace remains undoable');
          }
          else {
            cancel(state);
            assert(ctx.editor.getData() === before && JSON.stringify(ctx.store.params) === definitions,
              'Cancel must leave managed content/definitions unchanged');
          }
          assert(state.imageWidget === null && state.$image.children().length === 0 && state.$controls.prop('hidden') && state.$status.text() === '' &&
            !imageWidget.$item[0].isConnected &&
            document.activeElement === ctx.editor.editing.view.getDomRoot(), 'Close must remove widget UI and restore editing focus');
          lateCallback({ name: 'image' }, { path: 'images/stale.png' });
          assert(state.draft === undefined && peerState.open && peerState.imageWidget === peerWidget &&
            peerState.draft === undefined, 'Closed callbacks and other AdvancedText instances must remain isolated');
        }
      }
      cancel(peerState); ordinary.remove(); $ordinary.remove();
      await h.close(peer); await h.close(ctx);
    }
    h.results.push('Managed picker controls: Insert/Replace omit Edit image/copyright, native Add/Change/upload preview, required ALT/apply/cancel/focus, repeated lifecycle/listeners and instance isolation, en/fr, unchanged tooltip and ordinary H5P widgets');
  }
  function clean(ctx) {
    var html = ctx.editor.getData().replace(/data-papijo-inline-image-style=/g, 'presentation=');
    assert(!/src=|alt=|width=|height=|image-style-|style=|<img|<figure/.test(html), 'Only managed marker attributes may persist');
    for (var item of Array.from(ctx.editor.model.createRangeIn(ctx.editor.model.document.getRoot()).getItems())) {
      if (item.name === 'imageInline') {
        assert(!item.hasAttribute('width') && !item.hasAttribute('height'), 'Replacement must remove projected dimensions');
      }
      assert(item.name !== 'imageBlock', 'Replacement must remain inline');
    }
    assert(!ctx.editor.commands.get('replaceImageSource').isEnabled && !ctx.editor.commands.get('insertImage').isEnabled &&
      !ctx.editor.plugins.has('ImageUpload') && !ctx.editor.plugins.has('ImageUploadEditing') && !ctx.editor.plugins.has('FileRepository'),
      'Native URL/upload pipeline must remain disabled or absent');
  }
  var nativePath = H5P.getPath;
  var originalTranslate = H5PEditor.t;
  H5P.getPath = function (path) { return path.includes('b.svg') ? '/fixture-large.svg' : '/fixture-image.png'; };
  try {
    await checkPickerControls();
    H5PEditor.t = originalTranslate;
    for (var style of [null, 'alignLeft', 'alignRight']) {
      var ctx = await open(style);
      var before = ctx.editor.getData(); var definitions = JSON.stringify(ctx.store.params);
      var state = await picker(ctx); var target = state.target;
      assert(ctx.editor.getData() === before, 'Opening picker must not change occurrence');
      state.$alt.val('Explicit description without an image'); submit(state);
      assert(state.open && state.$status.text() === 'chooseManagedInlineImage' && ctx.editor.getData() === before &&
        JSON.stringify(ctx.store.params) === definitions, 'Missing replacement draft must not create a definition');
      for (var alt of ['', '  \t ']) {
        draft(state, alt); submit(state);
        assert(state.open && state.$status.text() === 'enterImageAltText' && ctx.editor.getData() === before &&
          JSON.stringify(ctx.store.params) === definitions, 'Blank replacement alt must not create a definition');
      }
      state.imageWidget.setValue({ name: 'image' }, { path: 'https://example.com/evil.png', mime: 'image/png' });
      state.$alt.val('Explicit description'); submit(state);
      assert(state.open && ctx.store.params.length === 1 && ctx.editor.getData() === before, 'Invalid managed path must be rejected');
      draft(state, '  Replacement photograph  '); submit(state);
      var id = target.getAttribute('inlineImageId'); var after = ctx.editor.getData();
      assert(!state.open && id !== A.id && ctx.store.params.length === 2, 'Apply must create new retained B');
      assert(JSON.stringify(ctx.store.params[0]) === JSON.stringify(A) &&
        JSON.stringify(ctx.store.params[1].image) === JSON.stringify(B), 'A must remain immutable and B must retain all H5P metadata');
      assert(target.getAttribute('alt') === 'Replacement photograph' && target.getAttribute('imageStyle') === (style || undefined),
        'Alt projection and occurrence presentation must follow managed replacement');
      assert(h.imageModel(ctx, 1).getAttribute('inlineImageId') === A.id && h.imageModel(ctx, 1).getAttribute('alt') === A.alt &&
        h.imageModel(ctx, 1).getAttribute('imageStyle') === 'alignRight', 'Shared-reference sibling must remain A');
      assert(after === before.replace(marker(A.id, style), marker(id, style)), 'Serialization must switch exactly one managed ID');
      assert(ctx.editor.model.document.selection.getSelectedElement() === target &&
        document.activeElement === ctx.editor.editing.view.getDomRoot(), 'Apply must select target and return editing focus');
      var images = ctx.editor.editing.view.getDomRoot().querySelectorAll('img');
      await images[0].decode(); await images[1].decode();
      assert(images[0].naturalWidth === 1280 && images[1].naturalWidth === 1, 'Real replacement bytes and sibling preview must differ');
      clean(ctx);
      for (var cycle = 0; cycle < 4; cycle++) {
        ctx.editor.execute('undo');
        assert(ctx.editor.getData() === before && target.getAttribute('alt') === A.alt, 'One Undo must restore A and its alt/style');
        ctx.editor.execute('redo');
        assert(ctx.editor.getData() === after && target.getAttribute('alt') === 'Replacement photograph' && ctx.store.params.length === 2,
          'Repeated Redo must restore B with retained definitions');
      }
      var reopened = await h.open(after, JSON.parse(JSON.stringify(ctx.store.params)));
      assert(reopened.editor.getData() === after && h.imageModel(reopened).getAttribute('alt') === 'Replacement photograph', 'Save/reopen must reconstruct B');
      await h.close(reopened);
      await h.selectImage(ctx);
      ['keydown', 'keyup'].forEach(function (type) {
        ctx.editor.editing.view.getDomRoot().dispatchEvent(new KeyboardEvent(type, { key: 'Delete', keyCode: 46, bubbles: true, cancelable: true }));
      });
      assert(h.imageModel(ctx).getAttribute('inlineImageId') === A.id, 'Delete must remove only B occurrence');
      ctx.editor.execute('undo'); assert(ctx.editor.getData() === after, 'Delete Undo must restore B');
      await h.selectImage(ctx); h.submitAlt(h.altForm(ctx), 'Edited replacement alt');
      var revised = target.getAttribute('inlineImageId');
      assert(revised !== id && target.getAttribute('imageStyle') === (style || undefined), 'Alt editing after replacement must retain presentation');
      ctx.editor.execute('imageStyle', { value: 'alignLeft' });
      assert(target.getAttribute('inlineImageId') === revised, 'Style after replacement must not alter ID');
      state = await picker(ctx); var prior = ctx.editor.getData();
      draft(state, 'Another replacement'); submit(state);
      assert(target.getAttribute('imageStyle') === 'alignLeft' && target.getAttribute('alt') === 'Another replacement', 'Replacement after alt/style edits must preserve current style');
      ctx.editor.execute('undo'); assert(ctx.editor.getData() === prior, 'Prior alt/style history must survive another replacement');
      clean(ctx); await h.close(ctx);
    }
    h.results.push('Replacement: three presentations, shared A, full metadata/new B, explicit alt/path validation, exact marker, real bytes, atomic history x4, delete/alt/style/replacement sequencing, save/reopen');

    // Cancel and asynchronous old-generation callbacks, without a data/history operation.
    ctx = await open('alignLeft');
    before = ctx.editor.getData(); definitions = JSON.stringify(ctx.store.params);
    state = await picker(ctx); var callback = state.imageWidget.setValue;
    cancel(state);
    assert(ctx.editor.getData() === before && JSON.stringify(ctx.store.params) === definitions &&
      !ctx.editor.commands.get('undo').isEnabled, 'Cancel before draft must make no history/data change');
    state = await picker(ctx); draft(state, 'Not applied'); var newerDraft = state.draft;
    callback({ name: 'image' }, { path: 'images/stale.png', mime: 'image/png' });
    assert(state.draft === newerDraft && state.$alt.val() === 'Not applied', 'Old-generation callback must not overwrite current draft');
    var mutableDraft = JSON.parse(JSON.stringify(B));
    state.imageWidget.setValue({ name: 'image' }, mutableDraft); state.$alt.val('Description of the first draft');
    mutableDraft.path = 'images/another.png'; state.imageWidget.setValue({ name: 'image' }, mutableDraft);
    assert(state.$alt.val() === '', 'Changing the replacement draft must clear its previous description');
    cancel(state); callback({ name: 'image' }, B);
    assert(ctx.editor.getData() === before && JSON.stringify(ctx.store.params) === definitions && !state.open &&
      state.draft === undefined && !ctx.editor.commands.get('undo').isEnabled, 'Cancel after draft and late callback must leave no content/history change');
    await h.close(ctx);

    for (var failure of ['deleted', 'changed-id', 'read-only', 'different-editor']) {
      ctx = await open('alignLeft'); state = await picker(ctx); target = state.target; draft(state, 'New explicit alt');
      var peer;
      if (failure === 'deleted') { ctx.editor.model.change(function (writer) { writer.remove(target); }); }
      if (failure === 'changed-id') {
        var changed = ctx.store.addDefinition(A.image, 'Changed while picker open');
        ctx.editor.model.change(function (writer) { writer.setAttribute('inlineImageId', changed.id, target); });
      }
      if (failure === 'read-only') { ctx.editor.enableReadOnlyMode('replacement-test'); }
      if (failure === 'different-editor') { peer = await open(); ctx.widget.ckeditor = peer.editor; }
      before = ctx.editor.getData(); definitions = JSON.stringify(ctx.store.params);
      submit(state);
      assert(state.open && state.$status.text() === 'replacementTargetUnavailable' &&
        JSON.stringify(ctx.store.params) === definitions && ctx.editor.getData() === before, 'Stale ' + failure + ' target must reject before creating B');
      if (peer) { ctx.widget.ckeditor = ctx.editor; await h.close(peer); }
      if (failure === 'read-only') { ctx.editor.disableReadOnlyMode('replacement-test'); }
      cancel(state); await h.close(ctx);
    }
    ctx = await open('alignLeft'); state = await picker(ctx); target = state.target;
    ctx.editor.model.change(function (writer) { writer.setAttribute('imageStyle', 'alignRight', target); });
    await h.selectImage(ctx, 1); draft(state, 'Captured target only'); submit(state);
    assert(target.getAttribute('inlineImageId') !== A.id && target.getAttribute('imageStyle') === 'alignRight' &&
      h.imageModel(ctx, 1).getAttribute('inlineImageId') === A.id,
      'Moving selection must replace the captured occurrence, never the later selected one');
    await h.close(ctx);
    h.results.push('Replacement: cancellation before/after draft without history, stale generations, deleted/ID-changed/read-only/editor-changed target guards, moved selection isolation');

    for (var language of ['en', 'fr']) {
      var strings = (await fetch('/language/' + language + '.json').then(function (r) { return r.json(); })).libraryStrings;
      H5PEditor.t = function (_library, key) { return strings[key] || key; };
      ctx = await open(null, language); state = await picker(ctx);
      assert(state.$form.find('[type="submit"]').text() === strings.applyReplacementImage &&
        state.imageWidget.field.label === strings.replaceInlineImage && state.$alt.val() === '', 'Localized replacement form must require fresh alt');
      submit(state); assert(state.$status.text() === strings.enterImageAltText, 'Required-alt error must be localized');
      ctx.editor.enableReadOnlyMode('localized-stale'); draft(state, 'Explicit description'); submit(state);
      assert(state.$status.text() === strings.replacementTargetUnavailable, 'Stale-target error must be localized');
      ctx.editor.disableReadOnlyMode('localized-stale');
      cancel(state);
      h.caret(ctx, 1);
      var main = Array.from(ctx.editor.ui.view.toolbar.items).find(function (item) { return item.papijoManagedImageButton; });
      assert(main.label === ctx.editor.t('Insert image') && main.isEnabled, 'Collapsed cursor must restore Insert mode');
      // Actual viewport is resized by the runner, not simulated with CSS alone.
      for (var width of [800, 240, 140, 240]) {
        ctx.shell.css('width', width + 'px'); await h.selectImage(ctx);
        window.dispatchEvent(new Event('resize')); ctx.editor.ui.update();
        await new Promise(function (resolve) { setTimeout(resolve, 40); });
        var toolbar = ctx.editor.plugins.get('ContextualBalloon').visibleView;
        var rect = toolbar.element.getBoundingClientRect();
        assert(rect.left >= -1 && rect.right <= window.innerWidth + 1,
          'Managed image balloon must stay inside real viewport ' + window.innerWidth + ': ' + JSON.stringify(rect.toJSON()));
        assert(Array.from(toolbar.items).filter(function (item) { return item.papijoManagedImageButton; }).length === 1,
          'One native provider control must remain after repeated selection/resize');
        if (window.innerWidth === 160) {
          assert(rect.width <= 144 && new Set(Array.from(toolbar.items).filter(function (item) {
            return item.element.tagName === 'BUTTON';
          }).map(function (item) { return Math.round(item.element.getBoundingClientRect().top); })).size >= 2,
          'Insufficient viewport must wrap all seven controls into native contextual rows');
        }
      }
      clean(ctx); await h.close(ctx);
    }
    h.results.push('Replacement: English/French native label/icon/keyboard focus, localized form/errors, insert mode restored, contextual viewport ' + window.innerWidth + ' and repeated editor resize');
  }
  finally { H5P.getPath = nativePath; H5PEditor.t = originalTranslate; }
};
