(function (H5PEditor) {
  'use strict';

  var TOOLTIP_CLASS = 'papijo-tooltip';
  var TOOLTIP_ATTRIBUTE = 'data-papijo-tooltip';

  function getTooltipModelAttributeName(editor) {
    return editor.plugins.get('GeneralHtmlSupport')
      .getGhsAttributeNameForElement('span');
  }

  function isPapijoTooltipAttribute(value) {
    return value && Array.isArray(value.classes) &&
      value.classes.indexOf(TOOLTIP_CLASS) !== -1;
  }

  function getTooltipText(value) {
    if (!isPapijoTooltipAttribute(value) || !value.attributes ||
        typeof value.attributes[TOOLTIP_ATTRIBUTE] !== 'string' ||
        value.attributes[TOOLTIP_ATTRIBUTE].trim() === '') {
      return null;
    }
    return value.attributes[TOOLTIP_ATTRIBUTE];
  }

  function findAncestor(node, name) {
    while (node) {
      if (node.name === name) {
        return node;
      }
      node = node.parent;
    }
    return null;
  }

  function findBlockAncestor(editor, node) {
    while (node) {
      if (editor.model.schema.isBlock(node)) {
        return node;
      }
      node = node.parent;
    }
    return null;
  }

  function getSelectionStructure(editor, selection, allowCollapsed) {
    if (!selection || (!allowCollapsed && selection.isCollapsed)) {
      return {
        valid: false,
        reason: 'emptySelection',
        messageKey: 'selectTextBeforeCreating'
      };
    }

    var ranges = Array.from(selection.getRanges());
    if (ranges.length !== 1) {
      return {
        valid: false,
        reason: 'crossesBlockBoundary',
        messageKey: 'selectionMustStayInOneBlock'
      };
    }

    var range = ranges[0];
    var startCell = findAncestor(range.start.parent, 'tableCell');
    var endCell = findAncestor(range.end.parent, 'tableCell');
    var selectedCells = Array.from(range.getItems()).filter(function (item) {
      return item.name === 'tableCell';
    });
    if (startCell !== endCell || selectedCells.length > 1) {
      return {
        valid: false,
        reason: 'crossesTableCellBoundary',
        messageKey: 'selectionMustStayInOneTableCell'
      };
    }

    var startBlock = findBlockAncestor(editor, range.start.parent);
    var endBlock = findBlockAncestor(editor, range.end.parent);
    if (!startBlock || startBlock !== endBlock) {
      return {
        valid: false,
        reason: 'crossesBlockBoundary',
        messageKey: 'selectionMustStayInOneBlock'
      };
    }

    return { valid: true, range: range, block: startBlock };
  }

  function getTooltipSegments(parent, attributeName) {
    return Array.from(parent.getChildren()).map(function (child) {
      var value = child.hasAttribute ? child.getAttribute(attributeName) : null;
      return {
        end: child.startOffset + child.offsetSize,
        isTooltip: isPapijoTooltipAttribute(value),
        start: child.startOffset,
        text: getTooltipText(value)
      };
    });
  }

  /**
   * Detect an existing tooltip at the supplied CKEditor model selection.
   *
   * Invalid results contain valid=false, reason, optional kind, and messageKey.
   * Existing-tooltip results contain valid=true, kind='tooltip', the complete
   * model range, preserved selection ranges, attribute name, and tooltip text.
   * Ordinary selections contain kind='ordinary' and reason='ordinarySelection'.
   *
   * @param {Object} editor CKEditor instance.
   * @param {Object} selection CKEditor model selection.
   * @returns {Object} Selection-classification result.
   */
  function detectExistingTooltip(editor, selection) {
    var structure = getSelectionStructure(editor, selection, true);
    if (!structure.valid) {
      structure.kind = 'invalid';
      return structure;
    }

    var range = structure.range;
    var attributeName = getTooltipModelAttributeName(editor);
    var segments = getTooltipSegments(structure.block, attributeName);
    var matchingSegments;

    if (selection.isCollapsed) {
      matchingSegments = segments.filter(function (segment) {
        return segment.isTooltip && segment.start <= range.start.offset &&
          segment.end >= range.start.offset;
      });
    }
    else {
      matchingSegments = segments.filter(function (segment) {
        return segment.end > range.start.offset &&
          segment.start < range.end.offset;
      });
    }

    var tooltipSegments = matchingSegments.filter(function (segment) {
      return segment.isTooltip;
    });
    if (tooltipSegments.length === 0) {
      return { valid: false, kind: 'ordinary', reason: 'ordinarySelection' };
    }
    if (tooltipSegments.some(function (segment) {
      return segment.text === null;
    })) {
      return {
        valid: false,
        kind: 'invalid',
        reason: 'malformedTooltip',
        messageKey: 'selectionCannotOverlapTooltip'
      };
    }

    var tooltipTexts = tooltipSegments.reduce(function (texts, segment) {
      if (texts.indexOf(segment.text) === -1) {
        texts.push(segment.text);
      }
      return texts;
    }, []);

    if (tooltipTexts.length !== 1) {
      return {
        valid: false,
        kind: 'invalid',
        reason: 'multipleTooltips',
        messageKey: 'selectionContainsMultipleTooltips'
      };
    }

    var tooltipText = tooltipTexts[0];
    var matchingIndexes = tooltipSegments.map(function (segment) {
      return segments.indexOf(segment);
    });
    var firstIndex = Math.min.apply(null, matchingIndexes);
    var lastIndex = Math.max.apply(null, matchingIndexes);
    while (firstIndex > 0 && segments[firstIndex - 1].text === tooltipText) {
      firstIndex--;
    }
    while (lastIndex < segments.length - 1 &&
        segments[lastIndex + 1].text === tooltipText) {
      lastIndex++;
    }

    var tooltipStart = segments[firstIndex].start;
    var tooltipEnd = segments[lastIndex].end;
    if (!selection.isCollapsed && tooltipSegments.length !== matchingSegments.length) {
      var containsTooltip = range.start.offset <= tooltipStart &&
        range.end.offset >= tooltipEnd;
      return {
        valid: false,
        kind: 'invalid',
        reason: containsTooltip ? 'containsTooltip' : 'crossesTooltipBoundary',
        messageKey: containsTooltip ?
          'selectionContainsTooltip' : 'selectionCrossesTooltipBoundary'
      };
    }

    return {
      valid: true,
      kind: 'tooltip',
      reason: 'existingTooltip',
      attributeName: attributeName,
      range: editor.model.createRange(
        editor.model.createPositionAt(structure.block, tooltipStart),
        editor.model.createPositionAt(structure.block, tooltipEnd)
      ),
      selectionRanges: Array.from(selection.getRanges()),
      text: tooltipText
    };
  }

  /**
   * Validate a CKEditor model selection as a new-tooltip target.
   *
   * Valid results contain valid=true, reason='ordinarySelection', ranges, and
   * the GeneralHtmlSupport attribute name. Invalid results contain valid=false,
   * reason, and messageKey. Message translation remains a widget concern.
   *
   * @param {Object} editor CKEditor instance.
   * @param {Object} selection CKEditor model selection.
   * @returns {Object} Selection-classification result.
   */
  function validateSelection(editor, selection) {
    var structure = getSelectionStructure(editor, selection, false);
    if (!structure.valid) {
      return structure;
    }

    var range = structure.range;
    var attributeName = getTooltipModelAttributeName(editor);
    var tooltipState = detectExistingTooltip(editor, selection);
    if (tooltipState.kind !== 'ordinary') {
      return {
        valid: false,
        reason: tooltipState.reason,
        messageKey: tooltipState.messageKey || 'selectionCannotOverlapTooltip'
      };
    }
    return {
      valid: true,
      reason: 'ordinarySelection',
      ranges: [range],
      attributeName: attributeName
    };
  }

  H5PEditor.AdvancedTextPapiJoTooltipSelection = {
    detectExistingTooltip: detectExistingTooltip,
    validateSelection: validateSelection
  };
})(H5PEditor);
