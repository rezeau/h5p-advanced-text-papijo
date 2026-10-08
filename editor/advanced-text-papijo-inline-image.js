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
    editor.once('ready', function () {
      if (widget.inlineImageUi) { widget.inlineImageUi.$button.prop('hidden', true); }
    });
    editor.once('destroy', function () {
      close(widget, false);
      if (widget.inlineImageUi) { widget.inlineImageUi.$button.prop('hidden', false); }
    });
    editor.model.schema.extend(modelName, { allowAttributes: ['inlineImageId'] });
    editor.model.schema.addAttributeCheck(function (context, attribute) {
      if (context.endsWith(modelName) && attribute === 'linkHref') { return false; }
    });
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
        return managed.validId(id) ? api.writer.createElement(modelName, projection(id)) : null;
      },
      converterPriority: 'high'
    });
    editor.conversion.for('dataDowncast').elementToElement({
      model: { name: modelName, attributes: ['inlineImageId'] },
      view: function (model, api) {
        var attributes = { 'class': managed.className };
        attributes[managed.attribute] = model.getAttribute('inlineImageId');
        return api.writer.createEmptyElement('span', attributes);
      },
      converterPriority: 'high'
    });
    editor.conversion.for('dataDowncast').add(function (dispatcher) {
      dispatcher.on('attribute', function (event, data, api) {
        if (data.item.is('element', modelName) && data.attributeKey !== 'inlineImageId') {
          // Native src/alt/size handlers expect an img. Consume projections before
          // those handlers run: the data view deliberately contains only a span.
          api.consumable.consume(data.item, event.name);
          event.stop();
        }
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
          var attributes = projection(id);
          ['src', 'alt'].forEach(function (key) {
            if (item.getAttribute(key) === attributes[key]) { return; }
            if (attributes[key] === undefined) { writer.removeAttribute(key, item); }
            else { writer.setAttribute(key, attributes[key], item); }
            changed = true;
          });
          ['srcset', 'sizes', 'sources', 'width', 'height', 'resizedWidth', 'imageStyle', 'linkHref'].forEach(function (key) {
            if (item.hasAttribute(key)) { writer.removeAttribute(key, item); changed = true; }
          });
        });
      });
      return changed;
    });
    ['insertImage', 'replaceImageSource'].forEach(function (name) {
      editor.commands.get(name).forceDisabled('papijo-managed-images');
    });
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
    var probe = editor.ui.componentFactory.create('undo');
    var ButtonView = probe.constructor;
    probe.destroy();
    function refreshInsertion() {
      var selection = editor.model.document.selection;
      insertion.isEnabled = !editor.isReadOnly && selection.isCollapsed && !!getStore(widget) &&
        !!H5PEditor.widgets.image && editor.model.schema.checkChild(selection.getFirstPosition(), modelName);
      var selected = selection.getSelectedElement();
      var store = getStore(widget);
      if (selected && store && store.getDefinition(selected.getAttribute('inlineImageId'))) {
        alternative.clearForceDisabled('papijo-missing-definition');
      }
      else { alternative.forceDisabled('papijo-missing-definition'); }
    }
    insertion.listenTo(editor.model.document, 'change', refreshInsertion);
    insertion.listenTo(editor, 'change:isReadOnly', refreshInsertion);
    refreshInsertion();
    function createInsertButton() {
      var button = new ButtonView(editor.locale);
      button.set({ label: editor.t('Insert image'), icon: imageIcon, withText: false, tooltip: true });
      button.bind('isEnabled').to(insertion, 'isEnabled');
      button.on('execute', function () {
        controls(widget);
        widget.inlineImageUi.$button.trigger('click');
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
    state.$button.attr('aria-expanded', 'false');
    state.draft = undefined;
    if (restore && widget.ckeditor && state.selection) {
      widget.ckeditor.model.change(function (writer) { writer.setSelection(state.selection); });
      widget.ckeditor.editing.view.focus();
    }
    state.selection = null;
  }

  function controls(widget) {
    if (widget.inlineImageUi) { return; }
    var $ = H5PEditor.$;
    var formId = 'papijo-inline-image-form-' + (++uiSequence);
    var state = widget.inlineImageUi = { generation: 0, open: false };
    state.$button = $('<button>', {
      type: 'button', text: t('insertInlineImage'), 'class': 'papijo-inline-image-insert',
      'aria-controls': formId, 'aria-expanded': 'false'
    });
    state.$button.prop('hidden', !!widget.ckeditor);
    state.$image = $('<div>');
    state.$alt = $('<input>', { type: 'text', id: formId + '-alt' });
    var $altLabel = $('<label>', {
      'for': formId + '-alt', text: t('imageAltText')
    }).append(state.$alt);
    state.$status = $('<p>', { 'aria-live': 'polite' });
    var $apply = $('<button>', { type: 'submit', text: t('applyInlineImage') });
    var $cancel = $('<button>', { type: 'button', text: t('cancel') });
    state.$form = $('<form>', {
      id: formId, hidden: true, 'class': 'papijo-inline-image-form'
    }).append(state.$image, $altLabel, $apply, $cancel);
    state.$controls = $('<div>', { 'class': 'papijo-inline-image-controls' })
      .append(state.$button, state.$form, state.$status).appendTo(widget.$item);

    state.$button.on('mousedown' + namespace, function (event) { event.preventDefault(); });
    state.$button.on('click' + namespace, function () {
      var editor = widget.ckeditor;
      var selection = editor && editor.model.document.selection;
      if (!selection || !selection.isCollapsed || editor.isReadOnly ||
          !editor.model.schema.checkChild(selection.getFirstPosition(), modelName) ||
          !getStore(widget) || !H5PEditor.widgets.image) {
        state.$status.text(t('placeInlineImageCursor'));
        return;
      }
      close(widget, false);
      state.selection = editor.model.createSelection(selection);
      state.open = true;
      state.$alt.val('');
      state.$status.text('');
      state.$form.prop('hidden', false);
      state.$button.attr('aria-expanded', 'true');
      var generation = state.generation;
      var imageParent = {
        library: widget.parent && widget.parent.library || 'H5P.AdvancedTextPapiJo',
        ready: function (callback) { callback(); }
      };
      var imageWidget = new H5PEditor.widgets.image(imageParent, {
        name: 'image', type: 'image', label: t('insertInlineImage'), optional: true
      }, undefined, function (_field, value) {
        if (!state.open || generation !== state.generation) { return; }
        if (state.draft && value && value.path !== state.draft.path) { state.$alt.val(''); }
        state.draft = value;
      });
      state.imageWidget = imageWidget;
      imageWidget.appendTo(state.$image);
      // Native image/copyright buttons omit type and sit inside this local form.
      state.$image.find('button').attr('type', 'button');
    });
    state.$form.on('submit' + namespace, function (event) {
      event.preventDefault();
      if (!state.open) { return; }
      if (state.$alt.val().trim() === '') {
        state.$status.text(t('enterImageAltText'));
        return;
      }
      var definition = insert(widget, state.draft, state.$alt.val(), state.selection);
      if (!definition) {
        state.$status.text(t('chooseManagedInlineImage'));
        return;
      }
      // insertObject already places the caret after the new image.
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
      config.plugins.push(inline, 'ImageToolbar');
      config.image = { toolbar: ['imageTextAlternative'], insert: { integrations: ['papijoH5p'] } };
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
