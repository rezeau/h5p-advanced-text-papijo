(function () {
  'use strict';

  var ALLOWED_TAGS = ['em', 'strong', 'sup', 'sub', 's', 'br'];
  var DROP_WITH_CONTENT = [
    'script', 'style', 'template', 'iframe', 'object', 'embed',
    'svg', 'math', 'noscript'
  ];

  function appendSanitized(source, target, doc) {
    if (source.nodeType === 3) {
      target.appendChild(doc.createTextNode(source.nodeValue));
      return;
    }
    if (source.nodeType !== 1) {
      return;
    }

    var tagName = source.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.indexOf(tagName) !== -1) {
      return;
    }

    var childTarget = target;
    if (ALLOWED_TAGS.indexOf(tagName) !== -1) {
      childTarget = doc.createElement(tagName);
      target.appendChild(childTarget);
    }

    Array.from(source.childNodes).forEach(function (child) {
      appendSanitized(child, childTarget, doc);
    });
  }

  function toFragment(value, doc) {
    doc = doc || document;
    var template = doc.createElement('template');
    template.innerHTML = typeof value === 'string' ? value : '';
    var fragment = doc.createDocumentFragment();
    Array.from(template.content.childNodes).forEach(function (child) {
      appendSanitized(child, fragment, doc);
    });
    return fragment;
  }

  function serialize(fragment) {
    function serializeNode(node) {
      if (node.nodeType === 3) {
        return node.nodeValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      if (node.nodeType !== 1) {
        return '';
      }
      var tagName = node.tagName.toLowerCase();
      if (tagName === 'br') {
        return '<br>';
      }
      return '<' + tagName + '>' +
        Array.from(node.childNodes).map(serializeNode).join('') +
        '</' + tagName + '>';
    }

    return Array.from(fragment.childNodes).map(serializeNode).join('');
  }

  function sanitize(value, doc) {
    doc = doc || document;
    return serialize(toFragment(value, doc));
  }

  function textContent(value, doc) {
    return toFragment(value, doc || document).textContent;
  }

  function toAuthoringText(value, doc) {
    doc = doc || document;
    var fragment = toFragment(value, doc);

    function sourceFor(node) {
      if (node.nodeType === 3) {
        return node.nodeValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      if (node.nodeType !== 1) {
        return '';
      }
      var tagName = node.tagName.toLowerCase();
      if (tagName === 'br') {
        return '<br>';
      }
      return '<' + tagName + '>' +
        Array.from(node.childNodes).map(sourceFor).join('') +
        '</' + tagName + '>';
    }

    return Array.from(fragment.childNodes).map(sourceFor).join('');
  }

  var sanitizer = {
    allowedTags: ALLOWED_TAGS.slice(),
    sanitize: sanitize,
    textContent: textContent,
    toAuthoringText: toAuthoringText,
    toFragment: toFragment
  };
  if (typeof H5PEditor !== 'undefined') {
    H5PEditor.AdvancedTextPapiJoTooltipSanitizer = sanitizer;
  }
  if (typeof H5P !== 'undefined') {
    H5P.AdvancedTextPapiJoTooltipSanitizer = sanitizer;
  }
})();
