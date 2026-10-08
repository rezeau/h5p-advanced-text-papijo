/* Managed inline-image contract, independently packaged in runtime and editor. */
var PapijoManagedInlineImages = (function () {
  'use strict';

  var sequence = 0;
  var attribute = 'data-papijo-inline-image-id';
  var className = 'papijo-inline-image';

  // Presentation belongs to the occurrence. Never interpret author data as CSS.
  function normalizeStyle(value) {
    return value === 'alignLeft' || value === 'alignRight' ? value : null;
  }

  function styleClass(value) {
    if (value === 'alignLeft') { return 'papijo-inline-image-wrap-left'; }
    if (value === 'alignRight') { return 'papijo-inline-image-wrap-right'; }
    return null;
  }

  function validId(id) {
    return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(id);
  }

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'inline-' + Date.now().toString(36) + '-' +
      (++sequence).toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function validPath(path) {
    if (typeof path !== 'string' || path !== path.trim()) {
      return false;
    }
    // The image widget may append #tmp before save. Do not normalize the path:
    // H5P.getPath must receive the original source-content reference.
    path = path.replace(/#tmp$/, '');
    var decoded;
    try {
      decoded = decodeURIComponent(path);
    }
    catch (error) {
      return false;
    }
    if (/[\\:?#%\x00-\x1f\x7f]/.test(decoded) ||
        decoded.split('/').length !== path.split('/').length) {
      return false;
    }
    var parts = decoded.split('/');
    var literalParts = path.split('/');
    var index = 0;
    function contentId(position) {
      // Numeric CMS IDs and CLI folder IDs; no encoded or traversal segments.
      return /^[a-z0-9_-]+$/i.test(literalParts[position] || '');
    }
    // Installed H5P.parseClipboard prepends ../<contentId>/ on every copy.
    // With no destination ID it uses ../content/<contentId>/; the standard
    // two-level contentRelUrl variant is ../../content/<contentId>/.
    // Content-root variants terminate the prefix; only copy hops can repeat.
    while (parts[index] === '..') {
      if (literalParts[index] !== '..') { return false; }
      if (literalParts[index + 1] === '..') {
        if (literalParts[index + 2] !== 'content' || !contentId(index + 3)) { return false; }
        index += 4;
        break;
      }
      if (literalParts[index + 1] === 'content' && contentId(index + 2) && parts[index + 3] === 'images') {
        index += 3;
        break;
      }
      if (!contentId(index + 1)) { return false; }
      index += 2;
    }
    if (parts[index] !== 'images' || index + 1 >= parts.length) { return false; }
    return parts.slice(index + 1).every(function (part) {
      return part !== '' && part !== '.' && part !== '..';
    });
  }

  function validDefinition(definition) {
    return !!definition && validId(definition.id) && !!definition.image &&
      validPath(definition.image.path) && typeof definition.alt === 'string' &&
      definition.alt.trim() !== '';
  }

  function lookup(definitions, id) {
    if (!validId(id) || !Array.isArray(definitions)) {
      return null;
    }
    var matches = definitions.filter(function (definition) {
      return definition && definition.id === id;
    });
    return matches.length === 1 && validDefinition(matches[0]) ? matches[0] : null;
  }

  function resolve(definition, contentId, getPath) {
    if (!validDefinition(definition) || typeof getPath !== 'function') {
      return null;
    }
    try {
      var url = getPath(definition.image.path, contentId);
      return typeof url === 'string' && url.trim() === url && url !== '' &&
        !/[\x00-\x1f\x7f]/.test(url) &&
        (!/^[a-z][a-z0-9+.-]*:/i.test(url) || /^https?:\/\//i.test(url)) ? url : null;
    }
    catch (error) {
      return null;
    }
  }

  return {
    attribute: attribute,
    className: className,
    styleAttribute: 'data-papijo-inline-image-style',
    floatRootClass: 'papijo-inline-image-floats',
    normalizeStyle: normalizeStyle,
    styleClass: styleClass,
    createId: createId,
    validId: validId,
    validPath: validPath,
    validDefinition: validDefinition,
    lookup: lookup,
    resolve: resolve
  };
})();
