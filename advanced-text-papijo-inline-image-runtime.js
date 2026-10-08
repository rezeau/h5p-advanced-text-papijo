(function (H5P, managed) {
  'use strict';

  /** Resolves markers inside a single AdvancedText root; never owns another store. */
  function InlineImageRuntime(root, contentId, definitions, onResize) {
    this.root = root;
    this.contentId = contentId;
    this.definitions = definitions;
    this.onResize = typeof onResize === 'function' ? onResize : function () {};
    this.records = [];
  }

  InlineImageRuntime.prototype.initialize = function () {
    this.destroy();
    var self = this;
    var floating = false;
    Array.from(this.root.querySelectorAll('span.' + managed.className +
      '[' + managed.attribute + ']')).forEach(function (marker) {
      var definition = managed.lookup(self.definitions,
        marker.getAttribute(managed.attribute));
      var url = managed.resolve(definition, self.contentId, H5P.getPath);
      // Clear untrusted marker children even when the definition is missing.
      marker.textContent = '';
      marker.classList.remove(managed.styleClass('alignLeft'), managed.styleClass('alignRight'));
      if (!url) {
        return;
      }
      var image = marker.ownerDocument.createElement('img');
      image.className = 'papijo-managed-inline-image';
      image.alt = definition.alt.trim();
      var style = managed.normalizeStyle(marker.getAttribute(managed.styleAttribute));
      if (style) {
        marker.classList.add(managed.styleClass(style));
        floating = true;
      }
      var resize = function () {
        if (self.root.contains(image)) {
          self.onResize();
        }
      };
      image.addEventListener('load', resize);
      image.addEventListener('error', resize);
      self.records.push({ image: image, marker: marker, resize: resize });
      image.src = url;
      marker.appendChild(image);
    });
    this.root.classList.toggle(managed.floatRootClass, floating);
    if (floating) {
      // Parent libraries may control the root's display for show/hide behavior.
      // Contain floats inside a generated child without overriding that display.
      this.flowRoot = this.root.ownerDocument.createElement('div');
      this.flowRoot.className = 'papijo-inline-image-flow';
      while (this.root.firstChild) { this.flowRoot.appendChild(this.root.firstChild); }
      this.root.appendChild(this.flowRoot);
    }
    return this.records.length;
  };

  InlineImageRuntime.prototype.destroy = function () {
    this.records.forEach(function (record) {
      record.image.removeEventListener('load', record.resize);
      record.image.removeEventListener('error', record.resize);
      record.marker.classList.remove(managed.styleClass('alignLeft'), managed.styleClass('alignRight'));
    });
    this.records = [];
    if (this.flowRoot && this.flowRoot.parentNode === this.root) {
      while (this.flowRoot.firstChild) { this.root.insertBefore(this.flowRoot.firstChild, this.flowRoot); }
      this.root.removeChild(this.flowRoot);
    }
    this.flowRoot = null;
    this.root.classList.remove(managed.floatRootClass);
  };

  H5P.AdvancedTextPapiJoInlineImageRuntime = InlineImageRuntime;
})(H5P, PapijoManagedInlineImages);
