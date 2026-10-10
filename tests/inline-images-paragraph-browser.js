/* Public native models, real sequential keyboard events, pointer/lifecycle UI. */
window.runPapijoInlineImageParagraph = async function (h) {
  'use strict';
  var assert = h.assert, contexts = [], originalPath = H5P.getPath, originalTranslate = H5PEditor.t, i;
  var translations = {};
  var nativeAdd = EventTarget.prototype.addEventListener, nativeRemove = EventTarget.prototype.removeEventListener;
  var globalListeners = [], NativeObserver = window.ResizeObserver, observedTargets = [];
  function capture(options) { return typeof options === 'boolean' ? options : !!(options && options.capture); }
  EventTarget.prototype.addEventListener = function (type, callback, options) {
    // Playwright owns persistent hit-target instrumentation, not the editor.
    if ((this === window || this === document) && !(options && options.once) &&
        !type.startsWith('__playwright') && !String(callback).includes('_hitTargetInterceptor') &&
        !globalListeners.some(function (entry) { return entry.target === this && entry.type === type && entry.callback === callback && entry.capture === capture(options); }, this)) {
      globalListeners.push({ target: this, type: type, callback: callback, capture: capture(options) });
    }
    return nativeAdd.call(this, type, callback, options);
  };
  EventTarget.prototype.removeEventListener = function (type, callback, options) {
    globalListeners = globalListeners.filter(function (entry) { return entry.target !== this || entry.type !== type || entry.callback !== callback || entry.capture !== capture(options); }, this);
    return nativeRemove.call(this, type, callback, options);
  };
  if (NativeObserver) {
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback) { super(callback); this.targets = new Set(); observedTargets.push(this.targets); }
      observe(target, options) { this.targets.add(target); super.observe(target, options); }
      unobserve(target) { this.targets.delete(target); super.unobserve(target); }
      disconnect() { this.targets.clear(); super.disconnect(); }
    };
  }
  for (var language of ['en', 'fr']) {
    translations[language] = (await fetch('/language/' + language + '.json').then(function (r) { return r.json(); })).libraryStrings;
  }
  var definitions = [{ id: 'paragraph-A', image: { path: 'images/small.svg' }, alt: 'Paragraph image' },
    { id: 'paragraph-B', image: { path: 'images/large.svg' }, alt: 'Other image' }];
  function marker(extra, id) {
    return '<span class="papijo-inline-image" data-papijo-inline-image-id="' + (id || 'paragraph-A') + '" ' + (extra || '') + '></span>';
  }
  async function settle(ctx) {
    await Promise.all(Array.from(ctx.editor.editing.view.getDomRoot().querySelectorAll('img')).map(function (img) {
      return img.complete ? Promise.resolve() : new Promise(function (r) { img.addEventListener('load', r, { once: true }); });
    }));
    await new Promise(function (r) { setTimeout(r, 60); });
  }
  async function open(html, language, images) {
    H5PEditor.t = function (lib, key) { return translations[language || 'en'][key] || originalTranslate(lib, key); };
    var ctx = await h.open(html || '<p>' + marker() + '</p>', images || JSON.parse(JSON.stringify(definitions)), language);
    contexts.push(ctx); await settle(ctx); return ctx;
  }
  async function close(ctx) { contexts.splice(contexts.indexOf(ctx), 1); await h.close(ctx); }
  function tree(ctx) {
    function node(item) {
      return item.is('$text') ? { text: item.data, attributes: Object.fromEntries(item.getAttributes()) } :
        { name: item.name, attributes: Object.fromEntries(item.getAttributes()), children: Array.from(item.getChildren()).map(node) };
    }
    return JSON.stringify(Array.from(ctx.editor.model.document.getRoot().getChildren()).map(node));
  }
  function paragraphs(ctx) { return Array.from(ctx.editor.model.document.getRoot().getChildren()); }
  function texts(paragraph) { return Array.from(paragraph.getChildren()).filter(function (n) { return n.is('$text'); }).map(function (n) { return n.data; }).join(''); }
  function history(ctx, command, options, checkAction) {
    var before = tree(ctx), image = h.imageModel(ctx), attrs = JSON.stringify(Object.fromEntries(image.getAttributes()));
    var store = JSON.stringify(ctx.store.params);
    ctx.editor.execute(command, options);
    var after = tree(ctx);
    assert(after !== before && h.imageModel(ctx) === image, 'Paragraph action changes structure without recreating image');
    assert(JSON.stringify(Object.fromEntries(image.getAttributes())) === attrs && JSON.stringify(ctx.store.params) === store,
      'ID/ALT/file/style/link/width and retained definitions stay exact');
    if (checkAction) { checkAction(); }
    ctx.editor.execute('undo'); assert(tree(ctx) === before, 'One Undo restores exact text, spaces, formatting and structure');
    ctx.editor.execute('redo'); assert(tree(ctx) === after, 'One Redo restores paragraph action');
  }
  function arrows(ctx) { return Array.from(ctx.editor.ui.view.body).filter(function (v) { return v.element && v.element.classList.contains('papijo-image-paragraph-arrow'); }); }
  function captionMarker(text, extra) {
    return marker(extra).replace('></span>', '><span class="papijo-image-caption">' + text + '</span></span>');
  }
  function positioning(ctx, label) {
    var root = ctx.editor.editing.view.getDomRoot(), unit = root.querySelector('.image-inline');
    var ir = unit.querySelector('img').getBoundingClientRect(), bounds = root.getBoundingClientRect();
    var balloon = ctx.editor.plugins.get('ContextualBalloon');
    var obstacles = Array.from(ctx.editor.ui.view.body).filter(function (v) {
      return v.element && v.isVisible && v.element.classList.contains('papijo-image-resize-handle');
    }).map(function (v) { return v.element.getBoundingClientRect(); });
    if (balloon.visibleView) { obstacles.push(balloon.view.element.getBoundingClientRect()); }
    obstacles.push(ctx.editor.ui.view.toolbar.element.getBoundingClientRect());
    var caption = unit.querySelector('.papijo-image-caption');
    if (caption) { obstacles.push(caption.getBoundingClientRect()); }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), text;
    while ((text = walker.nextNode())) {
      if (unit.contains(text)) { continue; }
      var range = document.createRange(); range.selectNodeContents(text);
      obstacles.push.apply(obstacles, Array.from(range.getClientRects()));
    }
    function overlaps(a, b) { return b.width > 0 && b.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
    var positions = arrows(ctx).map(function (view, index) {
      assert(!root.contains(view.element) && !view.element.closest('a') && view.element.tabIndex === -1,
        label + ': body ownership, link exclusion and Tab order stay intact');
      if (!view.isVisible) { return null; }
      var box = view.element.getBoundingClientRect();
      assert(box.width === 28 && box.height === 24, label + ': button dimensions stay 28x24');
      assert(Math.abs((box.left + box.right) / 2 - (ir.left + ir.right) / 2) < 0.1,
        label + ': horizontal center uses the image, not the caption footprint');
      assert(box.bottom <= (ir.top + ir.bottom) / 2 - 1.9 || box.top >= (ir.top + ir.bottom) / 2 + 1.9,
        label + ': image center remains available for image selection');
      if (index === 0) {
        var baseTop = ir.top - 12;
        assert(box.top >= baseTop - 0.1 && box.top <= ir.top + 2.1, label + ': Before adjustment stays bounded to the upper image edge');
        assert(Math.abs(box.top - baseTop) < 0.1 || (balloon.visibleView &&
          Math.abs(box.top - balloon.view.element.getBoundingClientRect().bottom - 4) < 0.1), label + ': only the prototype balloon adjustment is used');
      }
      else { assert(Math.abs(box.top - ir.bottom + 12) < 0.1, label + ': After straddles the lower image edge'); }
      assert(box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom &&
        box.left >= 0 && box.right <= innerWidth && box.top >= 4 && box.bottom <= innerHeight - 4,
        label + ': control stays inside the editor and viewport');
      obstacles.forEach(function (other) { assert(!overlaps(box, other), label + ': avoids caption/text/four handles/balloons/main toolbar'); });
      obstacles.push(box);
      return { left: box.left, top: box.top, imageBottom: ir.bottom };
    });
    assert(dropdown(ctx) || balloon.visibleView, label + ': native contextual UI remains available');
    return { image: ir, positions: positions };
  }
  function dropdown(ctx) {
    var balloon = ctx.editor.plugins.get('ContextualBalloon');
    // Linked images may show the established image toolbar alongside Link UI.
    var toolbar = Array.from(balloon.view.content).flatMap(function (view) {
      return view.content ? Array.from(view.content) : [view];
    }).find(function (view) { return view.items && Array.from(view.items).some(function (item) { return item.papijoManagedImageButton; }); });
    return toolbar && toolbar.items && Array.from(toolbar.items).find(function (v) { return v.buttonView && v.buttonView.label === H5PEditor.t('', 'imageParagraphActions'); });
  }
  async function keyboardMenu(ctx) {
    await h.selectImage(ctx); await settle(ctx);
    var before = tree(ctx), version = ctx.editor.model.document.version;
    await papijoHarnessPressFocusedKey('Alt+F10');
    for (var i = 0; i < 12 && document.activeElement !== dropdown(ctx).buttonView.element; i++) { await papijoHarnessPressFocusedKey('ArrowRight'); }
    assert(document.activeElement === dropdown(ctx).buttonView.element, 'Real Alt+F10/arrow navigation reaches native Paragraph actions');
    await papijoHarnessPressFocusedKey('Enter'); await settle(ctx);
    assert(dropdown(ctx).isOpen && tree(ctx) === before && ctx.editor.model.document.version === version, 'Opening menu adds no history or content');
    var menuBounds = dropdown(ctx).panelView.element.getBoundingClientRect();
    assert(menuBounds.left >= -0.5 && menuBounds.right <= window.innerWidth + 0.5,
      'Native Paragraph actions panel and wrapped translated labels fit viewport');
    return dropdown(ctx);
  }
  try {
    H5P.getPath = function (path) { return path.includes('large') ? '/fixture-large.svg' : '/fixture-small.svg'; };
    // Exact raw model separators: HTML upcast may already normalize input spaces.
    for (var entry of [
      ['both', 'Some text ', ' more text', null, null],
      ['first', '', ' more text', null, null], ['last', 'Some text ', '', null, null],
      ['many', 'Some  text   ', '   more  text', null, null], ['spacesOnly', '   ', '  ', null, null],
      ['formatted', 'Some text ', ' more text', { bold: true }, { italic: true }],
      ['textLink', 'Some text ', ' more text', { linkHref: 'https://example.org/text' }, null],
      ['punctuation', 'Hello,', '! More', null, null]
    ]) {
      var ctx = await open(), editor = ctx.editor, image = h.imageModel(ctx);
      editor.model.change(function (writer) {
        if (entry[1]) { writer.insertText(entry[1], entry[3] || {}, writer.createPositionBefore(image)); }
        if (entry[2]) { writer.insertText(entry[2], entry[4] || {}, writer.createPositionAfter(image)); }
        writer.setSelection(image, 'on');
      });
      history(ctx, 'papijoSeparateImageParagraph');
      var ps = paragraphs(ctx), expectedLeft = entry[1].replace(/ +$/, ''), expectedRight = entry[2].replace(/^ +/, '');
      assert(ps.length === 1 + !!expectedLeft + !!expectedRight && image.parent.childCount === 1, 'No meaningless empty side paragraphs');
      assert(texts(ps[0]) === expectedLeft && texts(ps[ps.length - 1]) === expectedRight, 'Exact text and internal/punctuation spacing preserved');
      if (entry[3] && expectedLeft) { assert(ps[0].getChild(0).getAttribute(Object.keys(entry[3])[0]) === Object.values(entry[3])[0], 'Prefix formatting/link preserved'); }
      if (entry[4]) { assert(ps[ps.length - 1].getChild(0).getAttribute('italic'), 'Suffix formatting preserved'); }
      assert(editor.model.document.selection.getSelectedElement() === image && document.activeElement === editor.editing.view.getDomRoot(), 'Extraction selects same image and focuses editable');
      var reopened = await open(editor.getData(), 'en', JSON.parse(JSON.stringify(ctx.store.params)));
      assert(reopened.editor.getData() === editor.getData(), 'Extracted structure persists through save/reopen');
      await close(reopened); await close(ctx);
    }
    for (var style of [undefined, 'alignLeft', 'alignRight']) {
      ctx = await open('<p>Before ' + marker('data-papijo-inline-image-width="55.5" data-papijo-inline-image-link="https://example.org/image"' +
        (style ? ' data-papijo-inline-image-style="' + style + '"' : '')) + ' after</p>');
      await h.selectImage(ctx); history(ctx, 'papijoSeparateImageParagraph');
      assert(h.imageModel(ctx).getAttribute('papijoImageWidth') === 55.5 && h.imageModel(ctx).getAttribute('imageStyle') === style,
        'Extraction preserves Inline/Wrap and exact width with linked image');
      await close(ctx);
    }
    h.results.push('Paragraph extraction: exact boundaries/spaces/formatting/links, image identity, retained definitions, Wrap/width, one Undo/Redo, save/reopen');

    ctx = await open(); image = h.imageModel(ctx);
    var annotation = ctx.editor.plugins.get('GeneralHtmlSupport').getGhsAttributeNameForElement('span');
    ctx.editor.model.change(function (writer) {
      writer.insertText('Annotated', { [annotation]: { classes: ['papijo-tooltip'], attributes: { 'data-papijo-tooltip': 'Preserved' } } }, writer.createPositionBefore(image));
      writer.insertText('  ', { bold: true }, writer.createPositionBefore(image));
      writer.insertText(' ', { italic: true }, writer.createPositionBefore(image));
      writer.insertText(' tail', writer.createPositionAfter(image)); writer.setSelection(image, 'on');
    });
    history(ctx, 'papijoSeparateImageParagraph');
    assert(texts(paragraphs(ctx)[0]) === 'Annotated' && paragraphs(ctx)[0].getChild(0).getAttribute(annotation).attributes['data-papijo-tooltip'] === 'Preserved',
      'Separators across formatted runs normalize while annotations outside those separators remain exact');
    await close(ctx);

    for (var html of ['<p>' + marker() + '</p>', '<p>' + marker() + '</p><p>After</p>', '<p>Before</p><p>' + marker() + '</p>',
      '<p>Before</p><p>' + marker() + '</p><p>After</p>', '<p></p><p>' + marker() + '</p><p></p>']) {
      for (var command of ['papijoImageParagraphBefore', 'papijoImageParagraphAfter']) {
        ctx = await open(html);
        for (i = 0; i < 2; i++) {
          await h.selectImage(ctx); var count = paragraphs(ctx).length;
          history(ctx, command, undefined, function () {
            var selection = ctx.editor.model.document.selection;
            assert(paragraphs(ctx).length === count + 1 && selection.isCollapsed && selection.anchor.parent.is('element', 'paragraph') &&
              selection.anchor.parent.isEmpty && document.activeElement === ctx.editor.editing.view.getDomRoot(), 'Before/After adds exactly one empty root paragraph and places caret inside');
            var adjacent = command === 'papijoImageParagraphBefore' ? h.imageModel(ctx).parent.previousSibling : h.imageModel(ctx).parent.nextSibling;
            assert(adjacent === selection.anchor.parent && Array.from(adjacent.getAttributeKeys()).length === 0, 'New paragraph is adjacent and inherits no container attributes');
          });
        }
        await close(ctx);
      }
    }
    h.results.push('Paragraph Before/After: first/last/only/interior/adjacent empty paragraphs, repeated actions, native caret, one-step history');

    for (html of ['<ul><li>' + marker() + '</li></ul>', '<ul><li>Outer<ul><li>' + marker() + '</li></ul></li></ul>',
      '<figure class="table"><table><tbody><tr><td>' + marker() + '</td></tr></tbody></table></figure>',
      '<h2>' + marker() + '</h2>', '<p>Before<br>' + marker() + '</p>', '<p>' + marker() + marker('', 'paragraph-B') + '</p>',
      '<p>' + marker('', 'missing') + '</p>']) {
      ctx = await open(html); await h.selectImage(ctx); await settle(ctx);
      var baseline = tree(ctx);
      for (command of ['papijoSeparateImageParagraph', 'papijoImageParagraphBefore', 'papijoImageParagraphAfter']) {
        assert(!ctx.editor.commands.get(command).isEnabled, 'Deferred context disables ' + command);
        ctx.editor.execute(command); assert(tree(ctx) === baseline, 'Deferred command cannot mutate content');
      }
      assert(!dropdown(ctx).isEnabled && arrows(ctx).every(function (a) { return !a.isVisible; }), 'Deferred context has no executable menu/arrows');
      await close(ctx);
    }
    for (var ambiguous of ['\u00a0', '\t', '\u2003', '\u0085', '\u200b', '\u2060', ' \u00a0 ']) {
      ctx = await open(); image = h.imageModel(ctx);
      ctx.editor.model.change(function (writer) { writer.insertText('Text' + ambiguous, writer.createPositionBefore(image)); writer.setSelection(image, 'on'); });
      assert(!ctx.editor.commands.get('papijoSeparateImageParagraph').isEnabled, 'Special adjacent whitespace defers extraction');
      await close(ctx);
    }
    ctx = await open(); image = h.imageModel(ctx);
    var attribute = ctx.editor.plugins.get('GeneralHtmlSupport').getGhsAttributeNameForElement('span');
    ctx.editor.model.change(function (writer) { writer.insertText('Text ', { [attribute]: { classes: ['papijo-tooltip'], attributes: { 'data-papijo-tooltip': 'Annotation' } } }, writer.createPositionBefore(image)); writer.setSelection(image, 'on'); });
    assert(!ctx.editor.commands.get('papijoSeparateImageParagraph').isEnabled, 'Annotated boundary separators are not silently removed'); await close(ctx);
    ctx = await open('<p>' + marker() + '</p><p>' + marker('', 'paragraph-B') + '</p>');
    await h.selectImage(ctx); image = h.imageModel(ctx); baseline = tree(ctx);
    ctx.editor.enableReadOnlyMode('paragraph-test');
    ctx.editor.execute('papijoImageParagraphBefore'); assert(tree(ctx) === baseline && !ctx.editor.commands.get('papijoImageParagraphBefore').isEnabled, 'Read-only disables structural actions');
    ctx.editor.disableReadOnlyMode('paragraph-test'); await h.selectImage(ctx, 1);
    ctx.editor.execute('papijoImageParagraphBefore', { target: image }); assert(tree(ctx) === baseline, 'Captured stale selection cannot redirect command');
    ctx.editor.model.change(function (writer) { writer.remove(image); }); baseline = tree(ctx);
    ctx.editor.execute('papijoImageParagraphAfter', { target: image }); assert(tree(ctx) === baseline, 'Deleted target cannot mutate another occurrence');
    await close(ctx);
    h.results.push('Paragraph eligibility: lists/nested lists/table/heading/break/multiple/unresolved/read-only/stale/deleted disabled; special and annotated separators deferred');

    for (language of ['en', 'fr']) {
      ctx = await open('<p>Before ' + marker('data-papijo-inline-image-width="55.5" data-papijo-inline-image-link="https://example.org/image"') + ' after</p>', language);
      var activated = 0; ctx.editor.editing.view.getDomRoot().addEventListener('click', function (event) { if (event.target.closest('a')) { activated++; } });
      var menu = await keyboardMenu(ctx), root = ctx.editor.editing.view.getDomRoot(); baseline = tree(ctx);
      assert(menu.buttonView.label === translations[language].imageParagraphActions &&
        menu.toolbarView.items.get(0).label === translations[language].separateImageParagraph, 'Native dropdown and action use the complete EN/FR labels');
      await papijoHarnessPressFocusedKey('Escape');
      assert(!menu.isOpen && document.activeElement === root && tree(ctx) === baseline, 'Escape closes native dropdown and explicitly restores image focus without history');
      menu = await keyboardMenu(ctx); await papijoHarnessPressFocusedKey('ArrowDown');
      await papijoHarnessPressFocusedKey('Space'); await settle(ctx);
      assert(h.imageModel(ctx).parent.childCount === 1 && document.activeElement === root && activated === 0, 'Real Space activates extraction without following linked image');
      await papijoHarnessPressFocusedKey('Control+z'); assert(tree(ctx) === baseline, 'Real Ctrl+Z restores original mixed structure');
      await papijoHarnessPressFocusedKey('Control+y'); await settle(ctx);
      var width = h.imageModel(ctx).getAttribute('papijoImageWidth');
      await papijoHarnessPressFocusedKey('Tab');
      assert(document.activeElement.classList.contains('papijo-image-resize-southEast'), 'Existing real Tab still reaches southeast resize handle');
      await papijoHarnessPressFocusedKey('ArrowRight'); assert(h.imageModel(ctx).getAttribute('papijoImageWidth') === width + 0.1, 'Keyboard Resize coexists with Paragraph actions');
      await papijoHarnessPressFocusedKey('Escape');
      menu = await keyboardMenu(ctx); await papijoHarnessPressFocusedKey('ArrowDown'); await papijoHarnessPressFocusedKey('ArrowRight');
      await papijoHarnessPressFocusedKey('Enter'); await settle(ctx);
      assert(ctx.editor.model.document.selection.isCollapsed && ctx.editor.model.document.selection.anchor.parent.isEmpty,
        'Native arrow navigation and Enter activate Insert paragraph after');
      await close(ctx);
    }
    h.results.push('Paragraph native keyboard EN/FR: real Alt+F10/arrows/Enter/Space/Escape, no navigation history, real Ctrl+Z/Y, accepted Tab Resize path');

    var geometryCases = [
      { name: 'uncaptioned' }, { name: 'captioned', caption: true },
      { name: 'linked caption', caption: true, link: true },
      { name: 'resized caption', caption: true, width: 40.2 },
      { name: 'tiny caption', caption: true, width: 0.1 }
    ], geometryCount = 0, containerCount = 0;
    for (var geometryCase of geometryCases) {
      for (var presentation of ['inline', 'alignLeft', 'alignRight']) {
        var extra = (geometryCase.width ? 'data-papijo-inline-image-width="' + geometryCase.width + '" ' : '') +
          (presentation === 'inline' ? '' : 'data-papijo-inline-image-style="' + presentation + '" ') +
          (geometryCase.link ? 'data-papijo-inline-image-link="https://example.org/image"' : '');
        var occurrence = geometryCase.caption ? captionMarker('A caption with several words across more than one line.', extra) : marker(extra);
        ctx = await open('<p>Preceding paragraph text.</p><p>' + occurrence + '</p><p>Following paragraph text.</p>');
        ctx.shell[0].style.paddingTop = '180px'; await h.selectImage(ctx); await settle(ctx);
        var savedTree = tree(ctx), savedStore = JSON.stringify(ctx.store.params);
        positioning(ctx, geometryCase.name + '/' + presentation + '/' + innerWidth);
        assert(dropdown(ctx).isEnabled, 'Eligible image retains Paragraph dropdown independently of external visibility');
        if (geometryCase.width === 0.1) {
          assert(arrows(ctx).every(function (view) { return !view.isVisible; }), 'Tiny explicit width uses dropdown fallback');
        }
        assert(tree(ctx) === savedTree && JSON.stringify(ctx.store.params) === savedStore, 'Geometry measurement never changes managed content/history');
        geometryCount++; await close(ctx);
      }
    }
    for (var short of [false, true]) {
      H5P.getPath = function () { return short ? '/caption-size-32-16.svg' : '/fixture-small.svg'; };
      for (presentation of ['inline', 'alignLeft', 'alignRight']) {
        ctx = await open('<p>Before text.</p><p>' + captionMarker('Narrow caption', presentation === 'inline' ? '' :
          'data-papijo-inline-image-style="' + presentation + '"') + '</p><p>After text.</p>');
        ctx.shell[0].style.width = '160px'; ctx.shell[0].style.paddingTop = '180px';
        await h.selectImage(ctx); await settle(ctx); positioning(ctx, '160px container/' + presentation + '/short=' + short);
        if (short) {
          assert(arrows(ctx).every(function (view) { return !view.isVisible; }), 'Short image has no crowded external controls');
          var fallback = await keyboardMenu(ctx);
          assert(fallback.toolbarView.items.get(1).isEnabled && fallback.toolbarView.items.get(2).isEnabled,
            'Both Before and After remain enabled in the native dropdown when external controls hide');
          await papijoHarnessPressFocusedKey('Escape');
        }
        containerCount++; await close(ctx);
      }
    }
    H5P.getPath = function (path) { return path.includes('large') ? '/fixture-large.svg' : '/fixture-small.svg'; };
    for (presentation of ['inline', 'alignLeft', 'alignRight']) {
      ctx = await open('<p>Before text.</p><p>' + marker(presentation === 'inline' ? '' : 'data-papijo-inline-image-style="' + presentation + '"') + '</p><p>After text.</p>');
      // Give this comparison's 128px source room below both existing float
      // clamps. The matrix above separately tests truly narrow 160px editors.
      ctx.shell[0].style.width = Math.max(180, innerWidth) + 'px';
      ctx.shell[0].style.paddingTop = '180px'; await h.selectImage(ctx); await settle(ctx);
      var noCaption = positioning(ctx, 'no caption/' + presentation), beforeCaptionData = ctx.editor.getData();
      image = h.imageModel(ctx);
      for (var captionText of ['Short caption', 'A much longer caption with enough words to occupy several lines in the narrow caption footprint.']) {
        ctx.editor.model.change(function (writer) { writer.setAttribute('papijoImageCaption', captionText, image); });
        await h.selectImage(ctx); await settle(ctx);
        var withCaption = positioning(ctx, 'caption-independent/' + presentation);
        assert(Math.abs(noCaption.image.width - withCaption.image.width) < 0.1 && Math.abs(noCaption.image.height - withCaption.image.height) < 0.1 &&
          Math.abs(noCaption.image.top - withCaption.image.top) < 0.1 && Math.abs(noCaption.image.left - withCaption.image.left) < 0.1,
          'Adding/growing a caption preserves identical image geometry: ' + presentation + '/' + innerWidth + ' ' +
          JSON.stringify({ before: noCaption.image.toJSON(), after: withCaption.image.toJSON() }));
        withCaption.positions.forEach(function (position, index) {
          if (position && noCaption.positions[index]) {
            assert(Math.abs(position.top - noCaption.positions[index].top) < 0.1 && Math.abs(position.left - noCaption.positions[index].left) < 0.1,
              'Caption height does not displace a safely visible Before/After anchor');
          }
        });
      }
      ctx.editor.execute('undo'); ctx.editor.execute('undo');
      assert(ctx.editor.getData() === beforeCaptionData, 'Caption history remains exact after positioning checks');
      await close(ctx);
    }
    h.results.push({ paragraphPositioning: { viewport: innerWidth, geometryCases: geometryCount, narrowContainerCases: containerCount,
      captionIndependent: true, presentations: ['Inline', 'Wrap left', 'Wrap right'] } });
    for (presentation of ['inline', 'alignLeft', 'alignRight']) {
      ctx = await open('<p>Before text.</p><p>' + captionMarker('Explicit 8em footprint', 'data-papijo-inline-image-width="5.5" ' +
        (presentation === 'inline' ? '' : 'data-papijo-inline-image-style="' + presentation + '"')) + '</p><p>After text.</p>');
      ctx.shell[0].style.paddingTop = '180px'; await h.selectImage(ctx); await settle(ctx);
      var footprint = ctx.editor.editing.view.getDomRoot().querySelector('.image-inline').getBoundingClientRect();
      var footprintGeometry = positioning(ctx, '8em footprint/' + presentation);
      assert(footprint.width > footprintGeometry.image.width + 1, 'Caption fallback remains wider than the small explicit image');
      assert(h.imageModel(ctx).getAttribute('papijoImageWidth') === 5.5, 'Positioning does not alter the explicit percentage');
      if (footprintGeometry.image.width >= 28 && footprintGeometry.image.height >= 32 &&
          footprintGeometry.image.left >= 0 && footprintGeometry.image.right <= innerWidth) {
        var clickImage = ctx.editor.editing.view.getDomRoot().querySelector('img');
        clickImage.setAttribute('data-position-select', 'image'); var clickData = ctx.editor.getData();
        await papijoHarnessClick('[data-position-select="image"]'); await settle(ctx);
        await papijoHarnessClick('[data-position-select="image"]'); await settle(ctx);
        assert(ctx.editor.model.document.selection.getSelectedElement() === h.imageModel(ctx) && ctx.editor.getData() === clickData,
          'Repeated clicks still select the resized image rather than activate a boundary control');
        clickImage.removeAttribute('data-position-select');
      }
      await close(ctx);
    }

    ctx = await open('<p>' + marker('data-papijo-inline-image-width="0.1" data-papijo-inline-image-link="https://example.org/image"') + '</p>');
    ctx.shell[0].style.paddingTop = '240px';
    await h.selectImage(ctx); await settle(ctx);
    var controls = arrows(ctx);
    assert(controls.length === 2 && controls.every(function (a) { return !a.isVisible && a.element.tabIndex === -1 && a.label; }), 'Tiny image hides both named body controls without extra Tab stops');
    menu = await keyboardMenu(ctx);
    assert(menu.toolbarView.items.get(1).isEnabled && menu.toolbarView.items.get(2).isEnabled, 'Tiny image retains native Before/After fallback');
    await papijoHarnessPressFocusedKey('Escape'); await close(ctx);
    ctx = await open('<p>Before text.</p><p>' + captionMarker('Caption stays inside the entire image paragraph.',
      'data-papijo-inline-image-link="https://example.org/image"') + '</p><p>After text.</p>');
    ctx.shell[0].style.paddingTop = '240px'; await h.selectImage(ctx); await settle(ctx); controls = arrows(ctx);
    assert(controls.every(function (a) { return a.isVisible; }), 'Displayable image has both compact external controls');
    var obstacles = Array.from(ctx.editor.ui.view.body).filter(function (v) { return v.element && v.isVisible && v.element.classList.contains('papijo-image-resize-handle'); });
    obstacles.push(ctx.editor.plugins.get('ContextualBalloon').visibleView);
    controls.forEach(function (arrow) {
      var a = arrow.element.getBoundingClientRect();
      var labelIds = arrow.element.getAttribute('aria-labelledby');
      var accessibleName = labelIds ? labelIds.split(/\s+/).map(function (id) { return document.getElementById(id).textContent; }).join(' ') : arrow.element.getAttribute('aria-label');
      assert(accessibleName === arrow.label, 'External arrow has its translated native accessible name');
      assert(a.width === 28 && a.height === 24 && !rootContains(ctx, arrow.element), 'Image-edge arrow is external, compact and nonpersistent');
      obstacles.forEach(function (other) { var b = other.element.getBoundingClientRect(); assert(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom, 'Arrows avoid resize handles/contextual toolbar at narrow viewport'); });
    });
    var previousTop = controls[1].element.getBoundingClientRect().top;
    ctx.shell[0].style.paddingTop = '280px'; window.dispatchEvent(new Event('resize')); await settle(ctx);
    assert(controls[1].element.getBoundingClientRect().top !== previousTop, 'Arrows reposition with layout change');
    var scrollSpace = document.createElement('div'); scrollSpace.style.height = '1000px'; document.getElementById('fixture').appendChild(scrollSpace);
    previousTop = controls[1].element.getBoundingClientRect().top;
    window.scrollTo(0, 60); await settle(ctx);
    assert(window.scrollY === 60 && controls[1].element.getBoundingClientRect().top !== previousTop, 'Actual document scrolling repositions external controls');
    window.scrollTo(0, 0); scrollSpace.remove(); await settle(ctx);
    var linkButton = ctx.editor.ui.componentFactory.create('papijoLinkImage'); linkButton.render(); linkButton.element.click();
    await settle(ctx);
    var linkRect = ctx.editor.plugins.get('ContextualBalloon').view.element.getBoundingClientRect();
    controls.filter(function (view) { return view.isVisible; }).forEach(function (view) {
      var box = view.element.getBoundingClientRect();
      assert(box.right <= linkRect.left || box.left >= linkRect.right || box.bottom <= linkRect.top || box.top >= linkRect.bottom,
        'External arrows avoid native Link actions/form balloon');
    });
    await papijoHarnessPressFocusedKey('Escape'); linkButton.destroy(); await h.selectImage(ctx); await settle(ctx);
    var captionButton = ctx.editor.ui.componentFactory.create('papijoImageCaption'); captionButton.render(); captionButton.fire('execute'); await settle(ctx);
    var captionForm = ctx.editor.commands.get('papijoImageCaption').form;
    assert(ctx.editor.plugins.get('ContextualBalloon').visibleView === captionForm, 'Caption form is actually open for collision checks');
    positioning(ctx, 'Caption form collision'); captionForm.cancel.element.click(); captionButton.destroy(); await h.selectImage(ctx); await settle(ctx);
    // All four handles remain owned by Resize; arrows yield to its active preview.
    await papijoHarnessBeginResize('.papijo-image-resize-southEast:not(.ck-hidden)', 12, 6); await settle(ctx);
    assert(controls.every(function (view) { return !view.isVisible; }), 'External arrows hide throughout pointer resize preview');
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 99, bubbles: true })); await settle(ctx);
    assert(controls.every(function (view) { return !view.isVisible; }), 'Another pointer cannot restore arrows during the owned active resize');
    await papijoHarnessEndResize(); await h.selectImage(ctx); await settle(ctx);
    assert(controls.every(function (view) { return view.isVisible; }), 'External arrows recover after resize without duplicate controls');
    baseline = tree(ctx);
    await papijoHarnessBeginResize('.papijo-image-resize-southEast:not(.ck-hidden)', 12, 6); await settle(ctx);
    window.dispatchEvent(new Event('blur')); await papijoHarnessEndResize(); await h.selectImage(ctx); await settle(ctx);
    assert(tree(ctx) === baseline && controls.every(function (view) { return view.isVisible; }), 'Blur cancellation restores arrows with no content/history change');
    positioning(ctx, 'resize recovery');
    var followingView = ctx.editor.editing.mapper.toViewElement(paragraphs(ctx).slice(-1)[0]);
    var following = ctx.editor.editing.view.domConverter.mapViewToDom(followingView);
    var textRange = document.createRange(); textRange.selectNodeContents(following);
    var textRect = textRange.getBoundingClientRect(), afterBox = controls[1].element.getBoundingClientRect();
    following.style.transform = 'translate(' + (afterBox.left - textRect.left) + 'px,' + (afterBox.top - textRect.top) + 'px)';
    window.dispatchEvent(new Event('resize')); await settle(ctx);
    assert(!controls[1].isVisible && dropdown(ctx).isEnabled, 'Rendered surrounding text blocks After without displacing it far away');
    following.style.transform = ''; window.dispatchEvent(new Event('resize')); await settle(ctx);
    assert(controls[1].isVisible, 'After recovers at its original image boundary when text clears');
    var editableView = ctx.editor.editing.view.document.getRoot();
    ctx.editor.editing.view.change(function (writer) {
      writer.setStyle({ height: '16px', 'min-height': '0', 'max-height': '16px', overflow: 'hidden' }, editableView);
    }); await settle(ctx);
    assert(controls.every(function (view) { return !view.isVisible; }) && dropdown(ctx).isEnabled,
      'Clipped editor bounds hide external controls without disabling the native dropdown');
    ctx.editor.editing.view.change(function (writer) {
      ['height', 'min-height', 'max-height', 'overflow'].forEach(function (key) { writer.removeStyle(key, editableView); });
    }); await settle(ctx); positioning(ctx, 'restored editor bounds');
    var coordinateWrites = 0, coordinateObserver = new MutationObserver(function (records) { coordinateWrites += records.length; });
    controls.forEach(function (view) { coordinateObserver.observe(view.element, { attributes: true, attributeFilter: ['style'] }); });
    try {
      var idleTree = tree(ctx); ctx.editor.ui.update(); ctx.editor.ui.update(); await settle(ctx);
      assert(coordinateWrites === 0 && tree(ctx) === idleTree, 'Unchanged UI updates cause no recurring coordinate/history writes');
    }
    finally { coordinateObserver.disconnect(); }
    baseline = tree(ctx);
    await papijoHarnessClick('.papijo-image-paragraph-after:not(.ck-hidden)'); await settle(ctx);
    assert(ctx.editor.model.document.selection.isCollapsed && ctx.editor.model.document.selection.anchor.parent.isEmpty && !ctx.widget.inlineImageUi,
      'Real external arrow inserts paragraph without link/picker activation');
    assert(ctx.editor.model.document.selection.anchor.parent.previousSibling === h.imageModel(ctx).parent &&
      h.imageModel(ctx).getAttribute('papijoImageCaption') === 'Caption stays inside the entire image paragraph.',
      'Lower image-edge After inserts after the whole captioned paragraph');
    await papijoHarnessPressFocusedKey('Control+z'); assert(tree(ctx) === baseline, 'Actual external After is one Undo transaction');
    await papijoHarnessPressFocusedKey('Control+y'); await settle(ctx);
    await h.selectImage(ctx); await settle(ctx);
    await papijoHarnessClick('.papijo-image-paragraph-before:not(.ck-hidden)');
    assert(ctx.editor.model.document.selection.anchor.parent.isEmpty, 'External Before arrow shares command semantics');
    var peer = await open(); await h.selectImage(peer); await settle(peer);
    baseline = peer.editor.getData(); var elements = controls.map(function (v) { return v.element; });
    var oldCommand = ctx.editor.commands.get('papijoImageParagraphBefore'); await close(ctx);
    oldCommand.execute(); assert(peer.editor.getData() === baseline && elements.every(function (e) { return !e.isConnected; }), 'Destruction removes owned arrows and stale command cannot affect peer');
    var recreated = await open(); await h.selectImage(recreated); await settle(recreated);
    assert(arrows(recreated).length === 2 && arrows(peer).length === 2, 'Recreation and multiple editors own exactly their own two views');
    await close(recreated); await close(peer);
    ctx = await open('<p>' + marker() + '</p><p>' + marker('', 'paragraph-B') + '</p>');
    menu = await keyboardMenu(ctx);
    var staleButton = menu.toolbarView.items.get(1);
    await h.selectImage(ctx, 1); baseline = tree(ctx);
    staleButton.fire('execute');
    assert(tree(ctx) === baseline && !menu.isOpen, 'Selection change closes menu and captured child callback cannot redirect to another image');
    await close(ctx);
    assert(globalListeners.length === 0, 'Repeated destroy/recreate releases all newly registered document/window listeners: ' +
      globalListeners.map(function (entry) { return entry.type + ':' + (entry.callback.name || 'anonymous'); }).join(','));
    assert(observedTargets.every(function (targets) { return targets.size === 0; }), 'Every created ResizeObserver releases its observed targets');
    h.results.push('Paragraph external arrows: image-edge geometry, tiny/short fallback, caption independence, rendered-text and balloon guards, pointer commands/history, scroll/resize recovery, multiple instances and complete cleanup');
  }
  finally {
    for (var remaining of contexts.slice()) { await h.close(remaining); }
    H5P.getPath = originalPath; H5PEditor.t = originalTranslate;
    EventTarget.prototype.addEventListener = nativeAdd; EventTarget.prototype.removeEventListener = nativeRemove;
    window.ResizeObserver = NativeObserver;
  }
  function rootContains(ctx, element) { return ctx.editor.editing.view.getDomRoot().contains(element); }
};
