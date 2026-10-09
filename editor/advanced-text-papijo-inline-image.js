(function (H5PEditor, managed) {
  'use strict';

  var modelName = 'imageInline';
  var uiSequence = 0;
  var namespace = '.papijoInlineImage';
  var library = 'H5PEditor.AdvancedTextPapiJoTooltip';
  // CKEditor 5 core/theme/icons/image.svg, from the installed 43.3.0 build.
  // Copyright (c) 2003-2024 CKSource Holding sp. z o.o.; CKEditor OSS license.
  // This build exports ClassicEditor only, so retain the standard SVG locally.
  var imageIcon = '<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M6.66 9.118a.693.693 0 0 1 .956.032l3.65 3.411 2.422-2.238a.695.695 0 0 1 .945 0L17.5 13.6V2.5h-15v11.1l4.16-4.482ZM17.8 1c.652 0 1.2.47 1.2 1.1v14.362c0 .64-.532 1.038-1.184 1.038H2.184C1.532 17.5 1 17.103 1 16.462V2.1C1 1.47 1.537 1 2.2 1h15.6Zm-5.655 6a2.128 2.128 0 0 1 .157-2.364A2.133 2.133 0 1 1 12.145 7Z"/></svg>';
  function t(key) { return H5PEditor.t(library, key); }

  function Store(parent, field, params, setValue) {
    this.parent = parent;
    this.field = field;
    this.params = Array.isArray(params) ? params : [];
    this.setValue = setValue;
  }
  Store.prototype.appendTo = function ($wrapper) {
    this.$item = H5PEditor.$('<div>', { hidden: true }).appendTo($wrapper);
  };
  Store.prototype.getDefinition = function (id) {
    return managed.lookup(this.params, id);
  };
  Store.prototype.addDefinition = function (image, alt) {
    var id;
    do { id = managed.createId(); }
    while (this.params.some(function (definition) { return definition && definition.id === id; }));
    var definition = { id: id, image: image, alt: typeof alt === 'string' ? alt.trim() : '' };
    if (!managed.validDefinition(definition)) {
      return null;
    }
    definition = JSON.parse(JSON.stringify(definition));
    this.params.push(definition);
    this.setValue(this.field, this.params);
    return definition;
  };
  Store.prototype.validate = function () {
    var ids = new Set();
    var valid = this.params.every(function (definition) {
      if (!managed.validDefinition(definition) || ids.has(definition.id)) {
        return false;
      }
      ids.add(definition.id);
      return true;
    });
    // Deliberately retain definitions, including those absent from current HTML/history.
    if (valid) {
      this.setValue(this.field, this.params.length ? this.params : undefined);
    }
    return valid;
  };
  Store.prototype.remove = function () { if (this.$item) { this.$item.remove(); } };

  function getStore(widget) {
    return widget.parent && Array.isArray(widget.parent.children) ?
      widget.parent.children.find(function (child) { return child instanceof Store; }) : null;
  }

  function install(editor, widget) {
    editor.once('destroy', function () {
      if (widget.inlineImageUi && widget.inlineImageUi.editor === editor) { close(widget, false); }
    });
    editor.model.schema.extend(modelName, { allowAttributes: ['inlineImageId', 'linkHref', 'papijoImageWidth', 'papijoImageCaption'] });
    // Native surrounding-anchor upcast can run after the marker converter.
    // Carry its canonical choice to the first attached post-fix, not persistence.
    var importedLinks = new WeakMap();
    editor.data.processor.registerRawContentMatcher({name:'span',classes:'papijo-image-caption'});
    function projection(id) {
      var store = getStore(widget);
      var definition = store && store.getDefinition(id);
      var attributes = { inlineImageId: id,
        alt: definition ? definition.alt.trim() : t('inlineImageUnavailable') };
      var url = managed.resolve(definition, H5PEditor.contentId, H5P.getPath);
      if (url) { attributes.src = url; }
      return attributes;
    }
    editor.conversion.for('upcast').add(function (dispatcher) {
      // Stop native/GHS image converters before they can create a URL-owned model.
      dispatcher.on('element:img', function (event, data, api) {
        api.consumable.consume(data.viewItem, { name: true });
        event.stop();
      }, { priority: 'highest' });
    });
    editor.conversion.for('upcast').elementToElement({
      view: { name: 'span', classes: managed.className, attributes: [managed.attribute] },
      model: function (view, api) {
        var id = view.getAttribute(managed.attribute);
        if (!managed.validId(id)) { return null; }
        var attributes = projection(id);
        var href = managed.normalizeLink(view.getAttribute(managed.linkAttribute));
        var ancestor = view.parent;
        while (ancestor && !ancestor.is('element', 'a')) { ancestor = ancestor.parent; }
        href = href || (ancestor && managed.normalizeLink(ancestor.getAttribute('href')));
        if (href) { attributes.linkHref = href; }
        if (view.hasAttribute(managed.linkAttribute)) {
          api.consumable.consume(view, { attributes: [managed.linkAttribute] });
        }
        var style = managed.normalizeStyle(view.getAttribute(managed.styleAttribute));
        if (style) { attributes.imageStyle = style; }
        // The optional attribute must not be required to match old markers.
        if (view.hasAttribute(managed.styleAttribute)) {
          api.consumable.consume(view, { attributes: [managed.styleAttribute] });
        }
        var width = managed.normalizeWidth(view.getAttribute(managed.widthAttribute));
        if (width !== null) { attributes.papijoImageWidth = width; }
        if (view.hasAttribute(managed.widthAttribute)) {
          api.consumable.consume(view, { attributes: [managed.widthAttribute] });
        }
        var children = Array.from(view.getChildren());
        var significant = children.filter(function(n){return !n.is('$text') || /\S/.test(n.data);});
        var child = significant.length === 1 && significant[0];
        if (child && child.is('element','span') && child.getAttribute('class') === managed.captionClass &&
            Array.from(child.getAttributeKeys()).length === 1) {
          var raw = child.getCustomProperty('$rawContent');
          // Bounds precede entity decoding. Literal markup is rejected, not stripped.
          if (typeof raw === 'string' && raw.length <= 12000 && raw.indexOf('<') === -1) {
            var decoded = new DOMParser().parseFromString('<span>'+raw+'</span>','text/html').body.firstChild;
            var caption = decoded && managed.normalizeCaption(decoded.textContent);
            if (caption) { attributes.papijoImageCaption = caption; }
          }
        }
        var image = api.writer.createElement(modelName, attributes);
        importedLinks.set(image, href || null);
        return image;
      },
      converterPriority: 'high'
    });
    editor.conversion.for('dataDowncast').elementToElement({
      model: { name: modelName, attributes: ['inlineImageId', 'imageStyle', 'linkHref', 'papijoImageWidth', 'papijoImageCaption'] },
      view: function (model, api) {
        var attributes = { 'class': managed.className };
        attributes[managed.attribute] = model.getAttribute('inlineImageId');
        var style = managed.normalizeStyle(model.getAttribute('imageStyle'));
        if (style) { attributes[managed.styleAttribute] = style; }
        var href = managed.normalizeLink(model.getAttribute('linkHref'));
        if (href) { attributes[managed.linkAttribute] = href; }
        var width = managed.normalizeWidth(model.getAttribute('papijoImageWidth'));
        if (width !== null) { attributes[managed.widthAttribute] = String(width); }
        var caption = managed.normalizeCaption(model.getAttribute('papijoImageCaption'));
        if (!caption) { return api.writer.createEmptyElement('span', attributes); }
        return api.writer.createContainerElement('span', attributes, [
          api.writer.createRawElement('span',{class:'papijo-image-caption'},function(el){el.textContent=caption;})
        ]);
      },
      converterPriority: 'high'
    });
    editor.conversion.for('dataDowncast').add(function (dispatcher) {
      dispatcher.on('attribute', function (event, data, api) {
        if (data.item.is('element', modelName) &&
            data.attributeKey !== 'inlineImageId' && data.attributeKey !== 'imageStyle' &&
            data.attributeKey !== 'linkHref' && data.attributeKey !== 'papijoImageWidth' && data.attributeKey !== 'papijoImageCaption') {
          // Native src/alt/size handlers expect an img. Consume projections before
          // those handlers run: the data view deliberately contains only a span.
          api.consumable.consume(data.item, event.name);
          event.stop();
        }
      }, { priority: 'highest' });
      dispatcher.on('attribute:linkHref:' + modelName, function (event, data, api) {
        // Element reconversion above owns the marker URL. Suppress native a and
        // automatic decorators even though Link remains native in the editor.
        api.consumable.consume(data.item, event.name);
        event.stop();
      }, { priority: 'highest' });
    });

    var imageUtils = editor.plugins.get('ImageUtils');
    // An image-only anchor inside a noneditable widget has a native default
    // navigation action. Cancel it only for this editor's managed widgets;
    // keep href/model state and normal widget/LinkUI click handling intact.
    editor.listenTo(editor.editing.view.document, 'click', function (event, data) {
      var target = data.domTarget;
      var wrapper = target && target.closest && target.closest('.image-inline');
      if (!wrapper || !target.closest('a[href]')) { return; }
      var view = editor.editing.view.domConverter.mapDomToView(wrapper);
      var image = view && editor.editing.mapper.toModelElement(view);
      if (!image || !image.is('element', modelName) || !image.hasAttribute('inlineImageId')) { return; }
      data.preventDefault();
      // Native LinkEditing explicitly opens modifier-click links from href.
      if (data.domEvent.ctrlKey || data.domEvent.metaKey) { event.stop(); }
    }, { context: '$capture', priority: 'highest' });
    editor.conversion.for('editingDowncast').elementToStructure({
      model: { name: modelName, attributes: ['papijoImageCaption'] },
      view: function (model, api) {
        var writer = api.writer, img = writer.createEmptyElement('img'), children = [img];
        var caption = managed.normalizeCaption(model.getAttribute('papijoImageCaption'));
        var captionId = caption ? 'papijo-editor-caption-' + managed.createId() : null;
        if (caption) {
          writer.setAttribute('aria-describedby', captionId, img);
          children.push(writer.createUIElement('span', { class: managed.captionClass, id: captionId }, function (doc) {
            var element = this.toDomElement(doc);
            element.textContent = caption;
            return element;
          }));
        }
        return imageUtils.toImageWidget(writer.createContainerElement('span', {
          class: 'image-inline' + (caption ? ' ' + managed.captionedClass : '')
        }, children), writer, editor.t('image widget'));
      },
      converterPriority: 'high'
    });
    editor.conversion.for('editingDowncast').add(function (dispatcher) {
      dispatcher.on('attribute:linkHref:' + modelName, function (event, data, api) {
        if (!api.consumable.consume(data.item, event.name)) { return; }
        var view = api.mapper.toViewElement(data.item), img = imageUtils.findViewImgElement(view), writer = api.writer;
        if (view.parent.is('attributeElement') && view.parent.getCustomProperty('link')) {
          writer.unwrap(writer.createRangeOn(view), view.parent);
        }
        if (img.parent.is('attributeElement') && img.parent.getCustomProperty('link')) {
          writer.unwrap(writer.createRangeOn(img), img.parent);
        }
        var href = managed.normalizeLink(data.attributeNewValue);
        if (href) {
          var captioned = !!managed.normalizeCaption(data.item.getAttribute('papijoImageCaption'));
          // Preserve the established native link selection/UI for empty widgets.
          // Captioned widgets move the anchor inside, around the img alone.
          var attributes = captioned ? { href: href, tabindex: '-1' } : { href: href };
          var anchor = writer.createAttributeElement('a', attributes, { priority: 5 });
          writer.setCustomProperty('link', true, anchor);
          writer.wrap(writer.createRangeOn(captioned ? img : view), anchor);
        }
        event.stop();
      }, { priority: 'highest' });
    });
    editor.conversion.for('editingDowncast').add(function (dispatcher) {
      dispatcher.on('attribute:inlineImageId:' + modelName, function (event, data, api) {
        api.consumable.consume(data.item, event.name);
      });
    });
    // Defense in depth for direct model insertion, clipboard operations and
    // history: every preview is a projection of a valid, local managed ID.
    editor.model.document.registerPostFixer(function (writer) {
      var changed = false;
      Array.from(editor.model.document.getRootNames()).forEach(function (rootName) {
        var root = editor.model.document.getRoot(rootName);
        Array.from(writer.createRangeIn(root).getItems()).forEach(function (item) {
          if (!item.is('element', modelName)) { return; }
          var id = item.getAttribute('inlineImageId');
          if (!managed.validId(id)) { writer.remove(item); changed = true; return; }
          var href = managed.normalizeLink(importedLinks.has(item) ? importedLinks.get(item) : item.getAttribute('linkHref'));
          importedLinks.delete(item);
          if ((href && href !== item.getAttribute('linkHref')) || (!href && item.hasAttribute('linkHref'))) {
            if (href) { writer.setAttribute('linkHref', href, item); }
            else { writer.removeAttribute('linkHref', item); }
            changed = true;
          }
          // Decorators/GHS anchor attributes must never become image state.
          Array.from(item.getAttributeKeys()).forEach(function (key) {
            if ((/^link/.test(key) && key !== 'linkHref') || key === 'htmlA') {
              writer.removeAttribute(key, item); changed = true;
            }
          });
          var attributes = projection(id);
          ['src', 'alt'].forEach(function (key) {
            if (item.getAttribute(key) === attributes[key]) { return; }
            if (attributes[key] === undefined) { writer.removeAttribute(key, item); }
            else { writer.setAttribute(key, attributes[key], item); }
            changed = true;
          });
          if (item.hasAttribute('imageStyle') && !managed.normalizeStyle(item.getAttribute('imageStyle'))) {
            writer.removeAttribute('imageStyle', item); changed = true;
          }
          var caption = managed.normalizeCaption(item.getAttribute('papijoImageCaption'));
          if (item.hasAttribute('papijoImageCaption') && caption !== item.getAttribute('papijoImageCaption')) {
            if (caption) { writer.setAttribute('papijoImageCaption', caption, item); }
            else { writer.removeAttribute('papijoImageCaption', item); }
            changed = true;
          }
          var width = managed.normalizeWidth(item.getAttribute('papijoImageWidth'));
          if (item.hasAttribute('papijoImageWidth') && width !== item.getAttribute('papijoImageWidth')) {
            if (width === null) { writer.removeAttribute('papijoImageWidth', item); }
            else { writer.setAttribute('papijoImageWidth', width, item); }
            changed = true;
          }
          ['srcset', 'sizes', 'sources', 'width', 'height', 'resizedWidth'].forEach(function (key) {
            if (item.hasAttribute(key)) { writer.removeAttribute(key, item); changed = true; }
          });
        });
      });
      return changed;
    });
    ['insertImage', 'replaceImageSource'].forEach(function (name) {
      editor.commands.get(name).forceDisabled('papijo-managed-images');
    });
    var presentation = editor.commands.get('imageStyle');
    presentation.on('execute', function (event, args) {
      var options = args[0] || {};
      // Native UI calls this decorated command. Constrain direct calls as well.
      if (options.value !== 'inline' && !managed.normalizeStyle(options.value)) {
        event.stop(); return;
      }
      args[0] = Object.assign({}, options, { setImageSizes: false });
    }, { priority: 'high' });
    function containEditingFloats() {
      editor.editing.view.change(function (writer) {
        Array.from(editor.model.document.getRootNames()).forEach(function (name) {
          var root = editor.model.document.getRoot(name);
          var viewRoot = editor.editing.view.document.getRoot(name);
          if (!viewRoot) { return; }
          var floating = Array.from(editor.model.createRangeIn(root).getItems()).some(function (item) {
            return item.is('element', modelName) && !!managed.normalizeStyle(item.getAttribute('imageStyle'));
          });
          if (floating) { writer.addClass(managed.floatRootClass, viewRoot); }
          else { writer.removeClass(managed.floatRootClass, viewRoot); }
        });
      });
    }
    editor.listenTo(editor.model.document, 'change:data', containEditingFloats);
    editor.once('ready', containEditingFloats);
    var alternative = editor.commands.get('imageTextAlternative');
    alternative.on('execute', function (event, args) {
      event.stop();
      var value = args[0] && args[0].newValue;
      var image = editor.model.document.selection.getSelectedElement();
      var store = getStore(widget);
      var previous = image && store && store.getDefinition(image.getAttribute('inlineImageId'));
      if (editor.isReadOnly || !alternative.isEnabled || !previous ||
          typeof value !== 'string' || !value.trim() || value.trim() === previous.alt.trim()) { return; }
      var definition = store.addDefinition(previous.image, value);
      if (!definition) { return; }
      editor.model.change(function (writer) {
        writer.setAttribute('inlineImageId', definition.id, image);
        writer.setAttribute('alt', definition.alt, image);
      });
    }, { priority: 'high' });
    var balloon = editor.plugins.get('ContextualBalloon');
    var linkUi = editor.plugins.get('LinkUI');
    var linkCommand = editor.commands.get('link');
    var linkSessions = new WeakMap();
    var adaptedLinks = new WeakSet();
    function selectedImage() {
      var image = editor.model.document.selection.getSelectedElement();
      return image && image.is('element', modelName) ? image : null;
    }
    function editableImage(image) {
      var store = getStore(widget);
      return !editor.isReadOnly && image && image.root.rootName !== '$graveyard' && image.root.isAttached() &&
        editor.model.document.getRoot(image.root.rootName) === image.root && store &&
        store.getDefinition(image.getAttribute('inlineImageId'));
    }
    linkCommand.on('execute', function (event, args) {
      var image = selectedImage();
      if (!image) { return; } // Preserve the host's ordinary text-link behavior.
      var href = managed.normalizeLink(args[0]);
      if (!editableImage(image) || !href) { event.stop(); return; }
      args[0] = href;
      args[1] = {}; // No manual image decorators; the post-fixer strips old ones.
    }, { priority: 'high' });
    function refreshLinkAvailability() {
      var image = selectedImage();
      ['link', 'unlink'].forEach(function (name) {
        var command = editor.commands.get(name);
        if (image && !editableImage(image)) { command.forceDisabled('papijo-image-link'); }
        else { command.clearForceDisabled('papijo-image-link'); }
      });
    }
    editor.listenTo(editor.model.document, 'change', refreshLinkAvailability);
    editor.listenTo(editor, 'change:isReadOnly', refreshLinkAvailability);
    refreshLinkAvailability();
    editor.ui.componentFactory.add('papijoLinkImage', function () {
      var button = editor.ui.componentFactory.create('link');
      button.set({ label: t('linkInlineImage'), tooltip: true });
      return button;
    });
    var closingLinkForm = false;
    function closeStaleLinkForm() {
      var session = linkUi.formView && linkSessions.get(linkUi.formView);
      var current = selectedImage();
      if (closingLinkForm || !session || !balloon.visibleView ||
          (balloon.visibleView !== linkUi.formView && balloon.visibleView !== linkUi.actionsView) ||
          (current === session.target && editableImage(current) && current.getAttribute('inlineImageId') === session.id)) { return; }
      // Close through native Escape before UI positioning sees a deleted fake
      // selection marker. Do not replace private LinkUI methods or redirect save.
      closingLinkForm = true;
      try {
        editor.keystrokes.press({ keyCode: 27, preventDefault: function () {}, stopPropagation: function () {} });
      }
      finally { closingLinkForm = false; }
    }
    editor.listenTo(editor.model.document, 'change', closeStaleLinkForm, { priority: 'highest' });
    editor.listenTo(editor, 'change:isReadOnly', closeStaleLinkForm, { priority: 'highest' });
    balloon.on('change:visibleView', function () {
      var view = balloon.visibleView;
      var image = selectedImage();
      var linkView = view && (view === linkUi.formView || view === linkUi.actionsView);
      var managedLink = linkView && !!editableImage(image);
      // BalloonPanelView.class is a public native template binding. Extending a
      // rendered form template is forbidden; DOM-only classes are overwritten
      // by native transition updates. This class exists only for our link view.
      var classes = String(balloon.view.class || '').split(/\s+/).filter(function (name) {
        return name && name !== 'papijo-managed-image-link-ui';
      });
      if (managedLink) { classes.push('papijo-managed-image-link-ui'); }
      balloon.view.class = classes.join(' ');
      if (!linkView) { return; }
      if (view !== linkUi.formView) { return; }
      linkSessions.set(view, managedLink ? { target: image, id: image.getAttribute('inlineImageId') } : null);
      if (adaptedLinks.has(view)) { return; }
      adaptedLinks.add(view);
      view.on('submit', function (event) {
        var session = linkSessions.get(view);
        if (!session) { return; }
        var current = selectedImage();
        var href = managed.normalizeLink(view.urlInputView.fieldView.element.value);
        var validTarget = current === session.target && editableImage(current) && current.getAttribute('inlineImageId') === session.id;
        if (!validTarget || !href) {
          event.stop();
          view.urlInputView.errorText = t(!validTarget ? 'imageLinkTargetUnavailable' : 'enterValidImageLink');
          view.urlInputView.fieldView.focus();
        }
      }, { priority: 'high' });
    });
    var imageToolbar = null;
    var companionContent = null;
    function keepImageToolbarAvailable() {
      var view = balloon.visibleView;
      if (view && view.items && Array.from(view.items).some(function (item) { return item.papijoManagedImageButton; })) {
        imageToolbar = view;
      }
      // The native rotator clears its public content collection on each stack
      // transition. Reuse the repository's existing toolbar, never clone it.
      var isLink = view && (view === linkUi.formView || view === linkUi.actionsView);
      var canShare = isLink && editableImage(selectedImage()) && imageToolbar && balloon.hasView(imageToolbar);
      if (companionContent && view !== imageToolbar && !canShare && companionContent.getIndex(imageToolbar) !== -1) {
        companionContent.remove(imageToolbar);
      }
      companionContent = null;
      if (!canShare) { return; }
      var content = Array.from(balloon.view.content).map(function (child) { return child.content; })
        .find(function (collection) { return collection && collection.getIndex(view) !== -1; });
      if (!content) { return; }
      if (content.getIndex(imageToolbar) === -1) { content.add(imageToolbar, 0); }
      companionContent = content;
    }
    editor.listenTo(balloon, 'change:visibleView', keepImageToolbarAvailable, { priority: 'low' });
    editor.listenTo(editor.ui, 'update', keepImageToolbarAvailable, { priority: 'low' });
    editor.once('destroy', function () {
      if (companionContent && balloon.visibleView !== imageToolbar && companionContent.getIndex(imageToolbar) !== -1) {
        companionContent.remove(imageToolbar);
      }
    });
    var adaptedForms = new WeakSet();
    // Observe the public balloon view instead of replacing CKEditor's private
    // dialog. The native form's input and submit event are the narrow 43.3 hook.
    balloon.on('change:visibleView', function () {
      var form = balloon.visibleView;
      if (!form || !form.element || !form.element.classList.contains('ck-text-alternative-form')) { return; }
      form.labeledInput.errorText = null;
      if (adaptedForms.has(form)) { return; }
      adaptedForms.add(form);
      form.on('submit', function (event) {
        var value = form.labeledInput.fieldView.element.value;
        if (!value.trim()) {
          event.stop();
          form.labeledInput.errorText = t('enterImageAltText');
          form.labeledInput.fieldView.focus();
        }
      }, { priority: 'high' });
    });
    var insertion = editor.plugins.get('ImageInsertUI');
    // Constrain only our image balloon. Native static toolbar layout wraps;
    // the main toolbar retains CKEditor's normal automatic grouping.
    function fitImageToolbar() {
      var toolbar = balloon.visibleView;
      var linkView = toolbar && (toolbar === linkUi.formView || toolbar === linkUi.actionsView) &&
        balloon.view.element.classList.contains('papijo-managed-image-link-ui');
      if (!toolbar || (!linkView && (!toolbar.items || !Array.from(toolbar.items).some(function (item) {
        return item.papijoManagedImageButton;
      })))) { return; }
      if (!linkView) {
        toolbar.maxWidth = Math.max(80, Math.min(window.innerWidth - 16,
          editor.ui.view.editable.element.clientWidth)) + 'px';
      }
      var rect = toolbar.element.getBoundingClientRect();
      if (!rect.width || (rect.left >= 8 && rect.right <= window.innerWidth - 8)) { return; }
      var viewImage = editor.editing.view.document.selection.getSelectedElement();
      if (!viewImage) { return; }
      var positions = balloon.view.constructor.generatePositions({ sideOffset: 8 });
      balloon.updatePosition({
        target: editor.editing.view.domConverter.mapViewToDom(viewImage),
        positions: [positions.northArrowSouth, positions.northArrowSouthWest, positions.northArrowSouthEast,
          positions.southArrowNorth, positions.southArrowNorthWest, positions.southArrowNorthEast,
          positions.viewportStickyNorth]
      });
    }
    editor.listenTo(editor.ui, 'update', fitImageToolbar, { priority: 'low' });
    editor.listenTo(balloon, 'change:visibleView', fitImageToolbar, { priority: 'low' });
    var probe = editor.ui.componentFactory.create('undo');
    var ButtonView = probe.constructor;
    probe.destroy();
    H5PEditor.AdvancedTextPapiJoInlineImageResize.install(editor, function (image) {
      return !!editableImage(image);
    }, ButtonView, t);
    H5PEditor.AdvancedTextPapiJoInlineImageParagraph.install(editor, function (image) {
      var store = getStore(widget);
      return !!editableImage(image) && managed.validDefinition(store.getDefinition(image.getAttribute('inlineImageId'))) &&
        typeof image.getAttribute('src') === 'string' && !!image.getAttribute('src');
    }, ButtonView, t);
    H5PEditor.AdvancedTextPapiJoInlineImageCaption.install(editor, function (image) {
      return !!editableImage(image) && editor.model.canEditAt(editor.model.createPositionBefore(image)) &&
        typeof image.getAttribute('src') === 'string' && !!image.getAttribute('src');
    }, ButtonView, t);
    function refreshInsertion() {
      var selection = editor.model.document.selection;
      var selected = selection.getSelectedElement();
      var store = getStore(widget);
      var managedImage = selected && selected.is('element', modelName) && store &&
        store.getDefinition(selected.getAttribute('inlineImageId'));
      insertion.isEnabled = !editor.isReadOnly && !!store && !!H5PEditor.widgets.image &&
        (!!managedImage || (selection.isCollapsed && editor.model.schema.checkChild(selection.getFirstPosition(), modelName)));
      if (managedImage) {
        alternative.clearForceDisabled('papijo-missing-definition');
      }
      else { alternative.forceDisabled('papijo-missing-definition'); }
    }
    insertion.listenTo(editor.model.document, 'change', refreshInsertion);
    insertion.listenTo(editor, 'change:isReadOnly', refreshInsertion);
    refreshInsertion();
    function createInsertButton() {
      var button = new ButtonView(editor.locale);
      button.papijoManagedImageButton = true;
      button.set({ icon: imageIcon, withText: false, tooltip: true });
      button.bind('label').to(insertion, 'isImageSelected', function (selected) {
        return editor.t(selected ? 'Replace image' : 'Insert image');
      });
      button.bind('isEnabled').to(insertion, 'isEnabled');
      button.on('execute', function () {
        openPicker(widget);
      });
      return button;
    }
    insertion.registerIntegration({ name: 'papijoH5p', observable: insertion,
      buttonViewCreator: createInsertButton, menuBarButtonViewCreator: createInsertButton });
  }

  function insert(widget, image, alt, selection) {
    var editor = widget.ckeditor;
    var store = getStore(widget);
    if (!editor || !store || !selection || !selection.isCollapsed || editor.isReadOnly ||
        !editor.model.schema.checkChild(selection.getFirstPosition(), modelName)) {
      return null;
    }
    var definition = store.addDefinition(image, alt);
    if (!definition) { return null; }
    editor.model.change(function (writer) {
      var object = writer.createElement(modelName, { inlineImageId: definition.id,
        src: managed.resolve(definition, H5PEditor.contentId, H5P.getPath), alt: definition.alt });
      editor.model.insertObject(object, selection, null, { setSelection: 'after' });
    });
    return definition;
  }

  function close(widget, restore) {
    var state = widget.inlineImageUi;
    if (!state) { return; }
    state.open = false;
    state.generation++;
    if (state.imageWidget) { state.imageWidget.remove(); }
    state.imageWidget = null;
    state.$image.empty();
    state.$form.prop('hidden', true);
    state.$controls.prop('hidden', true);
    state.$status.text('');
    state.draft = undefined;
    if (restore && widget.ckeditor === state.editor && state.editor && state.editor.state === 'ready' && state.selection &&
        (!state.target || validReplacementTarget(widget, state))) {
      widget.ckeditor.model.change(function (writer) { writer.setSelection(state.selection); });
      widget.ckeditor.editing.view.focus();
    }
    state.selection = null;
    state.target = null;
    state.editor = null;
    state.expectedId = null;
  }

  function validReplacementTarget(widget, state) {
    var editor = widget.ckeditor;
    var target = state.target;
    var store = getStore(widget);
    return !!(editor && editor === state.editor && editor.state !== 'destroyed' && !editor.isReadOnly &&
      target && target.is('element', modelName) && target.root.rootName !== '$graveyard' &&
      editor.model.document.getRoot(target.root.rootName) === target.root && target.root.isAttached() &&
      target.getAttribute('inlineImageId') === state.expectedId && store && store.getDefinition(state.expectedId));
  }

  function replace(widget, state, image, alt) {
    if (!validReplacementTarget(widget, state)) { return null; }
    var definition = getStore(widget).addDefinition(image, alt);
    if (!definition) { return null; }
    // Only this occurrence changes. The post-fixer projects src/alt in the same
    // batch; retained A/B definitions deliberately live outside text history.
    state.editor.model.change(function (writer) {
      writer.setAttribute('inlineImageId', definition.id, state.target);
      writer.setSelection(state.target, 'on');
    });
    return definition;
  }

  // Both native toolbar modes open the same managed H5P picker directly.
  function openPicker(widget) {
    var editor = widget.ckeditor;
    var selection = editor && editor.model.document.selection;
    var target = selection && selection.getSelectedElement();
    var store = getStore(widget);
    var replacing = target && target.is('element', modelName) && store &&
      store.getDefinition(target.getAttribute('inlineImageId'));
    if (!selection || editor.state !== 'ready' || editor.isReadOnly ||
        (!replacing && (!selection.isCollapsed || !editor.model.schema.checkChild(selection.getFirstPosition(), modelName))) ||
        !getStore(widget) || !H5PEditor.widgets.image) {
      return;
    }
    controls(widget);
    var state = widget.inlineImageUi;
    close(widget, false);
    state.selection = editor.model.createSelection(selection);
    state.editor = editor;
    state.target = replacing ? target : null;
    state.expectedId = replacing ? target.getAttribute('inlineImageId') : null;
    state.open = true;
    state.$apply.text(t(replacing ? 'applyReplacementImage' : 'applyInlineImage'));
    state.$alt.val('');
    state.$status.text('');
    state.$form.prop('hidden', false);
    state.$controls.prop('hidden', false);
    var generation = state.generation;
    var imageParent = {
      library: widget.parent && widget.parent.library || 'H5P.AdvancedTextPapiJo',
      ready: function (callback) { callback(); }
    };
    var imageWidget = new H5PEditor.widgets.image(imageParent, {
      name: 'image', type: 'image', label: t(replacing ? 'replaceInlineImage' : 'insertInlineImage'), optional: true,
      disableCopyright: true
    }, undefined, function (_field, value) {
      if (!state.open || generation !== state.generation) { return; }
      if (state.draft && value && value.path !== state.draft.path) { state.$alt.val(''); }
      // The native widget can reuse/mutate its params object for another file.
      // Keep a snapshot so the path comparison above clears the previous ALT.
      state.draft = value ? JSON.parse(JSON.stringify(value)) : value;
    });
    state.imageWidget = imageWidget;
    imageWidget.appendTo(state.$image);
    // Match tooltip images: omit copyright and remove only this instance's
    // Crop/Rotate trigger; the native file selector and preview remain.
    if (imageWidget.$editImage && typeof imageWidget.$editImage.remove === 'function') {
      imageWidget.$editImage.remove();
    }
    // Any remaining native buttons must not submit this local form.
    state.$image.find('button').attr('type', 'button');
  }

  function controls(widget) {
    if (widget.inlineImageUi) { return; }
    var $ = H5PEditor.$;
    var formId = 'papijo-inline-image-form-' + (++uiSequence);
    var state = widget.inlineImageUi = { generation: 0, open: false };
    state.$image = $('<div>');
    state.$alt = $('<input>', { type: 'text', id: formId + '-alt' });
    var $altLabel = $('<label>', {
      'for': formId + '-alt', text: t('imageAltText')
    }).append(state.$alt);
    state.$status = $('<p>', { 'aria-live': 'polite' });
    state.$apply = $('<button>', { type: 'submit', text: t('applyInlineImage') });
    var $cancel = $('<button>', { type: 'button', text: t('cancel') });
    state.$form = $('<form>', {
      id: formId, hidden: true, 'class': 'papijo-inline-image-form'
    }).append(state.$image, $altLabel, state.$status, state.$apply, $cancel);
    state.$controls = $('<div>', { hidden: true, 'class': 'papijo-inline-image-controls' })
      .append(state.$form).appendTo(widget.$item);

    state.$form.on('submit' + namespace, function (event) {
      event.preventDefault();
      if (!state.open) { return; }
      if (state.target && !validReplacementTarget(widget, state)) {
        state.$status.text(t('replacementTargetUnavailable'));
        return;
      }
      if (state.$alt.val().trim() === '') {
        state.$status.text(t('enterImageAltText'));
        return;
      }
      var definition = state.target ? replace(widget, state, state.draft, state.$alt.val()) :
        insert(widget, state.draft, state.$alt.val(), state.selection);
      if (!definition) {
        state.$status.text(t('chooseManagedInlineImage'));
        return;
      }
      // Insertion leaves the caret after the image; replacement selects its target.
      close(widget, false);
      widget.ckeditor.editing.view.focus();
      state.$status.text('');
    });
    $cancel.on('click' + namespace, function () { close(widget, true); });
  }

  function remove(widget) {
    close(widget, false);
    var state = widget.inlineImageUi;
    if (state) {
      state.$controls.find('*').addBack().off(namespace);
      state.$controls.remove();
      widget.inlineImageUi = null;
    }
  }

  H5PEditor.widgets.advancedTextPapiJoInlineImagesStore = Store;
  H5PEditor.AdvancedTextPapiJoInlineImage = {
    Store: Store, getStore: getStore, install: install, insert: insert, controls: controls, remove: remove,
    extendConfig: function (config) {
      // This build exposes ImageInline through Image.requires, not a separate global.
      var image = ClassicEditor.builtinPlugins.find(function (plugin) { return plugin.pluginName === 'Image'; });
      var inline = image && image.requires.find(function (plugin) { return plugin.pluginName === 'ImageInline'; });
      if (!inline) { throw new Error('AdvancedTextPapiJo requires bundled CKEditor ImageInline'); }
      config.plugins.push(inline, 'ImageToolbar', 'ImageStyle');
      config.image = Object.assign({}, config.image, {
        styles: { options: ['inline', 'alignLeft', 'alignRight'] },
        toolbar: ['imageStyle:inline', 'imageStyle:alignLeft', 'imageStyle:alignRight', '|', 'insertImage', 'papijoLinkImage', 'imageTextAlternative', 'papijoResetImageSize'],
        insert: Object.assign({}, config.image && config.image.insert, { integrations: ['papijoH5p'] })
      });
      config.image.toolbar.push('papijoImageParagraphActions', 'papijoImageCaption');
      var items = Array.isArray(config.toolbar) ? config.toolbar : config.toolbar.items;
      // Grouping removes items from the end. Keep image insertion with the
      // common controls, while allowing later controls to overflow normally.
      items.splice(items.indexOf('underline') + 1, 0, 'insertImage');
    },
    hasOccurrence: function (widget) {
      var store = getStore(widget);
      if (!store) { return false; }
      var html = widget.ckeditor ? widget.ckeditor.getData() : widget.$input.html();
      var container = document.createElement('div');
      container.innerHTML = html;
      return Array.from(container.querySelectorAll('span.' + managed.className +
        '[' + managed.attribute + ']')).some(function (marker) {
        return !!store.getDefinition(marker.getAttribute(managed.attribute));
      });
    }
  };
})(H5PEditor, PapijoManagedInlineImages);
