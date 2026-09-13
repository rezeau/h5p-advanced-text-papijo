(function (H5P) {
  'use strict';

  var EDGE_GAP = 4;
  var TAIL_GAP = 10;

  /**
   * Plan vertical placement against the AdvancedText root without counting
   * space already reserved for the current bubble.
   *
   * @param {DOMRect} triggerRect Trigger bounds.
   * @param {DOMRect} bubbleRect Rendered bubble bounds.
   * @param {DOMRect} rootRect AdvancedText root bounds.
   * @param {number} currentReservedSpace Current in-flow reservation.
   * @returns {{direction: string, fits: boolean, reservedSpace: number}}
   */
  function getLayoutPlan(
    triggerRect,
    bubbleRect,
    rootRect,
    currentReservedSpace
  ) {
    var naturalBottom = rootRect.bottom - currentReservedSpace;
    var above = Math.max(0, triggerRect.top - rootRect.top - TAIL_GAP);
    var below = Math.max(0, naturalBottom - triggerRect.bottom - TAIL_GAP);

    if (bubbleRect.height <= below) {
      return { direction: 'below', fits: true, reservedSpace: 0 };
    }
    if (bubbleRect.height <= above) {
      return { direction: 'above', fits: true, reservedSpace: 0 };
    }
    return {
      direction: 'below',
      fits: false,
      reservedSpace: Math.ceil(bubbleRect.height - below)
    };
  }

  /**
   * Speech bubble positioned against an existing AdvancedText tooltip span.
   *
   * @param {HTMLElement} root AdvancedText instance root.
   * @param {HTMLElement} trigger Existing annotated trigger.
   * @param {string} text Sanitized restricted inline tooltip markup.
   * @param {string} id Unique bubble id.
   * @param {Object} [image] Resolved managed image data.
   * @param {Object} [layout] AdvancedText-owned layout callbacks.
   */
  function AdvancedTextPapiJoSpeechBubble(
    root,
    trigger,
    text,
    id,
    image,
    layout
  ) {
    var self = this;
    self.root = root;
    self.trigger = trigger;
    self.layout = layout || {};
    self.animationFrame = null;
    self.layoutFrame = null;
    self.resizeObserver = null;

    self.element = document.createElement('div');
    self.element.id = id;
    self.element.className = 'papijo-runtime-speech-bubble';
    self.element.setAttribute('role', 'tooltip');
    self.element.setAttribute('aria-live', 'polite');

    if (H5P.AdvancedTextPapiJoTooltipSanitizer.textContent(text).trim() !== '') {
      var textElement = document.createElement('div');
      textElement.className = 'papijo-runtime-speech-bubble-text';
      textElement.appendChild(
        H5P.AdvancedTextPapiJoTooltipSanitizer.toFragment(text, document)
      );
      self.element.appendChild(textElement);
    }
    if (image && typeof image.src === 'string' &&
        typeof image.alt === 'string') {
      var imageElement = document.createElement('img');
      imageElement.className = 'papijo-runtime-speech-bubble-image';
      imageElement.alt = image.alt;
      imageElement.addEventListener('load', function () {
        self.position();
      });
      imageElement.src = image.src;
      self.element.appendChild(imageElement);
    }
    root.appendChild(self.element);

    self.boundPosition = function () {
      self.position();
    };
    window.addEventListener('resize', self.boundPosition);

    if (typeof ResizeObserver === 'function') {
      self.resizeObserver = new ResizeObserver(self.boundPosition);
      self.resizeObserver.observe(root);
      self.resizeObserver.observe(trigger);
      self.resizeObserver.observe(self.element);
    }

    self.position();
    self.animationFrame = window.requestAnimationFrame(function () {
      self.animationFrame = null;
      if (self.element) {
        self.element.classList.add('papijo-runtime-speech-bubble-show');
      }
    });
  }

  AdvancedTextPapiJoSpeechBubble.prototype.queuePosition = function () {
    var self = this;
    if (self.layoutFrame !== null) {
      window.cancelAnimationFrame(self.layoutFrame);
    }
    self.layoutFrame = window.requestAnimationFrame(function () {
      self.layoutFrame = null;
      self.position();
    });
  };

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

    var currentReservedSpace = typeof this.layout.getReservedSpace ===
      'function' ? this.layout.getReservedSpace() : 0;
    var plan = getLayoutPlan(
      triggerRect,
      bubbleRect,
      rootRect,
      currentReservedSpace
    );
    if (typeof this.layout.setReservedSpace === 'function' &&
        plan.reservedSpace !== currentReservedSpace) {
      this.layout.setReservedSpace(plan.reservedSpace);
      this.queuePosition();
    }
    var placeBelow = plan.direction === 'below';
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
    if (this.layoutFrame !== null) {
      window.cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
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
  H5P.AdvancedTextPapiJoSpeechBubble.getLayoutPlan = getLayoutPlan;
})(H5P);
