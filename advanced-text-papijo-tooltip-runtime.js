(function (H5P) {
  'use strict';

  var nextBubbleId = 0;
  var initializedTriggers = new WeakMap();
  var INTERACTIVE_SELECTOR = 'a[href],button,input,select,textarea,[tabindex]';

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

  /**
   * Enhances tooltip spans within one AdvancedText instance.
   *
   * @param {HTMLElement} root AdvancedText instance root.
   */
  function AdvancedTextPapiJoTooltipRuntime(root) {
    this.root = root;
    this.states = [];
    this.controlRecords = [];
    this.controlRecordMap = new WeakMap();
    this.activeState = null;
    this.boundOutsidePointer = this.handleOutsidePointer.bind(this);
    this.outsidePointerAttached = false;
    this.connectionObserver = null;
  }

  AdvancedTextPapiJoTooltipRuntime.prototype.addOutsidePointerListener = function () {
    if (!this.outsidePointerAttached) {
      document.addEventListener('pointerdown', this.boundOutsidePointer);
      this.outsidePointerAttached = true;
    }
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.removeOutsidePointerListener = function () {
    if (this.outsidePointerAttached) {
      document.removeEventListener('pointerdown', this.boundOutsidePointer);
      this.outsidePointerAttached = false;
    }
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
      if (typeof tooltipText !== 'string' || tooltipText.trim() === '') {
        return;
      }
      var sanitizer = H5P.AdvancedTextPapiJoTooltipSanitizer;
      if (!sanitizer) {
        return;
      }
      tooltipText = sanitizer.sanitize(tooltipText);
      if (sanitizer.textContent(tooltipText).trim() === '') {
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

    state.bubble = new H5P.AdvancedTextPapiJoSpeechBubble(
      this.root,
      state.trigger,
      state.text,
      state.bubbleId
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
})(H5P);
