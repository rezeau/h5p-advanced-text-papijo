/* Structural actions around managed imageInline; no storage/runtime conversion. */
(function (H5PEditor) {
  'use strict';

  var actions = {
    papijoSeparateImageParagraph: ['separateImageParagraph', 'mixed'],
    papijoImageParagraphBefore: ['insertImageParagraphBefore', 'only'],
    papijoImageParagraphAfter: ['insertImageParagraphAfter', 'only']
  };
  var safeSpaceAttributes = ['bold', 'italic', 'underline', 'strikethrough', 'subscript',
    'superscript', 'linkHref', 'fontColor', 'fontBackgroundColor', 'fontFamily', 'fontSize'];

  function selected(editor) { return editor.model.document.selection.getSelectedElement(); }

  // Offsets/counts refer to the existing model, not the pre-upcast HTML string.
  function assess(editor, image, valid) {
    if (editor.isReadOnly || !image || !image.is('element', 'imageInline') || !valid(image)) { return null; }
    var paragraph = image.parent, model = editor.model;
    if (!paragraph || !paragraph.is('element', 'paragraph') || !image.root.isAttached() ||
        paragraph.parent !== model.document.getRoot(image.root.rootName) ||
        !model.canEditAt(model.createPositionBefore(image)) ||
        !model.schema.checkChild(model.createPositionBefore(paragraph), 'paragraph') ||
        Array.from(paragraph.getAttributeKeys()).some(function (key) { return key !== 'alignment' && key !== 'indent'; })) {
      return null;
    }
    var children = Array.from(paragraph.getChildren());
    if (children.some(function (child) { return child !== image && !child.is('$text'); })) { return null; }
    if (children.length === 1) { return { mode: 'only', image: image, paragraph: paragraph, left: 0, right: 0 }; }
    var index = children.indexOf(image);
    function boundary(nodes, reverse) {
      var text = nodes.map(function (node) { return node.data; }).join('');
      var match = text.match(reverse ? / +$/ : /^ +/);
      var count = match ? match[0].length : 0;
      var remaining = reverse ? text.slice(0, text.length - count) : text.slice(count);
      var adjacent = reverse ? remaining.slice(-1) : remaining.charAt(0);
      if (adjacent && /[\s\u0085\u200b\u2060]/u.test(adjacent)) { return null; }
      // Never delete semantic annotations or whitespace-preserving code/GHS state.
      var pending = count, runs = reverse ? nodes.slice().reverse() : nodes;
      for (var node of runs) {
        if (!pending) { break; }
        if (Array.from(node.getAttributeKeys()).some(function (key) { return safeSpaceAttributes.indexOf(key) === -1; })) { return null; }
        pending -= Math.min(pending, node.data.length);
      }
      return count;
    }
    var left = boundary(children.slice(0, index), true);
    var right = boundary(children.slice(index + 1), false);
    return left === null || right === null ? null :
      { mode: 'mixed', image: image, paragraph: paragraph, left: left, right: right };
  }

  function install(editor, valid, ButtonView, translate) {
    var Command = Object.getPrototypeOf(editor.commands.get('imageTextAlternative').constructor.prototype).constructor;
    var commands = {}, arrows = [], dropdowns = new Map(), menuTarget = null;
    var doc = editor.sourceElement.ownerDocument, win = doc.defaultView;
    var frame = null, destroyed = false, resizing = false, resizePointer = null, observer = null, observed = null;
    var explicitFocus = [];
    function context(target) { return destroyed ? null : assess(editor, target || selected(editor), valid); }
    function focus() {
      if (!destroyed) {
        // Native UI focus tracking can retain the editable while a dropdown
        // owns DOM focus. Explicit DOM focus makes Escape deterministic.
        editor.editing.view.getDomRoot().focus(); editor.editing.view.focus();
      }
    }
    function closeMenus() {
      dropdowns.forEach(function (_handler, dropdown) { dropdown.isOpen = false; });
      menuTarget = null;
    }
    class ParagraphCommand extends Command {
      constructor(name) { super(editor); this.action = name; }
      refresh() { var state = context(); this.isEnabled = !!state && state.mode === actions[this.action][1]; }
      execute(options) {
        var target = options && Object.prototype.hasOwnProperty.call(options, 'target') ? options.target : selected(editor);
        if (target !== selected(editor)) { return; }
        var state = context(target);
        if (!state || state.mode !== actions[this.action][1]) { return; }
        var name = this.action;
        closeMenus();
        editor.model.change(function (writer) {
          // Revalidate inside the transaction as well; never climb out of a container.
          state = context(target);
          if (!state || state.mode !== actions[name][1]) { return; }
          if (name === 'papijoSeparateImageParagraph') {
            if (state.right) {
              writer.remove(writer.createRange(writer.createPositionAfter(target),
                writer.createPositionAt(target.parent, target.startOffset + target.offsetSize + state.right)));
            }
            if (state.left) {
              writer.remove(writer.createRange(writer.createPositionAt(target.parent, target.startOffset - state.left),
                writer.createPositionBefore(target)));
            }
            if (target.startOffset) { writer.split(writer.createPositionBefore(target)); }
            if (target.startOffset + target.offsetSize < target.parent.maxOffset) { writer.split(writer.createPositionAfter(target)); }
            writer.setSelection(target, 'on');
          }
          else {
            var paragraph = writer.createElement('paragraph');
            writer.insert(paragraph, writer.createPositionAt(state.paragraph,
              name === 'papijoImageParagraphBefore' ? 'before' : 'after'));
            writer.setSelection(paragraph, 0);
          }
        });
        focus(); schedule();
      }
    }
    Object.keys(actions).forEach(function (name) {
      var command = commands[name] = new ParagraphCommand(name);
      editor.commands.add(name, command);
      editor.ui.componentFactory.add(name, function () {
        var button = new ButtonView(editor.locale);
        button.set({ label: translate(actions[name][0]), withText: true, tooltip: true });
        button.bind('isEnabled').to(command, 'isEnabled');
        button.bind('isVisible').to(command, 'isEnabled');
        button.on('execute', function () { editor.execute(name, { target: menuTarget }); });
        return button;
      });
    });

    editor.ui.componentFactory.add('papijoImageParagraphActions', function () {
      // ImageToolbar normalizes declarative objects to component names. Build
      // the named component through public ToolbarView configuration instead.
      var ToolbarView = editor.ui.view.toolbar.constructor;
      var container = new ToolbarView(editor.locale);
      container.fillFromConfig([{ label: translate('imageParagraphActions'), icon: 'pilcrow', items: Object.keys(actions) }],
        editor.ui.componentFactory);
      var dropdown = container.items.get(0);
      dropdown.class = 'ck-toolbar__nested-toolbar-dropdown papijo-image-paragraph-dropdown';
      container.render(); container.items.remove(dropdown); container.destroy();
      connectDropdown(dropdown);
      dropdown.bind('isEnabled').toMany(Object.values(commands), 'isEnabled', function () {
        return Array.from(arguments).some(Boolean);
      });
      editor.listenTo(dropdown, 'change:isOpen', function () {
        if (dropdown.isOpen) {
          menuTarget = selected(editor);
          dropdown.toolbarView.isVertical = true;
          dropdown.toolbarView.maxWidth = Math.max(80, Math.min(win.innerWidth - 16, editor.ui.view.editable.element.clientWidth)) + 'px';
        }
        else if (!Array.from(dropdowns.keys()).some(function (view) { return view.isOpen; })) { menuTarget = null; }
      }, { priority: 'high' });
      return dropdown;
    });

    // The document capture handler is scoped to this editor's owned dropdown.
    function connectDropdown(view) {
      dropdowns.set(view, true);
    }
    function escapeDropdown(event) {
      if (event.key !== 'Escape' || !Array.from(dropdowns.keys()).some(function (view) { return view.element.contains(event.target); })) { return; }
      event.preventDefault(); event.stopImmediatePropagation(); closeMenus(); focus();
    }
    function intersects(a, b) {
      var gap = b.papijoCaption ? 2 : 4;
      return b.width > 0 && b.height > 0 && a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
    }
    function ownedResizeControls() {
      return Array.from(editor.ui.view.body).filter(function (view) {
        return view.element && view.element.classList.contains('papijo-image-resize-handle');
      });
    }
    function position() {
      frame = null;
      if (destroyed) { return; }
      var state = context(), imageView = state && editor.editing.mapper.toViewElement(state.image);
      var image = imageView && editor.editing.view.domConverter.mapViewToDom(imageView);
      var visible = !!(state && state.mode === 'only' && image && image.isConnected &&
        editor.ui.focusTracker.isFocused && !resizing);
      if (observer && observed !== image) {
        observer.disconnect(); observed = image;
        if (image) { observer.observe(image); observer.observe(editor.editing.view.getDomRoot()); }
      }
      var balloon = editor.plugins.get('ContextualBalloon');
      var obstacles = ownedResizeControls().map(function (view) { return view.element.getBoundingClientRect(); });
      if (balloon.visibleView) { obstacles.push(balloon.view.element.getBoundingClientRect()); }
      var editable = editor.editing.view.getDomRoot(), bounds = editable.getBoundingClientRect();
      if (visible) {
        var caption = image.querySelector('.papijo-image-caption');
        if (caption) {
          var captionRect = caption.getBoundingClientRect();
          captionRect.papijoCaption = true; obstacles.push(captionRect);
        }
        // Measure rendered text runs, not paragraph boxes: floats can leave a
        // paragraph box covering space that contains no text.
        var walker = doc.createTreeWalker(editable, win.NodeFilter.SHOW_TEXT), text;
        while ((text = walker.nextNode())) {
          if (image.contains(text)) { continue; }
          var range = doc.createRange(); range.selectNodeContents(text);
          Array.from(range.getClientRects()).forEach(function (rect) { obstacles.push(rect); });
        }
        obstacles.push(editor.ui.view.toolbar.element.getBoundingClientRect());
      }
      // Caption height/its 8em footprint must never become the visual anchor.
      var img = image && image.querySelector('img'), rect = img && img.getBoundingClientRect();
      arrows.forEach(function (arrow, index) {
        arrow.target = visible ? state.image : null;
        var show = visible && rect && rect.width > 0 && rect.height >= 32;
        if (show) {
          var left = Math.max(4, Math.min(win.innerWidth - 32, (rect.left + rect.right) / 2 - 14));
          var top = index === 0 ? rect.top - 12 : rect.bottom - 12;
          if (index === 0 && balloon.visibleView) {
            var balloonRect = balloon.view.element.getBoundingClientRect();
            if (intersects({ left: left, right: left + 28, top: top, bottom: top + 24 }, balloonRect)) {
              top = balloonRect.bottom + 4;
            }
          }
          var box = { left: left, right: left + 28, top: top, bottom: top + 24, width: 28, height: 24 };
          // Only the prototype's bounded balloon adjustment is allowed. The
          // dropdown remains available when an external button cannot fit.
          var middle = (rect.top + rect.bottom) / 2;
          show = left === (rect.left + rect.right) / 2 - 14 &&
            (box.bottom <= middle - 2 || box.top >= middle + 2) &&
            (index !== 0 || top <= rect.top + 2) && top >= 4 && top + 24 <= win.innerHeight - 4 &&
            left >= bounds.left && left + 28 <= bounds.right && top >= bounds.top && top + 24 <= bounds.bottom &&
            !obstacles.some(function (other) { return intersects(box, other); });
          if (show) {
            if (arrow.element.style.left !== left + 'px') { arrow.element.style.left = left + 'px'; }
            if (arrow.element.style.top !== top + 'px') { arrow.element.style.top = top + 'px'; }
            obstacles.push(box);
          }
        }
        if (arrow.isVisible !== !!show) { arrow.isVisible = !!show; }
        arrow.element.tabIndex = -1;
      });
    }
    function schedule() { if (!destroyed && frame === null) { frame = win.requestAnimationFrame(position); } }
    function selectionChanged() { closeMenus(); schedule(); }
    function pointerStart(event) {
      if (ownedResizeControls().some(function (view) { return view.element.contains(event.target); })) {
        resizing = true; resizePointer = event.pointerId; schedule();
      }
    }
    function pointerEnd(event) {
      if (resizing && (!event || event.type === 'blur' || event.pointerId === resizePointer)) {
        resizing = false; resizePointer = null; schedule();
      }
    }
    function escapeResize(event) { if (event.key === 'Escape') { pointerEnd(); } }
    function preventArrowFocus(event) { event.preventDefault(); }
    function ready() {
      ['papijoImageParagraphBefore', 'papijoImageParagraphAfter'].forEach(function (name, index) {
        var arrow = new ButtonView(editor.locale);
        arrow.set({ label: translate(actions[name][0]), tooltip: true, withText: false, isVisible: false,
          icon: '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="' +
            (index === 0 ? 'M3 15h10V8h4l-5-5-5 5h4v5H3z' : 'M3 5h10v7h4l-5 5-5-5h4V7H3z') + '"/></svg>' });
        arrow.extendTemplate({ attributes: { class: ['papijo-image-paragraph-arrow', index ? 'papijo-image-paragraph-after' : 'papijo-image-paragraph-before'] } });
        arrow.bind('isEnabled').to(commands[name], 'isEnabled');
        editor.ui.view.body.add(arrow);
        if (!Array.isArray(editor.ui.focusTracker.elements)) {
          editor.ui.focusTracker.add(arrow.element); explicitFocus.push(arrow.element);
        }
        arrow.element.tabIndex = -1;
        arrow.element.addEventListener('mousedown', preventArrowFocus);
        arrow.on('execute', function () { editor.execute(name, { target: arrow.target }); });
        arrows.push(arrow);
      });
      if (win.ResizeObserver) { observer = new win.ResizeObserver(schedule); }
      doc.addEventListener('scroll', schedule, true); win.addEventListener('resize', schedule);
      doc.addEventListener('pointerdown', pointerStart, true);
      win.addEventListener('blur', pointerEnd);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (event) { doc.addEventListener(event, pointerEnd, true); });
      doc.addEventListener('keyup', escapeResize, true);
      doc.addEventListener('keydown', escapeDropdown, true);
      schedule();
    }
    editor.once('ready', ready);
    editor.listenTo(editor.model.document.selection, 'change:range', selectionChanged);
    editor.listenTo(editor.model.document, 'change:data', function () { closeMenus(); schedule(); });
    editor.listenTo(editor, 'change:isReadOnly', function () { closeMenus(); schedule(); });
    editor.listenTo(editor.ui, 'update', schedule);
    editor.listenTo(editor.ui.focusTracker, 'change:isFocused', schedule);
    editor.listenTo(editor.editing.view, 'render', schedule);
    editor.listenTo(editor.plugins.get('ContextualBalloon'), 'change:visibleView', schedule);
    editor.once('destroy', function () {
      destroyed = true; closeMenus();
      if (frame !== null) { win.cancelAnimationFrame(frame); }
      if (observer) { observer.disconnect(); }
      doc.removeEventListener('scroll', schedule, true); win.removeEventListener('resize', schedule);
      doc.removeEventListener('pointerdown', pointerStart, true);
      win.removeEventListener('blur', pointerEnd);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (event) { doc.removeEventListener(event, pointerEnd, true); });
      doc.removeEventListener('keyup', escapeResize, true);
      doc.removeEventListener('keydown', escapeDropdown, true);
      dropdowns.clear();
      explicitFocus.forEach(function (element) { editor.ui.focusTracker.remove(element); });
      arrows.forEach(function (arrow) {
        arrow.element.removeEventListener('mousedown', preventArrowFocus);
        editor.ui.view.body.remove(arrow); arrow.destroy();
      });
      arrows = [];
    });
  }

  H5PEditor.AdvancedTextPapiJoInlineImageParagraph = { assess: assess, install: install };
})(H5PEditor);
