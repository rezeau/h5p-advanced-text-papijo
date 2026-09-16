(function (H5PEditor) {
  'use strict';

  var LIBRARY_NAME = 'H5PEditor.AdvancedTextPapiJoTooltip';
  var CREATE_COMMAND = 'createPapijoTooltip';
  var EDIT_COMMAND = 'editPapijoTooltip';
  var REMOVE_COMMAND = 'removePapijoTooltip';
  var TOOLTIP_CLASS = 'papijo-tooltip';
  var TOOLTIP_ATTRIBUTE = 'data-papijo-tooltip';
  var TOOLTIP_ID_ATTRIBUTE = 'data-papijo-tooltip-id';
  var AUTHORING_EVENT_NAMESPACE = '.advancedTextPapiJoTooltip';
  var authoringUiId = 0;
  var IMAGE_FIELD = {
    name: 'image', type: 'image', label: 'Tooltip image', optional: true,
    disableCopyright: true
  };

  function translate(key) {
    return H5PEditor.t(LIBRARY_NAME, key);
  }

  function createTooltipValue(text, id) {
    var value = { attributes: {}, classes: [TOOLTIP_CLASS] };
    value.attributes[TOOLTIP_ATTRIBUTE] = text;
    if (id) {
      value.attributes[TOOLTIP_ID_ATTRIBUTE] = id;
    }
    return value;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function createTooltipId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'papijo-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 12);
  }

  function getImageStore(widget) {
    return widget.parent && Array.isArray(widget.parent.children) ?
      widget.parent.children.find(function (child) {
        return child instanceof TooltipImagesStore;
      }) : null;
  }

  function hasTooltipImage(image) {
    return image && typeof image.path === 'string' && image.path.trim() !== '';
  }

  function getTooltipImagePath(image) {
    return hasTooltipImage(image) ? image.path.trim() : null;
  }

  function validateTooltipText(value) {
    var text = typeof value === 'string' ? value.trim() : '';
    if (text === '') {
      return { valid: false, message: translate('enterTooltipText') };
    }
    var sanitizer = H5PEditor.AdvancedTextPapiJoTooltipSanitizer;
    if (!sanitizer) {
      return { valid: false, message: translate('unableToCreateTooltip') };
    }
    text = sanitizer.sanitize(text);
    if (sanitizer.textContent(text).trim() === '') {
      return { valid: false, message: translate('enterTooltipText') };
    }
    return { valid: true, text: text };
  }

  function sanitizeTooltipText(value) {
    var sanitizer = H5PEditor.AdvancedTextPapiJoTooltipSanitizer;
    if (!sanitizer) {
      return { valid: false, message: translate('unableToCreateTooltip') };
    }
    var text = sanitizer.sanitize(typeof value === 'string' ? value.trim() : '');
    return {
      meaningful: sanitizer.textContent(text).trim() !== '',
      text: text,
      valid: true
    };
  }

  function localizeSelectionResult(result) {
    if (result.messageKey) {
      result.message = translate(result.messageKey);
      delete result.messageKey;
    }
    return result;
  }

  function detectExistingTooltip(editor, selection) {
    return localizeSelectionResult(
      H5PEditor.AdvancedTextPapiJoTooltipSelection.detectExistingTooltip(
        editor,
        selection
      )
    );
  }

  function validateSelection(editor, selection) {
    return localizeSelectionResult(
      H5PEditor.AdvancedTextPapiJoTooltipSelection.validateSelection(
        editor,
        selection
      )
    );
  }

  function TooltipCommand(editor, action) {
    this.editor = editor;
    this.action = action;
    this.isEnabled = true;
  }

  TooltipCommand.prototype.refresh = function () {
    this.isEnabled = true;
  };
  TooltipCommand.prototype.destroy = function () {};

  TooltipCommand.prototype.execute = function (options) {
    options = options || {};
    var selection = options.selection || this.editor.model.document.selection;
    var target = this.action === 'create' ?
      validateSelection(this.editor, selection) :
      detectExistingTooltip(this.editor, selection);
    if (!target.valid) {
      return target;
    }

    var textValidation;
    var tooltipId = options.tooltipId;
    if (this.action !== 'remove') {
      if (this.action === 'edit' &&
          !Object.prototype.hasOwnProperty.call(options, 'tooltipId')) {
        tooltipId = target.id;
      }
      textValidation = sanitizeTooltipText(options.tooltipText);
      if (!textValidation.valid) {
        return textValidation;
      }
      if (!textValidation.meaningful && !tooltipId) {
        return { valid: false, message: translate('enterTooltipTextOrImage') };
      }
    }

    this.editor.model.change(function (writer) {
      if (this.action === 'remove') {
        writer.removeAttribute(target.attributeName, target.range);
      }
      else if (this.action === 'edit') {
        writer.setAttribute(target.attributeName,
          createTooltipValue(textValidation.text, tooltipId), target.range);
      }
      else {
        target.ranges.forEach(function (range) {
          writer.setAttribute(target.attributeName,
            createTooltipValue(textValidation.text, tooltipId), range);
        });
      }
      writer.setSelection(
        this.action === 'create' ? target.ranges : target.selectionRanges
      );
    }.bind(this));

    return {
      valid: true,
      id: this.action === 'remove' ? (target.id || null) : (tooltipId || null),
      text: textValidation ? textValidation.text : target.text
    };
  };

  function TooltipImagesStore(parent, field, params, setValue) {
    this.parent = parent;
    this.field = field;
    this.params = Array.isArray(params) ? params : [];
    this.setValue = setValue;
  }

  TooltipImagesStore.prototype.appendTo = function ($wrapper) {
    this.$item = H5PEditor.$('<div>', {
      'class': 'papijo-tooltip-image-store', hidden: true
    }).appendTo($wrapper);
  };

  TooltipImagesStore.prototype.getDefinition = function (id) {
    return this.params.find(function (definition) {
      return definition && definition.id === id;
    }) || null;
  };

  TooltipImagesStore.prototype.setDefinition = function (id, image, alt) {
    var definition = this.getDefinition(id);
    if (!definition) {
      definition = { id: id };
      this.params.push(definition);
    }
    definition.image = clone(image);
    definition.alt = alt;
    this.setValue(this.field, this.params);
  };

  TooltipImagesStore.prototype.removeDefinition = function (id) {
    this.params = this.params.filter(function (definition) {
      return !definition || definition.id !== id;
    });
    this.setValue(this.field, this.params.length ? this.params : undefined);
  };

  TooltipImagesStore.prototype.validate = function () {
    var parentParams = this.parent && this.parent.params;
    var semanticParams = parentParams && parentParams.params &&
      typeof parentParams.params === 'object' ? parentParams.params : parentParams;
    var text = semanticParams && semanticParams.text;
    var referenced = Object.create(null);
    if (typeof text === 'string') {
      var container = document.createElement('div');
      container.innerHTML = text;
      Array.from(container.querySelectorAll('span.papijo-tooltip')).forEach(
        function (span) {
          var id = span.getAttribute(TOOLTIP_ID_ATTRIBUTE);
          if (id) {
            referenced[id] = true;
          }
        }
      );
    }
    this.params = this.params.filter(function (definition) {
      return definition && referenced[definition.id];
    });
    this.setValue(this.field, this.params.length ? this.params : undefined);
    return true;
  };

  TooltipImagesStore.prototype.remove = function () {
    if (this.$item) {
      this.$item.remove();
    }
  };

  function PapijoTooltipEditing(editor) {
    editor.commands.add(CREATE_COMMAND, new TooltipCommand(editor, 'create'));
    editor.commands.add(EDIT_COMMAND, new TooltipCommand(editor, 'edit'));
    editor.commands.add(REMOVE_COMMAND, new TooltipCommand(editor, 'remove'));
  }

  function AdvancedTextPapiJoTooltip(parent, field, params, setValue) {
    H5PEditor.Html.call(this, parent, field, params, setValue);
  }

  AdvancedTextPapiJoTooltip.prototype = Object.create(H5PEditor.Html.prototype);
  AdvancedTextPapiJoTooltip.prototype.constructor = AdvancedTextPapiJoTooltip;

  AdvancedTextPapiJoTooltip.prototype.getCKEditorConfig = function () {
    var self = this;
    var config = H5PEditor.Html.prototype.getCKEditorConfig.call(this);
    var tableSort = H5PEditor.AdvancedTextPapiJoTableSort;
    if (config.plugins.indexOf('GeneralHtmlSupport') === -1) {
      config.plugins.push('GeneralHtmlSupport');
    }
    config.htmlSupport = config.htmlSupport || {};
    config.htmlSupport.allow = config.htmlSupport.allow || [];
    config.htmlSupport.allow.push({
      name: 'span',
      classes: [TOOLTIP_CLASS],
      attributes: { 'data-papijo-tooltip': true }
    });
    config.htmlSupport.allow[config.htmlSupport.allow.length - 1]
      .attributes[TOOLTIP_ID_ATTRIBUTE] = true;
    if (tableSort) {
      tableSort.extendConfig(config);
    }
    config.plugins.push(function (editor) {
      PapijoTooltipEditing(editor);
      if (tableSort) {
        tableSort.install(editor);
      }
      self.bindTooltipSelectionUpdates(editor);
    });
    return config;
  };

  AdvancedTextPapiJoTooltip.prototype.appendTo = function ($wrapper) {
    H5PEditor.Html.prototype.appendTo.call(this, $wrapper);
    this.addTooltipAuthoringControls();
  };

  AdvancedTextPapiJoTooltip.prototype.captureModelSelection = function () {
    if (!this.ckeditor) {
      return null;
    }
    this.preservedTooltipSelection = this.ckeditor.model.createSelection(
      this.ckeditor.model.document.selection
    );
    return this.preservedTooltipSelection;
  };

  AdvancedTextPapiJoTooltip.prototype.restoreEditorSelection = function () {
    var self = this;
    if (!self.ckeditor || !self.preservedTooltipSelection) {
      return;
    }
    var ranges = Array.from(self.preservedTooltipSelection.getRanges());
    self.ckeditor.model.change(function (writer) {
      writer.setSelection(ranges);
    });
    self.ckeditor.editing.view.focus();
  };

  AdvancedTextPapiJoTooltip.prototype.unbindTooltipSelectionUpdates = function () {
    if (this.tooltipSelectionEditor && this.tooltipSelectionChangeHandler) {
      this.tooltipSelectionEditor.model.document.selection.off(
        'change:range',
        this.tooltipSelectionChangeHandler
      );
    }
    this.tooltipSelectionEditor = null;
    this.tooltipSelectionChangeHandler = null;
  };

  AdvancedTextPapiJoTooltip.prototype.bindTooltipSelectionUpdates = function (editor) {
    var self = this;
    if (self.tooltipSelectionEditor === editor) {
      self.refreshTooltipActions(editor.model.document.selection);
      return;
    }
    self.unbindTooltipSelectionUpdates();
    self.tooltipSelectionEditor = editor;
    self.tooltipSelectionChangeHandler = function () {
      self.refreshTooltipActions(editor.model.document.selection);
    };
    editor.model.document.selection.on(
      'change:range',
      self.tooltipSelectionChangeHandler
    );
    self.refreshTooltipActions(editor.model.document.selection);
  };

  AdvancedTextPapiJoTooltip.prototype.refreshTooltipActions = function (selection) {
    if (!this.$createTooltipButton || !this.tooltipSelectionEditor) {
      return;
    }
    var detection = detectExistingTooltip(this.tooltipSelectionEditor, selection);
    var hasTooltip = detection.valid && detection.kind === 'tooltip';
    var canCreate = !hasTooltip && validateSelection(
      this.tooltipSelectionEditor,
      selection
    ).valid;
    this.$createTooltipButton.prop('hidden', !canCreate);
    this.$editTooltipButton.prop(
      'hidden',
      !hasTooltip || this.tooltipFormMode === 'edit'
    );
    if (detection.kind === 'invalid') {
      this.$tooltipStatus.text(detection.message);
    }
    else if (!this.tooltipFormMode) {
      this.$tooltipStatus.text('');
    }
  };

  AdvancedTextPapiJoTooltip.prototype.closeTooltipForm = function (restoreSelection) {
    this.$tooltipForm.prop('hidden', true);
    this.$createTooltipButton.attr('aria-expanded', 'false');
    this.$editTooltipButton.attr('aria-expanded', 'false');
    this.$tooltipInput.val('');
    this.$tooltipAltInput.val('');
    this.destroyTooltipImageWidget();
    this.$removeTooltipButton.detach().prop('hidden', true);
    if (restoreSelection) {
      this.restoreEditorSelection();
    }
    this.preservedTooltipSelection = null;
    this.tooltipFormMode = null;
    if (this.tooltipSelectionEditor) {
      this.refreshTooltipActions(this.tooltipSelectionEditor.model.document.selection);
    }
  };

  AdvancedTextPapiJoTooltip.prototype.openTooltipForm = function (mode, text, detection) {
    this.tooltipFormMode = mode;
    this.tooltipFormTooltipId = detection && detection.id || null;
    var store = getImageStore(this);
    var definition = store && this.tooltipFormTooltipId ?
      store.getDefinition(this.tooltipFormTooltipId) : null;
    this.tooltipImageDraft = definition ? clone(definition.image) : undefined;
    this.tooltipAltImagePath = getTooltipImagePath(this.tooltipImageDraft);
    var sanitizer = H5PEditor.AdvancedTextPapiJoTooltipSanitizer;
    this.$tooltipInput.val(sanitizer ?
      sanitizer.toAuthoringText(text || '') : (text || ''));
    this.$tooltipApply.text(translate(
      mode === 'edit' ? 'updateTooltip' : 'applyTooltip'
    ));
    if (mode === 'edit') {
      this.$editTooltipButton.prop('hidden', true);
    }
    this.$removeTooltipButton.detach().prop('hidden', true);
    if (mode === 'edit') {
      this.$removeTooltipButton.appendTo(this.$tooltipForm).prop('hidden', false);
    }
    this.$tooltipStatus.text('');
    this.$tooltipAltInput.val(definition ? definition.alt : '');
    this.syncTooltipAltField();
    this.mountTooltipImageWidget();
    this.$tooltipForm.prop('hidden', false);
    this.$createTooltipButton.attr('aria-expanded', mode === 'create' ? 'true' : 'false');
    this.$editTooltipButton.attr('aria-expanded', mode === 'edit' ? 'true' : 'false');
    this.$tooltipInput.trigger('focus');
  };

  AdvancedTextPapiJoTooltip.prototype.destroyTooltipImageWidget = function (preserveDraft) {
    var widget = this.tooltipImageWidget;
    this.tooltipImageWidget = null;
    this.tooltipImageWidgetGeneration =
      (this.tooltipImageWidgetGeneration || 0) + 1;
    if (widget) {
      widget.remove();
    }
    if (this.$tooltipImageField) {
      this.$tooltipImageField.empty();
    }
    if (!preserveDraft) {
      this.tooltipImageDraft = undefined;
      this.tooltipAltImagePath = null;
      this.tooltipFormTooltipId = null;
      this.syncTooltipAltField();
    }
  };

  AdvancedTextPapiJoTooltip.prototype.syncTooltipAltField = function () {
    if (this.$tooltipAltField) {
      this.$tooltipAltField.prop(
        'hidden',
        !hasTooltipImage(this.tooltipImageDraft)
      );
    }
  };

  AdvancedTextPapiJoTooltip.prototype.mountTooltipImageWidget = function () {
    var self = this;
    if (!H5PEditor.widgets.image) {
      return;
    }
    self.destroyTooltipImageWidget(true);
    var generation = self.tooltipImageWidgetGeneration;
    var imageWidget;
    var imageParent = {
      library: self.parent && self.parent.library || 'H5P.AdvancedTextPapiJo',
      ready: function (callback) { callback(); }
    };
    imageWidget = new H5PEditor.widgets.image(
      imageParent,
      IMAGE_FIELD,
      self.tooltipImageDraft,
      function (_field, value) {
        if (self.tooltipImageWidget !== imageWidget ||
            self.tooltipImageWidgetGeneration !== generation ||
            !self.tooltipFormMode) {
          return;
        }
        var nextImagePath = getTooltipImagePath(value);
        if (nextImagePath && self.tooltipAltImagePath &&
            nextImagePath !== self.tooltipAltImagePath) {
          self.$tooltipAltInput.val('');
        }
        self.tooltipImageDraft = value;
        if (nextImagePath) {
          self.tooltipAltImagePath = nextImagePath;
        }
        self.syncTooltipAltField();
      }
    );
    self.tooltipImageWidget = imageWidget;
    imageWidget.appendTo(self.$tooltipImageField);
    // H5P's image widget has no supported switch for its Crop/Rotate editor.
    // Remove only this tooltip widget instance's trigger; selection and replacement remain.
    if (imageWidget.$editImage &&
        typeof imageWidget.$editImage.remove === 'function') {
      imageWidget.$editImage.remove();
    }
  };

  function createTooltipAuthoringElements(self) {
    var formId = 'papijo-tooltip-form-' + (++authoringUiId);
    var inputId = formId + '-text';
    self.$tooltipStatus = H5PEditor.$('<p>', {
      'class': 'papijo-tooltip-authoring-status', 'aria-live': 'polite'
    });
    self.$tooltipInput = H5PEditor.$('<textarea>', {
      id: inputId, rows: 2, 'class': 'papijo-tooltip-authoring-input'
    });
    var $label = H5PEditor.$('<label>', {
      'class': 'papijo-tooltip-authoring-label', 'for': inputId,
      text: translate('tooltipText')
    }).append(self.$tooltipInput);
    self.$tooltipImageField = H5PEditor.$('<div>', {
      'class': 'papijo-tooltip-authoring-image'
    });
    self.$tooltipAltInput = H5PEditor.$('<input>', {
      type: 'text', 'class': 'papijo-tooltip-authoring-alt'
    });
    self.$tooltipAltField = H5PEditor.$('<label>', {
      'class': 'papijo-tooltip-authoring-label ' +
        'papijo-tooltip-authoring-alt-field',
      hidden: true,
      text: translate('imageAltText')
    }).append(self.$tooltipAltInput);
    self.$tooltipApply = H5PEditor.$('<button>', {
      type: 'submit', 'class': 'papijo-tooltip-authoring-apply',
      text: translate('applyTooltip')
    });
    var $cancel = H5PEditor.$('<button>', {
      type: 'button', 'class': 'papijo-tooltip-authoring-cancel',
      text: translate('cancel')
    });
    self.$tooltipForm = H5PEditor.$('<form>', {
      id: formId, 'class': 'papijo-tooltip-authoring-form', hidden: true
    }).append($label, self.$tooltipImageField, self.$tooltipAltField,
      self.$tooltipApply, $cancel);
    self.$createTooltipButton = H5PEditor.$('<button>', {
      type: 'button', 'class': 'papijo-tooltip-authoring-create',
      text: translate('createTooltip'), 'aria-controls': formId,
      'aria-expanded': 'false'
    });
    self.$editTooltipButton = H5PEditor.$('<button>', {
      type: 'button', 'class': 'papijo-tooltip-authoring-edit',
      text: translate('editTooltip'), hidden: true, 'aria-controls': formId,
      'aria-expanded': 'false'
    });
    self.$removeTooltipButton = H5PEditor.$('<button>', {
      type: 'button', 'class': 'papijo-tooltip-authoring-remove',
      text: translate('removeTooltip'), hidden: true
    });
    self.$tooltipControls = H5PEditor.$('<div>', {
      'class': 'papijo-tooltip-authoring-controls'
    }).append(self.$createTooltipButton, self.$editTooltipButton,
      self.$tooltipForm, self.$tooltipStatus)
      .appendTo(self.$item);

    return $cancel;
  }

  function unbindTooltipAuthoringHandlers(self) {
    [self.$createTooltipButton, self.$editTooltipButton,
      self.$removeTooltipButton, self.$tooltipForm].forEach(function ($element) {
      if ($element) {
        $element.off(AUTHORING_EVENT_NAMESPACE);
      }
    });
    if (self.$tooltipForm) {
      self.$tooltipForm.find('.papijo-tooltip-authoring-cancel')
        .off(AUTHORING_EVENT_NAMESPACE);
    }
  }

  function bindTooltipActionHandlers(self) {
    [self.$createTooltipButton, self.$editTooltipButton,
      self.$removeTooltipButton].forEach(function ($button) {
      $button.on('mousedown' + AUTHORING_EVENT_NAMESPACE, function (event) {
        event.preventDefault();
        self.captureModelSelection();
      });
    });

    self.$createTooltipButton.on('click' + AUTHORING_EVENT_NAMESPACE, function () {
      var selection = self.preservedTooltipSelection || self.captureModelSelection();
      if (!self.ckeditor || !selection) {
        self.$tooltipStatus.text(translate('selectTextFirst'));
        return;
      }
      var validation = validateSelection(self.ckeditor, selection);
      if (!validation.valid) {
        self.$tooltipStatus.text(validation.message);
        self.preservedTooltipSelection = null;
        return;
      }
      self.openTooltipForm('create');
    });

    self.$editTooltipButton.on('click' + AUTHORING_EVENT_NAMESPACE, function () {
      var selection = self.preservedTooltipSelection || self.captureModelSelection();
      var detection = self.ckeditor && selection ?
        detectExistingTooltip(self.ckeditor, selection) : null;
      if (!detection || !detection.valid) {
        self.$tooltipStatus.text(detection && detection.message ?
          detection.message : translate('tooltipSelectionUnavailable'));
        self.preservedTooltipSelection = null;
        return;
      }
      self.openTooltipForm('edit', detection.text, detection);
    });

    self.$removeTooltipButton.on('click' + AUTHORING_EVENT_NAMESPACE, function () {
      var selection = self.preservedTooltipSelection || self.captureModelSelection();
      var result = self.ckeditor && selection ?
        self.ckeditor.execute(REMOVE_COMMAND, { selection: selection }) : null;
      if (!result || !result.valid) {
        self.$tooltipStatus.text(result && result.message ?
          result.message : translate('unableToRemoveTooltip'));
        self.preservedTooltipSelection = null;
        return;
      }
      self.$tooltipStatus.text(translate('tooltipRemoved'));
      self.closeTooltipForm(true);
    });
  }

  function bindTooltipFormHandlers(self, $cancel) {
    self.$tooltipForm.on('submit' + AUTHORING_EVENT_NAMESPACE, function (event) {
      event.preventDefault();
      var isEdit = self.tooltipFormMode === 'edit';
      var image = self.tooltipImageDraft;
      var hasImage = hasTooltipImage(image);
      var alt = self.$tooltipAltInput.val().trim();
      if (hasImage && alt === '') {
        self.$tooltipStatus.text(translate('enterImageAltText'));
        return;
      }
      var store = getImageStore(self);
      if (hasImage && !store) {
        self.$tooltipStatus.text(translate('unableToUpdateTooltip'));
        return;
      }
      var previousId = self.tooltipFormTooltipId;
      var tooltipId = hasImage ? (previousId || createTooltipId()) : null;
      var result = self.ckeditor.execute(isEdit ? EDIT_COMMAND : CREATE_COMMAND, {
        selection: self.preservedTooltipSelection,
        tooltipId: tooltipId,
        tooltipText: self.$tooltipInput.val()
      });
      if (!result || !result.valid) {
        var message = result && result.message ? result.message :
          translate(isEdit ? 'unableToUpdateTooltip' : 'unableToCreateTooltip');
        if (isEdit && !hasImage &&
            message === translate('enterTooltipTextOrImage')) {
          message = translate('enterTooltipTextOrImageOrRemove');
        }
        self.$tooltipStatus.text(message);
        return;
      }
      if (hasImage) {
        store.setDefinition(tooltipId, image, alt);
      }
      self.$tooltipStatus.text(translate(isEdit ? 'tooltipUpdated' : 'tooltipCreated'));
      self.closeTooltipForm(true);
    });

    $cancel.on('click' + AUTHORING_EVENT_NAMESPACE, function () {
      self.$tooltipStatus.text('');
      self.closeTooltipForm(true);
    });
  }

  AdvancedTextPapiJoTooltip.prototype.addTooltipAuthoringControls = function () {
    var self = this;
    if (self.$tooltipControls && self.$item &&
        self.$tooltipControls.parent()[0] === self.$item[0]) {
      return;
    }
    unbindTooltipAuthoringHandlers(self);
    self.preservedTooltipSelection = null;
    self.tooltipFormMode = null;
    var $cancel = createTooltipAuthoringElements(self);
    bindTooltipActionHandlers(self);
    bindTooltipFormHandlers(self, $cancel);
    if (self.ckeditor) {
      self.bindTooltipSelectionUpdates(self.ckeditor);
    }
  };

  AdvancedTextPapiJoTooltip.prototype.remove = function () {
    this.unbindTooltipSelectionUpdates();
    unbindTooltipAuthoringHandlers(this);
    this.destroyTooltipImageWidget();
    H5PEditor.Html.prototype.remove.call(this);
    this.$tooltipStatus = null;
    this.$tooltipInput = null;
    this.$tooltipAltInput = null;
    this.$tooltipAltField = null;
    this.$tooltipImageField = null;
    this.$tooltipApply = null;
    this.$tooltipForm = null;
    this.$createTooltipButton = null;
    this.$editTooltipButton = null;
    this.$removeTooltipButton = null;
    this.$tooltipControls = null;
    this.preservedTooltipSelection = null;
    this.tooltipFormMode = null;
  };

  AdvancedTextPapiJoTooltip.detectExistingTooltip = detectExistingTooltip;
  AdvancedTextPapiJoTooltip.validateSelection = validateSelection;
  AdvancedTextPapiJoTooltip.validateTooltipText = validateTooltipText;
  AdvancedTextPapiJoTooltip.COMMAND_NAME = CREATE_COMMAND;
  AdvancedTextPapiJoTooltip.CREATE_COMMAND = CREATE_COMMAND;
  AdvancedTextPapiJoTooltip.EDIT_COMMAND = EDIT_COMMAND;
  AdvancedTextPapiJoTooltip.REMOVE_COMMAND = REMOVE_COMMAND;
  AdvancedTextPapiJoTooltip.TooltipImagesStore = TooltipImagesStore;
  H5PEditor.AdvancedTextPapiJoTooltip = AdvancedTextPapiJoTooltip;
  H5PEditor.widgets.advancedTextPapiJoTooltip = AdvancedTextPapiJoTooltip;
  H5PEditor.widgets.advancedTextPapiJoTooltipImagesStore = TooltipImagesStore;
})(H5PEditor);
