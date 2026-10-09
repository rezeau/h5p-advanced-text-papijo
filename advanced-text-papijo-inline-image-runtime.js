(function (H5P, managed) {
  'use strict';

  // Split surrounding anchors at this occurrence. Adjacent linked text retains
  // its own anchor/attributes, while the managed image cannot inherit them.
  function detachFromAnchors(marker, root) {
    var anchor = marker.parentElement && marker.parentElement.closest('a');
    while (anchor && root.contains(anchor)) {
      var range = marker.ownerDocument.createRange();
      range.setStartAfter(marker);
      range.setEnd(anchor, anchor.childNodes.length);
      var tail = range.extractContents();
      var after = anchor.cloneNode(false);
      after.appendChild(tail);
      var branch = marker.parentNode;
      anchor.parentNode.insertBefore(marker, anchor.nextSibling);
      while (branch !== anchor && !branch.firstChild) {
        var parent = branch.parentNode;
        branch.remove();
        branch = parent;
      }
      if (after.firstChild) { marker.parentNode.insertBefore(after, marker.nextSibling); }
      if (!anchor.firstChild) { anchor.remove(); }
      anchor = marker.parentElement && marker.parentElement.closest('a');
    }
  }

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
      var surrounding = marker.parentElement && marker.parentElement.closest('a');
      var href = managed.normalizeLink(marker.getAttribute(managed.linkAttribute)) ||
        (surrounding && self.root.contains(surrounding) && managed.normalizeLink(surrounding.getAttribute('href')));
      detachFromAnchors(marker, self.root);
      if (href) { marker.setAttribute(managed.linkAttribute, href); }
      else { marker.removeAttribute(managed.linkAttribute); }
      // Clear untrusted marker children even when the definition is missing.
      marker.textContent = '';
      // Sizing comes exclusively from the numeric marker contract.
      marker.removeAttribute('style');
      marker.classList.remove(managed.sizeClass);
      var width = managed.normalizeWidth(marker.getAttribute(managed.widthAttribute));
      if (width === null) { marker.removeAttribute(managed.widthAttribute); }
      else { marker.setAttribute(managed.widthAttribute, String(width)); }
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
          if (width !== null && image.naturalWidth) {
            marker.style.setProperty('--papijo-image-natural-width', image.naturalWidth + 'px');
          }
          self.onResize();
        }
      };
      image.addEventListener('load', resize);
      image.addEventListener('error', resize);
      self.records.push({ image: image, marker: marker, resize: resize });
      if (width !== null) {
        marker.classList.add(managed.sizeClass);
        marker.style.setProperty('--papijo-image-width', width + '%');
      }
      image.src = url;
      if (href) {
        var anchor = marker.ownerDocument.createElement('a');
        anchor.className = 'papijo-inline-image-link';
        anchor.setAttribute('href', href);
        anchor.appendChild(image);
        marker.appendChild(anchor);
      }
      else { marker.appendChild(image); }
      // A cached image may already expose intrinsic dimensions before load fires.
      if (image.complete && image.naturalWidth) { resize(); }
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
      record.marker.classList.remove(managed.sizeClass);
      record.marker.style.removeProperty('--papijo-image-width');
      record.marker.style.removeProperty('--papijo-image-natural-width');
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
