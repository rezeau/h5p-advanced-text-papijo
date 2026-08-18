(function (H5P) {
  'use strict';

  var EDGE_GAP = 4;
  var TAIL_GAP = 10;

  /**
   * Speech bubble positioned against an existing AdvancedText tooltip span.
   *
   * @param {HTMLElement} root AdvancedText instance root.
   * @param {HTMLElement} trigger Existing annotated trigger.
   * @param {string} text Sanitized restricted inline tooltip markup.
   * @param {string} id Unique bubble id.
   */
  function AdvancedTextPapiJoSpeechBubble(root, trigger, text, id) {
    var self = this;
    self.root = root;
    self.trigger = trigger;
    self.animationFrame = null;
    self.resizeObserver = null;

    self.element = document.createElement('div');
    self.element.id = id;
    self.element.className = 'papijo-runtime-speech-bubble';
    self.element.setAttribute('role', 'tooltip');
    self.element.setAttribute('aria-live', 'polite');

    var textElement = document.createElement('div');
    textElement.className = 'papijo-runtime-speech-bubble-text';
    textElement.appendChild(
      H5P.AdvancedTextPapiJoTooltipSanitizer.toFragment(text, document)
    );
    self.element.appendChild(textElement);
    root.appendChild(self.element);

    self.boundPosition = function () {
      self.position();
    };
    window.addEventListener('resize', self.boundPosition);

    if (typeof ResizeObserver === 'function') {
      self.resizeObserver = new ResizeObserver(self.boundPosition);
      self.resizeObserver.observe(root);
      self.resizeObserver.observe(trigger);
    }

    self.position();
    self.animationFrame = window.requestAnimationFrame(function () {
      self.animationFrame = null;
      if (self.element) {
        self.element.classList.add('papijo-runtime-speech-bubble-show');
      }
    });
  }

  AdvancedTextPapiJoSpeechBubble.prototype.position = function () {
    if (!this.element || !this.element.isConnected ||
        !this.trigger || !this.trigger.isConnected) {
      return;
    }

    var rootRect = this.root.getBoundingClientRect();
    var triggerRect = this.trigger.getBoundingClientRect();
    var bubbleRect = this.element.getBoundingClientRect();
    var rootWidth = rootRect.width || this.root.clientWidth;
    var bubbleWidth = Math.min(
      bubbleRect.width,
      Math.max(0, rootWidth - (EDGE_GAP * 2))
    );
    var triggerCenter = triggerRect.left - rootRect.left +
      (triggerRect.width / 2);
    var left = triggerCenter - (bubbleWidth / 2);
    left = Math.max(EDGE_GAP, Math.min(left, rootWidth - bubbleWidth - EDGE_GAP));

    var spaceBelow = window.innerHeight - triggerRect.bottom;
    var spaceAbove = triggerRect.top;
    var placeBelow = spaceBelow >= bubbleRect.height + TAIL_GAP ||
      spaceBelow >= spaceAbove;
    var top = placeBelow ?
      triggerRect.bottom - rootRect.top + TAIL_GAP :
      triggerRect.top - rootRect.top - bubbleRect.height - TAIL_GAP;
    var tailLeft = Math.max(
      12,
      Math.min(triggerCenter - left, bubbleWidth - 12)
    );

    this.element.style.left = left + 'px';
    this.element.style.top = top + 'px';
    this.element.style.setProperty('--papijo-runtime-tail-left', tailLeft + 'px');
    this.element.classList.toggle('papijo-runtime-speech-bubble-below', placeBelow);
    this.element.classList.toggle('papijo-runtime-speech-bubble-above', !placeBelow);
  };

  AdvancedTextPapiJoSpeechBubble.prototype.contains = function (target) {
    return Boolean(this.element && this.element.contains(target));
  };

  AdvancedTextPapiJoSpeechBubble.prototype.remove = function () {
    window.removeEventListener('resize', this.boundPosition);
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  };

  H5P.AdvancedTextPapiJoSpeechBubble = AdvancedTextPapiJoSpeechBubble;
})(H5P);
