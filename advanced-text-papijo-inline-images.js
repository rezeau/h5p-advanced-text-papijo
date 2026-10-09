/* Managed inline-image contract, independently packaged in runtime and editor. */
var PapijoManagedInlineImages = (function () {
  'use strict';

  var sequence = 0;
  var attribute = 'data-papijo-inline-image-id';
  var className = 'papijo-inline-image';
  var captionClass = 'papijo-image-caption';

  // One plain-text boundary for forms, model repair, canonical readers and runtime.
  function validateCaption(value) {
    if (value === undefined || value === null) { return { value: null, error: null }; }
    if (typeof value !== 'string') { return { value: null, error: 'invalid' }; }
    for (var point of value) {
      var code = point.codePointAt(0);
      if (code >= 0xd800 && code <= 0xdfff) { return { value: null, error: 'invalid' }; }
    }
    value = value.replace(/\r\n|[\r\n\t\u0085\u2028\u2029]/g, ' ').replace(/^ +| +$/g, '');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) {
      return { value: null, error: 'invalid' };
    }
    if (Array.from(value).length > 1000) { return { value: null, error: 'length' }; }
    return { value: /[^\s\u200b\u200c\u200d\u2060\ufeff]/u.test(value) ? value : null, error: null };
  }
  function normalizeCaption(value) { return validateCaption(value).value; }

  // Malformed canonical children drop the entire caption, never surrounding text.
  // Only formatting whitespace plus exactly one direct, attribute-free text span.
  function readCaption(marker) {
    var children = Array.from(marker.childNodes || []);
    var elements = children.filter(function (node) { return node.nodeType !== 3 || /\S/.test(node.data); });
    if (elements.length !== 1) { return null; }
    var child = elements[0];
    if (child.nodeName !== 'SPAN' || child.getAttribute('class') !== captionClass ||
        child.attributes.length !== 1 || Array.from(child.childNodes).some(function (node) { return node.nodeType !== 3; })) {
      return null;
    }
    if (child.textContent.length > 12000) { return null; }
    return normalizeCaption(child.textContent);
  }

  // Derived display metrics only: never mutate the occurrence percentage.
  function captionSize(natural, basis, gutter, percentage, fontSize) {
    var available = Math.max(0, basis - gutter);
    var image = Math.min(natural, available, percentage === null ? available : basis * percentage / 100);
    return { image: image, unit: percentage === null ? image :
      Math.min(available, Math.max(image, 8 * fontSize)) };
  }

  // A percentage is occurrence state, never file metadata or arbitrary CSS.
  function normalizeWidth(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Math.round(value * 10) / 10 !== value) { return null; }
    }
    else if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9])?$/.test(value)) { return null; }
    var width = Number(value);
    return width >= 0.1 && width <= 100 ? width : null;
  }

  // Links belong to occurrences, independently of managed file definitions.
  // Validate again after DOM parsing; never decode/repair an unsupported scheme.
  function normalizeLink(value) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(value)) { return null; }
    value = value.trim();
    if (!/^https?:\/\/[^/?#]/i.test(value) || /[\s\\<>"'`\ufffd]/.test(value) ||
        /%(?![0-9a-f]{2})/i.test(value)) { return null; }
    var authority = value.split(/[/?#]/)[2];
    if (!authority || /@|:$/.test(authority)) { return null; }
    try {
      var url = new URL(value);
      return /^(http|https):$/.test(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null;
    }
    catch (error) { return null; }
  }

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
    captionClass: captionClass,
    captionedClass: 'papijo-image-captioned',
    validateCaption: validateCaption,
    normalizeCaption: normalizeCaption,
    readCaption: readCaption,
    captionSize: captionSize,
    styleAttribute: 'data-papijo-inline-image-style',
    linkAttribute: 'data-papijo-inline-image-link',
    widthAttribute: 'data-papijo-inline-image-width',
    sizeClass: 'papijo-inline-image-sized',
    floatRootClass: 'papijo-inline-image-floats',
    normalizeStyle: normalizeStyle,
    normalizeLink: normalizeLink,
    normalizeWidth: normalizeWidth,
    styleClass: styleClass,
    createId: createId,
    validId: validId,
    validPath: validPath,
    validDefinition: validDefinition,
    lookup: lookup,
    resolve: resolve
  };
})();
