(function (H5PEditor) {
  'use strict';

  var LIBRARY_NAME = 'H5PEditor.AdvancedTextPapiJoTooltip';
  var CREATE_COMMAND = 'createPapijoTooltip';
  var EDIT_COMMAND = 'editPapijoTooltip';
  var REMOVE_COMMAND = 'removePapijoTooltip';
  var TOOLTIP_CLASS = 'papijo-tooltip';
  var TOOLTIP_ATTRIBUTE = 'data-papijo-tooltip';
  var AUTHORING_EVENT_NAMESPACE = '.advancedTextPapiJoTooltip';
  var authoringUiId = 0;

  function translate(key) {
    return H5PEditor.t(LIBRARY_NAME, key);
  }

  function createTooltipValue(text) {
    var value = { attributes: {}, classes: [TOOLTIP_CLASS] };
    value.attributes[TOOLTIP_ATTRIBUTE] = text;
    return value;
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
    if (this.action !== 'remove') {
      textValidation = validateTooltipText(options.tooltipText);
      if (!textValidation.valid) {
        return textValidation;
      }
    }

    this.editor.model.change(function (writer) {
      if (this.action === 'remove') {
        writer.removeAttribute(target.attributeName, target.range);
      }
      else if (this.action === 'edit') {
        writer.setAttribute(target.attributeName,
          createTooltipValue(textValidation.text), target.range);
      }
      else {
        target.ranges.forEach(function (range) {
          writer.setAttribute(target.attributeName,
            createTooltipValue(textValidation.text), range);
        });
      }
      writer.setSelection(
        this.action === 'create' ? target.ranges : target.selectionRanges
      );
    }.bind(this));

    return {
      valid: true,
      text: textValidation ? textValidation.text : target.text
    };
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
    this.$editTooltipButton.prop('hidden', !hasTooltip);
    this.$removeTooltipButton.prop('hidden', !hasTooltip);
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
    if (restoreSelection) {
      this.restoreEditorSelection();
    }
    this.preservedTooltipSelection = null;
    this.tooltipFormMode = null;
  };

  AdvancedTextPapiJoTooltip.prototype.openTooltipForm = function (mode, text) {
    this.tooltipFormMode = mode;
    var sanitizer = H5PEditor.AdvancedTextPapiJoTooltipSanitizer;
    this.$tooltipInput.val(sanitizer ?
      sanitizer.toAuthoringText(text || '') : (text || ''));
    this.$tooltipApply.text(translate(
      mode === 'edit' ? 'updateTooltip' : 'applyTooltip'
    ));
    this.$tooltipStatus.text('');
    this.$tooltipForm.prop('hidden', false);
    this.$createTooltipButton.attr('aria-expanded', mode === 'create' ? 'true' : 'false');
    this.$editTooltipButton.attr('aria-expanded', mode === 'edit' ? 'true' : 'false');
    this.$tooltipInput.trigger('focus');
  };

  function createTooltipAuthoringElements(self) {
    var formId = 'papijo-tooltip-form-' + (++authoringUiId);
    self.$tooltipStatus = H5PEditor.$('<p>', {
      'class': 'papijo-tooltip-authoring-status', 'aria-live': 'polite'
    });
    self.$tooltipInput = H5PEditor.$('<input>', {
      type: 'text', 'class': 'papijo-tooltip-authoring-input'
    });
    var $label = H5PEditor.$('<label>', {
      'class': 'papijo-tooltip-authoring-label', text: translate('tooltipText')
    }).append(self.$tooltipInput);
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
    }).append($label, self.$tooltipApply, $cancel);
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
      self.$removeTooltipButton, self.$tooltipForm, self.$tooltipStatus)
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
      self.openTooltipForm('edit', detection.text);
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
      self.restoreEditorSelection();
      self.preservedTooltipSelection = null;
      self.refreshTooltipActions(self.ckeditor.model.document.selection);
    });
  }

  function bindTooltipFormHandlers(self, $cancel) {
    self.$tooltipForm.on('submit' + AUTHORING_EVENT_NAMESPACE, function (event) {
      event.preventDefault();
      var isEdit = self.tooltipFormMode === 'edit';
      var result = self.ckeditor.execute(isEdit ? EDIT_COMMAND : CREATE_COMMAND, {
        selection: self.preservedTooltipSelection,
        tooltipText: self.$tooltipInput.val()
      });
      if (!result || !result.valid) {
        self.$tooltipStatus.text(result && result.message ? result.message :
          translate(isEdit ? 'unableToUpdateTooltip' : 'unableToCreateTooltip'));
        return;
      }
      self.$tooltipStatus.text(translate(isEdit ? 'tooltipUpdated' : 'tooltipCreated'));
      self.closeTooltipForm(true);
      self.refreshTooltipActions(self.ckeditor.model.document.selection);
    });

    $cancel.on('click' + AUTHORING_EVENT_NAMESPACE, function () {
      self.$tooltipStatus.text('');
      self.closeTooltipForm(true);
      self.refreshTooltipActions(self.ckeditor.model.document.selection);
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
    H5PEditor.Html.prototype.remove.call(this);
    this.$tooltipStatus = null;
    this.$tooltipInput = null;
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
  H5PEditor.AdvancedTextPapiJoTooltip = AdvancedTextPapiJoTooltip;
  H5PEditor.widgets.advancedTextPapiJoTooltip = AdvancedTextPapiJoTooltip;
})(H5PEditor);
