/* Library-local image sizing. Uses public CKEditor model/view/UI and Pointer Events. */
(function (H5PEditor, managed) {
  'use strict';

  var key = 'papijoImageWidth';
  var corners = ['northWest', 'northEast', 'southWest', 'southEast'];
  // Local reset icon; no absent CKEditor resize classes or external assets.
  var resetIcon = '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M4 5V1L1 5l3 4V6a6 6 0 1 1-1 7H1.4A7.5 7.5 0 1 0 4 5Z"/></svg>';

  function selected(editor) {
    var image = editor.model.document.selection.getSelectedElement();
    return image && image.is('element', 'imageInline') ? image : null;
  }

  function domImage(editor, target) {
    var view = target && editor.editing.mapper.toViewElement(target);
    var wrapper = view && editor.editing.view.domConverter.mapViewToDom(view);
    var image = wrapper && wrapper.querySelector('img');
    return image && wrapper.isConnected ? { view: view, wrapper: wrapper, image: image } : null;
  }

  function geometry(editor, target) {
    var dom = domImage(editor, target);
    if (!dom || !dom.image.naturalWidth || !dom.image.naturalHeight) { return null; }
    var region = dom.wrapper.parentElement;
    var win = dom.image.ownerDocument.defaultView;
    while (region && /^(inline|inline-block|contents)$/.test(win.getComputedStyle(region).display)) {
      region = region.parentElement;
    }
    if (!region) { return null; }
    var style = win.getComputedStyle(region);
    var basis = region.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
    var wrapperStyle = win.getComputedStyle(dom.wrapper);
    var gutter = wrapperStyle.cssFloat !== 'none' ?
      parseFloat(wrapperStyle.marginLeft || 0) + parseFloat(wrapperStyle.marginRight || 0) : 0;
    if (!(basis > 0)) { return null; }
    return Object.assign(dom, { region: region, basis: basis, gutter: gutter,
      natural: dom.image.naturalWidth, ratio: dom.image.naturalWidth / dom.image.naturalHeight,
      rect: dom.image.getBoundingClientRect() });
  }

  function round(value) { return Math.round(value * 10) / 10; }

  function install(editor, valid, ButtonView, translate) {
    var editable = editor.editing.view.getDomRoot();
    // The DOM root is not available until ready during plugin initialization.
    var doc = editor.sourceElement.ownerDocument;
    var win = doc.defaultView;
    var handles = [], active = null, frame = null, observer = null;
    var observed = [], watching = false, destroyed = false;
    var explicitFocus = [];
    var leaving = false, exitTimer = null;

    function usable(target) {
      return !destroyed && !editor.isReadOnly && target && valid(target);
    }

    // Attribute conversion consumes the dedicated state. Projection is performed
    // after native widget/link/style conversion, also for image loads and history.
    editor.conversion.for('editingDowncast').add(function (dispatcher) {
      dispatcher.on('attribute:' + key + ':imageInline', function (event, data, api) {
        api.consumable.consume(data.item, event.name);
      });
    });

    function project(target, writer) {
      var view = editor.editing.mapper.toViewElement(target);
      if (!view) { return false; }
      var width = active && active.target === target && active.preview !== null ? active.preview :
        managed.normalizeWidth(target.getAttribute(key));
      var dom = domImage(editor, target);
      var sized = width !== null;
      var changed = false;
      if (sized !== view.hasClass(managed.sizeClass)) {
        changed = true;
        if (writer) {
          if (sized) { writer.addClass(managed.sizeClass, view); }
          else { writer.removeClass(managed.sizeClass, view); }
        }
      }
      var styles = { '--papijo-image-width': sized ? width + '%' : null,
        '--papijo-image-natural-width': sized && dom && dom.image.naturalWidth ? dom.image.naturalWidth + 'px' : null };
      Object.keys(styles).forEach(function (name) {
        if (styles[name] === null) {
          if (view.hasStyle(name)) { changed = true; if (writer) { writer.removeStyle(name, view); } }
        }
        else if (view.getStyle(name) !== styles[name]) { changed = true; if (writer) { writer.setStyle(name, styles[name], view); } }
      });
      return changed;
    }

    function projectAll() {
      if (destroyed) { return; }
      var dirty = [];
      Array.from(editor.model.document.getRootNames()).forEach(function (name) {
        Array.from(editor.model.createRangeIn(editor.model.document.getRoot(name)).getItems()).forEach(function (item) {
          if (item.is('element', 'imageInline') && project(item, null)) { dirty.push(item); }
        });
      });
      // Avoid a render -> animation frame -> unconditional render loop.
      if (dirty.length) { editor.editing.view.change(function (writer) { dirty.forEach(function (item) { project(item, writer); }); }); }
    }

    function schedule() {
      if (destroyed || frame !== null) { return; }
      frame = win.requestAnimationFrame(function () {
        frame = null;
        projectAll();
        position();
      });
    }

    function watch(enabled) {
      if (enabled === watching) { return; }
      watching = enabled;
      // Scroll does not bubble. Own-document capture is temporary while visible.
      doc[enabled ? 'addEventListener' : 'removeEventListener']('scroll', schedule, true);
      win[enabled ? 'addEventListener' : 'removeEventListener']('resize', schedule);
    }

    function observe(g) {
      var next = g ? [g.image, g.region] : [];
      if (next.length === observed.length && next.every(function (item, i) { return item === observed[i]; })) { return; }
      if (observer) { observer.disconnect(); }
      observed = next;
      if (!observer && win.ResizeObserver) { observer = new win.ResizeObserver(schedule); }
      if (observer) { next.forEach(function (element) { observer.observe(element); }); }
    }

    function position() {
      if (destroyed || !handles.length) { return; }
      var target = selected(editor);
      var g = usable(target) && editor.ui.focusTracker.isFocused && geometry(editor, target);
      if (active && (!g || target !== active.target || Math.abs(g.basis - active.basis) > 0.5)) {
        finish(false); g = null;
      }
      // Hide offscreen handles rather than leaving invisible focus targets.
      var visible = !!(g && g.rect.width && g.rect.height && g.rect.bottom > 0 &&
        g.rect.top < win.innerHeight && g.rect.right > 0 && g.rect.left < win.innerWidth);
      observe(visible ? g : null);
      watch(visible);
      handles.forEach(function (handle, index) {
        handle.isVisible = visible;
        // One sequential entry; pointer users can still focus every corner.
        handle.tabindex = visible && index === 3 && !leaving ? 0 : -1;
        if (!visible) { return; }
        var right = index % 2 === 1, bottom = index >= 2;
        // Keep four independent hit targets even for a 0.1% occurrence. Only
        // control positions expand; the actual image/percentage stays untouched.
        var halfWidth = Math.max(32, g.rect.width) / 2, halfHeight = Math.max(32, g.rect.height) / 2;
        var centerX = (g.rect.left + g.rect.right) / 2, centerY = (g.rect.top + g.rect.bottom) / 2;
        handle.element.style.left = Math.max(8, Math.min(win.innerWidth - 8, centerX + (right ? halfWidth : -halfWidth))) + 'px';
        handle.element.style.top = Math.max(8, Math.min(win.innerHeight - 8, centerY + (bottom ? halfHeight : -halfHeight))) + 'px';
        var width = active && active.preview !== null ? active.preview : managed.normalizeWidth(target.getAttribute(key));
        handle.label = translate('resizeHandle' + corners[index]) + '. ' +
          (width === null ? translate('imageSizeDefault') : width + '%') + '. ' + translate('imageResizeKeys');
      });
    }

    function commit(target, value) {
      if (!usable(target)) { return false; }
      if (value !== null && managed.normalizeWidth(value) === null) { return false; }
      if (value === managed.normalizeWidth(target.getAttribute(key))) { return false; }
      editor.model.change(function (writer) {
        if (value === null) { writer.removeAttribute(key, target); }
        else { writer.setAttribute(key, value, target); }
      });
      projectAll(); schedule();
      return true;
    }

    function escape(event) {
      if (event.key === 'Escape' && active) {
        event.preventDefault(); event.stopImmediatePropagation(); finish(false);
        editor.editing.view.focus();
      }
    }
    function blur() { finish(false); }

    function finish(apply) {
      var gesture = active;
      if (!gesture) { return; }
      // Clear before releasing capture: normal release fires lostpointercapture.
      active = null;
      doc.removeEventListener('keydown', escape, true);
      win.removeEventListener('blur', blur);
      if (gesture.element.hasPointerCapture(gesture.pointer)) { gesture.element.releasePointerCapture(gesture.pointer); }
      var g = geometry(editor, gesture.target);
      var fresh = usable(gesture.target) && selected(editor) === gesture.target &&
        gesture.target.getAttribute('inlineImageId') === gesture.id &&
        editor.model.document.version === gesture.version && g && Math.abs(g.basis - gesture.basis) <= 0.5;
      if (apply && fresh && gesture.moved && gesture.preview !== null) { commit(gesture.target, gesture.preview); }
      // The newest model always owns restoration, including stale-target cancel.
      if (!destroyed) { projectAll(); position(); schedule(); }
    }

    function start(event, handle, index) {
      if (event.button !== 0 || !event.isPrimary || active) { return; }
      var target = selected(editor), g = usable(target) && geometry(editor, target);
      if (!g || !g.rect.width) { return; }
      event.preventDefault(); event.stopPropagation();
      handle.focus();
      active = { target: target, id: target.getAttribute('inlineImageId'), version: editor.model.document.version,
        element: handle.element, pointer: event.pointerId, index: index, basis: g.basis, natural: g.natural,
        gutter: g.gutter, ratio: g.ratio, width: g.rect.width, x: event.clientX, y: event.clientY,
        preview: null, moved: false };
      try { handle.element.setPointerCapture(event.pointerId); }
      catch (error) { finish(false); return; }
      doc.addEventListener('keydown', escape, true);
      win.addEventListener('blur', blur);
    }

    function move(event) {
      if (!active || event.pointerId !== active.pointer) { return; }
      event.preventDefault(); event.stopPropagation();
      var sx = active.index % 2 ? 1 : -1, sy = active.index >= 2 ? 1 : -1;
      var dx = event.clientX - active.x, dy = event.clientY - active.y;
      // Project corner motion onto the source aspect-ratio diagonal.
      var delta = (sx * dx + sy * dy / active.ratio) / (1 + 1 / (active.ratio * active.ratio));
      var pixels = Math.max(active.basis * 0.001, Math.min(active.width + delta, active.natural, active.basis - active.gutter));
      var value = Math.max(0.1, Math.min(100, round(pixels / active.basis * 100)));
      if (Math.abs(pixels - active.width) < 0.5 && !active.moved) { return; }
      active.moved = Math.abs(pixels - active.width) >= 0.5;
      active.preview = active.moved ? value : null;
      projectAll(); position(); editor.ui.update();
    }

    function enterKeyboardResize(event) {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || active) { return; }
      // Capture only our editable's Tab, before native list indentation or
      // browser navigation. UI-body DOM order alone cannot provide this path.
      position();
      var entry = handles[3];
      if (!entry || !entry.isVisible || !usable(selected(editor))) { return; }
      if (event.shiftKey) {
        // Backward navigation from this selected image must not outdent a
        // surrounding list. Keep the browser's ordinary backward Tab action.
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault(); event.stopImmediatePropagation(); entry.focus();
    }

    function keyboard(event) {
      if (event.key === 'Escape' || event.key === 'Tab' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (active) { finish(false); }
        editor.editing.view.focus();
        return;
      }
      if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (active) { finish(false); }
        // Let the browser perform its normal forward Tab from the editable,
        // skipping the external entry for this one navigation event.
        leaving = true;
        handles[3].tabindex = -1;
        editor.editing.view.focus();
        if (exitTimer !== null) { win.clearTimeout(exitTimer); }
        exitTimer = win.setTimeout(function () {
          exitTimer = null; leaving = false;
          if (!destroyed) { position(); }
        }, 0);
        return;
      }
      if (!/^Arrow(Left|Right|Up|Down)$/.test(event.key) || event.altKey || event.ctrlKey || event.metaKey) { return; }
      event.preventDefault(); event.stopImmediatePropagation();
      if (active) { finish(false); }
      var target = selected(editor), g = usable(target) && geometry(editor, target);
      if (!g) { return; }
      var value = managed.normalizeWidth(target.getAttribute(key));
      if (value === null) { value = round(g.rect.width / g.basis * 100); }
      var increment = event.shiftKey ? 5 : 0.1;
      var direction = /Right|Up/.test(event.key) ? 1 : -1;
      commit(target, Math.max(0.1, Math.min(100, round(value + direction * increment))));
      position();
    }

    // Use the native Command base exposed through the native ALT command's
    // public prototype, since this H5P bundle exports no standalone classes.
    var Command = Object.getPrototypeOf(editor.commands.get('imageTextAlternative').constructor.prototype).constructor;
    // Define execute before super decorates it: replacing an instance method
    // afterward would bypass native disabled-command execution guards.
    class ResetSizeCommand extends Command {
      refresh() {
        var image = selected(editor);
        this.isEnabled = !!(usable(image) && managed.normalizeWidth(image.getAttribute(key)) !== null);
      }
      execute() { finish(false); commit(selected(editor), null); }
    }
    var reset = new ResetSizeCommand(editor);
    editor.commands.add('papijoResetImageSize', reset);
    editor.ui.componentFactory.add('papijoResetImageSize', function () {
      var button = new ButtonView(editor.locale);
      button.set({ label: translate('resetImageSize'), icon: resetIcon, tooltip: true, withText: false });
      button.bind('isEnabled').to(reset, 'isEnabled');
      button.on('execute', function () { editor.execute('papijoResetImageSize'); editor.editing.view.focus(); });
      return button;
    });

    function ready() {
      editable = editor.editing.view.getDomRoot();
      corners.forEach(function (corner, index) {
        var handle = new ButtonView(editor.locale);
        handle.set({ label: translate('resizeHandle' + corner), withText: false, tooltip: false, isVisible: false });
        handle.extendTemplate({ attributes: { class: ['papijo-image-resize-handle', 'papijo-image-resize-' + corner] } });
        editor.ui.view.body.add(handle);
        // 43.3 auto-registers body views; 43.0 requires explicit ownership.
        if (!Array.isArray(editor.ui.focusTracker.elements)) {
          editor.ui.focusTracker.add(handle.element); explicitFocus.push(handle.element);
        }
        handle.element.setAttribute('aria-live', 'polite');
        handle.element.addEventListener('pointerdown', function (event) { start(event, handle, index); });
        handle.element.addEventListener('pointermove', move);
        handle.element.addEventListener('pointerup', function (event) {
          if (active && event.pointerId === active.pointer) { event.preventDefault(); event.stopPropagation(); finish(true); }
        });
        ['pointercancel', 'lostpointercapture'].forEach(function (name) {
          handle.element.addEventListener(name, function (event) { if (active && event.pointerId === active.pointer) { finish(false); } });
        });
        handle.element.addEventListener('keydown', keyboard);
        // UI-body controls are outside the editing KeyObserver. Subscribe only
        // our handles so native Ctrl+Z/Y/K still work from their keyboard focus.
        editor.keystrokes.listenTo(handle.element);
        handle.element.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); });
        handles.push(handle);
      });
      editable.addEventListener('load', schedule, true);
      editable.addEventListener('keydown', enterKeyboardResize, true);
      schedule();
    }
    editor.once('ready', ready);
    editor.listenTo(editor.model.document, 'change:data', function () { finish(false); projectAll(); schedule(); });
    editor.listenTo(editor.model.document.selection, 'change:range', function () { finish(false); schedule(); });
    editor.listenTo(editor, 'change:isReadOnly', function () { finish(false); reset.refresh(); schedule(); });
    editor.listenTo(editor.ui.focusTracker, 'change:isFocused', schedule);
    editor.listenTo(editor.editing.view, 'render', schedule);
    editor.listenTo(editor.ui, 'update', schedule);
    editor.once('destroy', function () {
      finish(false); destroyed = true;
      if (frame !== null) { win.cancelAnimationFrame(frame); frame = null; }
      if (exitTimer !== null) { win.clearTimeout(exitTimer); exitTimer = null; }
      watch(false); if (observer) { observer.disconnect(); }
      if (editable) {
        editable.removeEventListener('load', schedule, true);
        editable.removeEventListener('keydown', enterKeyboardResize, true);
      }
      explicitFocus.forEach(function (element) { editor.ui.focusTracker.remove(element); });
      handles.forEach(function (handle) {
        editor.keystrokes.stopListening(handle.element);
        editor.ui.view.body.remove(handle); handle.destroy();
      });
      handles = []; observed = [];
    });
  }

  H5PEditor.AdvancedTextPapiJoInlineImageResize = { install: install };
})(H5PEditor, PapijoManagedInlineImages);
