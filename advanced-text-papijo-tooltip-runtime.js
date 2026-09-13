(function (H5P) {
  'use strict';

  var nextBubbleId = 0;
  var initializedTriggers = new WeakMap();
  var INTERACTIVE_SELECTOR = 'a[href],button,input,select,textarea,[tabindex]';

  function isManagedImagePath(path) {
    return typeof path === 'string' && path.trim() !== '' &&
      !/^[a-z][a-z0-9+.-]*:/i.test(path) &&
      !/^[/\\]/.test(path) && path.indexOf('\\') === -1;
  }

  function indexTooltipImages(definitions) {
    var indexed = Object.create(null);
    if (!Array.isArray(definitions)) {
      return indexed;
    }
    definitions.forEach(function (definition) {
      if (!definition || typeof definition.id !== 'string' ||
          definition.id.trim() === '' || !definition.image ||
          !isManagedImagePath(definition.image.path) ||
          typeof definition.alt !== 'string' || definition.alt.trim() === '') {
        return;
      }
      indexed[definition.id] = {
        alt: definition.alt.trim(),
        path: definition.image.path
      };
    });
    return indexed;
  }

  function restoreAttribute(element, name, value) {
    if (value === null) {
      element.removeAttribute(name);
    }
    else {
      element.setAttribute(name, value);
    }
  }

  function setClosedControlState(control) {
    control.removeAttribute('aria-controls');
    control.removeAttribute('aria-describedby');
    control.setAttribute('aria-expanded', 'false');
  }

  function getAccessibleAncestorDocuments(startWindow, fallbackDocument) {
    if (!startWindow) {
      return fallbackDocument ? [fallbackDocument] : [];
    }

    var documents = [];
    var currentWindow = startWindow;
    while (currentWindow) {
      try {
        var currentDocument = currentWindow.document;
        if (!currentDocument || documents.indexOf(currentDocument) !== -1) {
          break;
        }
        documents.push(currentDocument);
        if (!currentWindow.parent || currentWindow.parent === currentWindow) {
          break;
        }
        currentWindow = currentWindow.parent;
      }
      catch (error) {
        // Keep documents reached before an inaccessible cross-origin boundary.
        break;
      }
    }
    return documents;
  }

  /**
   * Enhances tooltip spans within one AdvancedText instance.
   *
   * @param {HTMLElement} root AdvancedText instance root.
   * @param {number} contentId H5P content id used to resolve managed files.
   * @param {Object[]} tooltipImages Managed tooltip image definitions.
   */
  function AdvancedTextPapiJoTooltipRuntime(
    root,
    contentId,
    tooltipImages,
    onResize
  ) {
    this.root = root;
    this.contentId = contentId;
    this.tooltipImages = indexTooltipImages(tooltipImages);
    this.states = [];
    this.controlRecords = [];
    this.controlRecordMap = new WeakMap();
    this.activeState = null;
    this.onResize = typeof onResize === 'function' ? onResize : function () {};
    this.reservedSpace = 0;
    this.reservedSpaceElement = null;
    this.boundOutsidePointer = this.handleOutsidePointer.bind(this);
    this.outsidePointerAttached = false;
    this.outsidePointerDocuments = [];
    this.connectionObserver = null;
  }

  AdvancedTextPapiJoTooltipRuntime.prototype.addOutsidePointerListener = function () {
    if (this.outsidePointerAttached) {
      return;
    }
    var ownerDocument = this.root.ownerDocument || document;
    var startWindow = ownerDocument.defaultView ||
      (typeof window === 'undefined' ? null : window);
    this.outsidePointerDocuments = getAccessibleAncestorDocuments(
      startWindow,
      ownerDocument
    );
    var self = this;
    this.outsidePointerDocuments.forEach(function (pointerDocument) {
      pointerDocument.addEventListener(
        'pointerdown',
        self.boundOutsidePointer,
        true
      );
    });
    this.outsidePointerAttached = this.outsidePointerDocuments.length > 0;
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.removeOutsidePointerListener = function () {
    var self = this;
    this.outsidePointerDocuments.forEach(function (pointerDocument) {
      pointerDocument.removeEventListener(
        'pointerdown',
        self.boundOutsidePointer,
        true
      );
    });
    this.outsidePointerDocuments = [];
    this.outsidePointerAttached = false;
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.setReservedSpace = function (height) {
    height = Math.max(0, Math.ceil(Number(height) || 0));
    var changed = height !== this.reservedSpace;
    if (!this.reservedSpaceElement) {
      this.reservedSpaceElement = this.root.ownerDocument.createElement('div');
      this.reservedSpaceElement.className =
        'papijo-runtime-tooltip-reserved-space';
      this.reservedSpaceElement.setAttribute('aria-hidden', 'true');
      // A zero-metric text node keeps this block from collapsing through,
      // so the final content margin has the same topology at every height.
      this.reservedSpaceElement.textContent = '\u200b';
      this.reservedSpaceElement.style.fontSize = '0';
      this.reservedSpaceElement.style.lineHeight = '0';
      this.reservedSpaceElement.style.pointerEvents = 'none';
      this.reservedSpaceElement.style.width = '100%';
      this.reservedSpaceElement.style.height = '0px';
      this.root.appendChild(this.reservedSpaceElement);
      changed = true;
    }
    if (height !== this.reservedSpace) {
      this.reservedSpace = height;
      this.reservedSpaceElement.style.height = height + 'px';
    }
    if (changed) {
      this.onResize();
    }
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.releaseReservedSpace = function () {
    if (!this.reservedSpaceElement) {
      this.reservedSpace = 0;
      return;
    }
    this.reservedSpace = 0;
    this.reservedSpaceElement.remove();
    this.reservedSpaceElement = null;
    this.onResize();
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.observeRootConnection = function () {
    var self = this;
    if (typeof MutationObserver !== 'function' || !this.root.isConnected) {
      return;
    }
    if (!this.connectionObserver) {
      this.connectionObserver = new MutationObserver(function () {
        if (!self.root.isConnected) {
          self.destroy();
          return;
        }
        self.observeRootConnection();
      });
    }

    this.connectionObserver.disconnect();
    var ancestor = this.root.parentNode;
    while (ancestor) {
      this.connectionObserver.observe(ancestor, { childList: true });
      ancestor = ancestor.parentNode;
    }
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.getControlRecord = function (
    control,
    isPlainTrigger
  ) {
    var self = this;
    var record = this.controlRecordMap.get(control);
    if (record) {
      return record;
    }

    record = {
      control: control,
      isPlainTrigger: isPlainTrigger,
      original: {
        ariaControls: control.getAttribute('aria-controls'),
        ariaDescribedby: control.getAttribute('aria-describedby'),
        ariaExpanded: control.getAttribute('aria-expanded'),
        ariaHaspopup: control.getAttribute('aria-haspopup'),
        role: control.getAttribute('role'),
        tabindex: control.getAttribute('tabindex')
      },
      states: []
    };

    record.clickHandler = function (event) {
      var state = record.states[0];
      var interactive = event.target.closest ?
        event.target.closest(INTERACTIVE_SELECTOR) : null;
      if (interactive && interactive !== state.trigger &&
          state.trigger.contains(interactive)) {
        return;
      }
      event.preventDefault();
      self.toggle(state);
    };
    record.focusHandler = function () {
      self.open(record.states[0]);
    };
    record.pointerEnterHandler = function () {
      if (!self.activeState || self.activeState.controlRecord !== record) {
        self.open(record.states[0]);
      }
    };
    record.pointerOverHandler = function (event) {
      var target = event.target.closest ?
        event.target.closest('span.papijo-tooltip') : null;
      var state = record.states.find(function (candidate) {
        return candidate.trigger === target;
      });
      if (state) {
        self.open(state);
      }
    };
    record.keyHandler = function (event) {
      if (event.key === 'Escape') {
        if (self.activeState && self.activeState.controlRecord === record) {
          self.close(self.activeState);
        }
        return;
      }
      if (!record.isPlainTrigger || event.target !== control) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        self.toggle(record.states[0]);
      }
    };

    if (isPlainTrigger && !control.hasAttribute('role')) {
      control.setAttribute('role', 'button');
    }
    if (isPlainTrigger && !control.hasAttribute('tabindex')) {
      control.setAttribute('tabindex', '0');
    }
    control.setAttribute('aria-haspopup', 'true');
    setClosedControlState(control);
    control.addEventListener('keydown', record.keyHandler);
    if (isPlainTrigger) {
      control.addEventListener('click', record.clickHandler);
    }
    else {
      control.addEventListener('focus', record.focusHandler);
      control.addEventListener('pointerenter', record.pointerEnterHandler);
      control.addEventListener('pointerover', record.pointerOverHandler);
    }

    this.controlRecordMap.set(control, record);
    this.controlRecords.push(record);
    return record;
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.initialize = function () {
    var self = this;
    this.root.querySelectorAll('span.papijo-tooltip').forEach(function (trigger) {
      if (initializedTriggers.has(trigger)) {
        return;
      }

      var tooltipText = trigger.getAttribute('data-papijo-tooltip');
      tooltipText = typeof tooltipText === 'string' ? tooltipText : '';
      var sanitizer = H5P.AdvancedTextPapiJoTooltipSanitizer;
      if (!sanitizer) {
        return;
      }
      tooltipText = sanitizer.sanitize(tooltipText);
      var tooltipId = trigger.getAttribute('data-papijo-tooltip-id');
      var image = typeof tooltipId === 'string' ?
        self.tooltipImages[tooltipId] : null;
      if (sanitizer.textContent(tooltipText).trim() === '' && !image) {
        return;
      }

      var interactiveAncestor = trigger.parentElement &&
        trigger.parentElement.closest(INTERACTIVE_SELECTOR);
      var control = interactiveAncestor && interactiveAncestor !== self.root &&
        self.root.contains(interactiveAncestor) ? interactiveAncestor : trigger;
      var controlRecord = self.getControlRecord(control, control === trigger);
      var state = {
        bubble: null,
        bubbleId: 'papijo-runtime-tooltip-' + (++nextBubbleId),
        control: control,
        controlRecord: controlRecord,
        original: controlRecord.original,
        image: image,
        text: tooltipText,
        trigger: trigger
      };

      trigger.classList.add('papijo-runtime-tooltip-trigger');
      controlRecord.states.push(state);

      initializedTriggers.set(trigger, state);
      self.states.push(state);
    });

    if (this.states.length > 0) {
      this.root.classList.add('papijo-runtime-tooltips');
      this.observeRootConnection();
    }
    return this.states.length;
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.open = function (state) {
    if (!state || state.bubble) {
      return;
    }
    if (!this.root.isConnected) {
      this.destroy();
      return;
    }
    if (this.activeState && this.activeState !== state) {
      this.close(this.activeState);
    }

    this.setReservedSpace(0);

    var image = null;
    if (state.image && typeof H5P.getPath === 'function') {
      image = {
        alt: state.image.alt,
        src: H5P.getPath(state.image.path, this.contentId)
      };
    }
    var self = this;
    state.bubble = new H5P.AdvancedTextPapiJoSpeechBubble(
      this.root,
      state.trigger,
      state.text,
      state.bubbleId,
      image,
      {
        getReservedSpace: function () {
          return self.reservedSpace;
        },
        setReservedSpace: function (height) {
          self.setReservedSpace(height);
        }
      }
    );
    state.control.setAttribute('aria-expanded', 'true');
    state.control.setAttribute('aria-controls', state.bubbleId);
    state.control.setAttribute('aria-describedby', state.bubbleId);
    this.activeState = state;
    this.addOutsidePointerListener();
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.close = function (state) {
    state = state || this.activeState;
    if (!state || !state.bubble) {
      return;
    }
    state.bubble.remove();
    state.bubble = null;
    this.releaseReservedSpace();
    setClosedControlState(state.control);
    if (this.activeState === state) {
      this.activeState = null;
      this.removeOutsidePointerListener();
    }
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.toggle = function (state) {
    if (state.bubble) {
      this.close(state);
    }
    else {
      this.open(state);
    }
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.handleOutsidePointer = function (event) {
    if (!this.activeState) {
      return;
    }
    if (this.activeState.trigger.contains(event.target) ||
        this.activeState.bubble.contains(event.target)) {
      return;
    }
    this.close(this.activeState);
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.reposition = function () {
    if (this.activeState && this.activeState.bubble) {
      this.activeState.bubble.position();
    }
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.destroy = function () {
    if (this.connectionObserver) {
      this.connectionObserver.disconnect();
      this.connectionObserver = null;
    }
    this.close();
    this.releaseReservedSpace();
    this.states.forEach(function (state) {
      state.trigger.classList.remove('papijo-runtime-tooltip-trigger');
      initializedTriggers.delete(state.trigger);
    });
    this.controlRecords.forEach(function (record) {
      var control = record.control;
      control.removeEventListener('click', record.clickHandler);
      control.removeEventListener('keydown', record.keyHandler);
      control.removeEventListener('focus', record.focusHandler);
      control.removeEventListener('pointerenter', record.pointerEnterHandler);
      control.removeEventListener('pointerover', record.pointerOverHandler);
      restoreAttribute(
        control,
        'aria-describedby',
        record.original.ariaDescribedby
      );
      restoreAttribute(control, 'role', record.original.role);
      restoreAttribute(control, 'tabindex', record.original.tabindex);
      restoreAttribute(control, 'aria-haspopup', record.original.ariaHaspopup);
      restoreAttribute(control, 'aria-controls', record.original.ariaControls);
      restoreAttribute(control, 'aria-expanded', record.original.ariaExpanded);
    });
    this.states = [];
    this.controlRecords = [];
    this.controlRecordMap = new WeakMap();
    this.root.classList.remove('papijo-runtime-tooltips');
    this.removeOutsidePointerListener();
  };

  H5P.AdvancedTextPapiJoTooltipRuntime = AdvancedTextPapiJoTooltipRuntime;
  H5P.AdvancedTextPapiJoTooltipRuntime.getAccessibleAncestorDocuments =
    getAccessibleAncestorDocuments;
})(H5P);
