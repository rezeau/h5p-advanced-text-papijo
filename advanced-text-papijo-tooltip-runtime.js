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

  /**
   * Enhances tooltip spans within one AdvancedText instance.
   *
   * @param {HTMLElement} root AdvancedText instance root.
   */
  function AdvancedTextPapiJoTooltipRuntime(root) {
    this.root = root;
    this.states = [];
    this.activeState = null;
    this.boundOutsidePointer = this.handleOutsidePointer.bind(this);
  }

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
      var state = {
        bubble: null,
        bubbleId: 'papijo-runtime-tooltip-' + (++nextBubbleId),
        control: control,
        original: {
          ariaControls: control.getAttribute('aria-controls'),
          ariaDescribedby: control.getAttribute('aria-describedby'),
          ariaExpanded: control.getAttribute('aria-expanded'),
          ariaHaspopup: control.getAttribute('aria-haspopup'),
          role: control.getAttribute('role'),
          tabindex: control.getAttribute('tabindex')
        },
        text: tooltipText,
        trigger: trigger
      };

      state.clickHandler = function (event) {
        var interactive = event.target.closest ?
          event.target.closest(INTERACTIVE_SELECTOR) : null;
        if (interactive && interactive !== trigger && trigger.contains(interactive)) {
          return;
        }
        event.preventDefault();
        self.toggle(state);
      };
      state.focusHandler = function () {
        self.open(state);
      };
      state.pointerEnterHandler = function () {
        self.open(state);
      };
      state.keyHandler = function (event) {
        if (event.key === 'Escape') {
          self.close(state);
          return;
        }
        if (event.target !== control || control !== trigger) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          self.toggle(state);
        }
      };

      if (control === trigger && !control.hasAttribute('role')) {
        control.setAttribute('role', 'button');
      }
      if (control === trigger && !control.hasAttribute('tabindex')) {
        control.setAttribute('tabindex', '0');
      }
      control.setAttribute('aria-haspopup', 'true');
      control.setAttribute('aria-controls', state.bubbleId);
      control.setAttribute('aria-expanded', 'false');
      trigger.classList.add('papijo-runtime-tooltip-trigger');
      control.addEventListener('keydown', state.keyHandler);
      if (control === trigger) {
        control.addEventListener('click', state.clickHandler);
      }
      else {
        control.addEventListener('focus', state.focusHandler);
        control.addEventListener('pointerenter', state.pointerEnterHandler);
      }

      initializedTriggers.set(trigger, state);
      self.states.push(state);
    });

    if (this.states.length > 0) {
      this.root.classList.add('papijo-runtime-tooltips');
    }
    return this.states.length;
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.open = function (state) {
    if (!state || state.bubble) {
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
    state.control.setAttribute('aria-describedby', state.bubbleId);
    this.activeState = state;
    document.addEventListener('pointerdown', this.boundOutsidePointer);
  };

  AdvancedTextPapiJoTooltipRuntime.prototype.close = function (state) {
    state = state || this.activeState;
    if (!state || !state.bubble) {
      return;
    }
    state.bubble.remove();
    state.bubble = null;
    state.control.setAttribute('aria-expanded', 'false');
    restoreAttribute(
      state.control,
      'aria-describedby',
      state.original.ariaDescribedby
    );
    if (this.activeState === state) {
      this.activeState = null;
      document.removeEventListener('pointerdown', this.boundOutsidePointer);
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
    var self = this;
    this.close();
    this.states.forEach(function (state) {
      state.control.removeEventListener('click', state.clickHandler);
      state.control.removeEventListener('keydown', state.keyHandler);
      state.control.removeEventListener('focus', state.focusHandler);
      state.control.removeEventListener('pointerenter', state.pointerEnterHandler);
      state.trigger.classList.remove('papijo-runtime-tooltip-trigger');
      restoreAttribute(
        state.control,
        'aria-describedby',
        state.original.ariaDescribedby
      );
      restoreAttribute(state.control, 'role', state.original.role);
      restoreAttribute(state.control, 'tabindex', state.original.tabindex);
      restoreAttribute(state.control, 'aria-haspopup', state.original.ariaHaspopup);
      restoreAttribute(state.control, 'aria-controls', state.original.ariaControls);
      restoreAttribute(state.control, 'aria-expanded', state.original.ariaExpanded);
      initializedTriggers.delete(state.trigger);
    });
    this.states = [];
    this.root.classList.remove('papijo-runtime-tooltips');
    document.removeEventListener('pointerdown', self.boundOutsidePointer);
  };

  H5P.AdvancedTextPapiJoTooltipRuntime = AdvancedTextPapiJoTooltipRuntime;
})(H5P);
