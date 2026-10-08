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
    Array.from(this.root.querySelectorAll('span.' + managed.className +
      '[' + managed.attribute + ']')).forEach(function (marker) {
      var definition = managed.lookup(self.definitions,
        marker.getAttribute(managed.attribute));
      var url = managed.resolve(definition, self.contentId, H5P.getPath);
      // Clear untrusted marker children even when the definition is missing.
      marker.textContent = '';
      if (!url) {
        return;
      }
      var image = marker.ownerDocument.createElement('img');
      image.className = 'papijo-managed-inline-image';
      image.alt = definition.alt.trim();
      var resize = function () {
        if (self.root.contains(image)) {
          self.onResize();
        }
      };
      image.addEventListener('load', resize);
      image.addEventListener('error', resize);
      self.records.push({ image: image, resize: resize });
      image.src = url;
      marker.appendChild(image);
    });
    return this.records.length;
  };

  InlineImageRuntime.prototype.destroy = function () {
    this.records.forEach(function (record) {
      record.image.removeEventListener('load', record.resize);
      record.image.removeEventListener('error', record.resize);
    });
    this.records = [];
  };

  H5P.AdvancedTextPapiJoInlineImageRuntime = InlineImageRuntime;
})(H5P, PapijoManagedInlineImages);
