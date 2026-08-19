(function (H5PEditor) {
  'use strict';

  var LIBRARY_NAME = 'H5PEditor.AdvancedTextPapiJoTooltip';
  var ASCENDING_COMMAND = 'sortCurrentTableColumnAscending';
  var DESCENDING_COMMAND = 'sortCurrentTableColumnDescending';

  function translate(key) {
    return H5PEditor.t(LIBRARY_NAME, key);
  }

  function getCellText(editor, cell) {
    var parts = [];
    Array.from(editor.model.createRangeIn(cell).getItems()).forEach(function (item) {
      if (item.is('$textProxy')) {
        parts.push(item.data);
      }
    });
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function tableHasMergedCells(tableUtils, table) {
    return Array.from(tableUtils.createTableWalker(table)).some(function (slot) {
      return parseInt(slot.cell.getAttribute('rowspan') || '1', 10) > 1 ||
        parseInt(slot.cell.getAttribute('colspan') || '1', 10) > 1;
    });
  }

  function getSortContext(editor) {
    if (!editor.plugins.has('TableUtils')) {
      return { valid: false, reason: 'tableUnavailable' };
    }

    var tableUtils = editor.plugins.get('TableUtils');
    var selection = editor.model.document.selection;
    var affectedCells = tableUtils.getSelectionAffectedTableCells(selection);
    if (affectedCells.length !== 1) {
      return { valid: false, reason: 'selectionNotInOneCell' };
    }

    var currentCell = affectedCells[0];
    var table = currentCell.findAncestor('table');
    var location = table && tableUtils.getCellLocation(currentCell);
    if (!table || !location) {
      return { valid: false, reason: 'tableUnavailable' };
    }
    if (tableHasMergedCells(tableUtils, table)) {
      return { valid: false, reason: 'mergedCells' };
    }

    var headingColumns = parseInt(table.getAttribute('headingColumns') || '0', 10);
    if (location.column < headingColumns) {
      return { valid: false, reason: 'headerColumn' };
    }

    var headingRows = parseInt(table.getAttribute('headingRows') || '0', 10);
    var cells = Array.from(tableUtils.createTableWalker(table, {
      column: location.column
    })).filter(function (slot) {
      return slot.row >= headingRows;
    }).map(function (slot) {
      return slot.cell;
    });

    if (cells.length < 2) {
      return { valid: false, reason: 'insufficientCells' };
    }

    return {
      valid: true,
      cells: cells,
      currentCell: currentCell
    };
  }

  function TableSortCommand(editor, direction) {
    this.editor = editor;
    this.direction = direction;
    this.isEnabled = false;
    this.buttons = [];
  }

  TableSortCommand.prototype.refresh = function () {
    this.isEnabled = getSortContext(this.editor).valid;
    this.buttons.forEach(function (button) {
      button.isEnabled = this.isEnabled;
    }, this);
  };

  TableSortCommand.prototype.addButton = function (button) {
    this.buttons.push(button);
    button.isEnabled = this.isEnabled;
  };

  TableSortCommand.prototype.destroy = function () {
    this.buttons = [];
  };

  TableSortCommand.prototype.execute = function () {
    var editor = this.editor;
    var context = getSortContext(editor);
    if (!context.valid) {
      return context;
    }

    var locale = editor.locale.contentLanguage || undefined;
    var collator = new Intl.Collator(locale, {
      sensitivity: 'base',
      numeric: true
    });
    var records = context.cells.map(function (cell, index) {
      var text = getCellText(editor, cell);
      return {
        fragment: editor.model.getSelectedContent(
          editor.model.createSelection(editor.model.createRangeIn(cell))
        ),
        index: index,
        isEmpty: text === '',
        text: text
      };
    });

    records.sort(function (first, second) {
      if (first.isEmpty !== second.isEmpty) {
        return first.isEmpty ? 1 : -1;
      }
      var comparison = collator.compare(first.text, second.text);
      return comparison === 0 ? first.index - second.index :
        comparison * this.direction;
    }.bind(this));

    editor.model.change(function (writer) {
      context.cells.forEach(function (cell) {
        writer.remove(writer.createRangeIn(cell));
      });
      records.forEach(function (record, index) {
        writer.insert(record.fragment, context.cells[index], 0);
      });
      writer.setSelection(context.currentCell.getChild(0), 0);
    });

    return { valid: true };
  };

  function addToolbarItem(config, name) {
    if (config.table.contentToolbar.indexOf(name) === -1) {
      config.table.contentToolbar.push(name);
    }
  }

  function extendConfig(config) {
    if (!config.table || !Array.isArray(config.table.contentToolbar)) {
      return;
    }
    if (config.table.contentToolbar.indexOf(ASCENDING_COMMAND) === -1 &&
        config.table.contentToolbar.indexOf(DESCENDING_COMMAND) === -1) {
      config.table.contentToolbar.push('|');
    }
    addToolbarItem(config, ASCENDING_COMMAND);
    addToolbarItem(config, DESCENDING_COMMAND);
  }

  function install(editor) {
    if (!editor.plugins.has('TableUtils')) {
      return;
    }

    var ascending = new TableSortCommand(editor, 1);
    var descending = new TableSortCommand(editor, -1);
    editor.commands.add(ASCENDING_COMMAND, ascending);
    editor.commands.add(DESCENDING_COMMAND, descending);

    var buttonConstructor;
    function createButton(locale, command, labelKey, commandName) {
      if (!buttonConstructor) {
        var referenceButton = editor.ui.componentFactory.create('undo');
        buttonConstructor = referenceButton.constructor;
        referenceButton.destroy();
      }
      var button = new buttonConstructor(locale);
      button.set({
        label: translate(labelKey),
        tooltip: true,
        withText: true
      });
      button.on('execute', function () {
        editor.execute(commandName);
        editor.editing.view.focus();
      });
      command.addButton(button);
      return button;
    }

    editor.ui.componentFactory.add(ASCENDING_COMMAND, function (locale) {
      return createButton(locale, ascending, 'sortCurrentColumnAscending',
        ASCENDING_COMMAND);
    });
    editor.ui.componentFactory.add(DESCENDING_COMMAND, function (locale) {
      return createButton(locale, descending, 'sortCurrentColumnDescending',
        DESCENDING_COMMAND);
    });

    function refresh() {
      ascending.refresh();
      descending.refresh();
    }
    editor.model.document.selection.on('change:range', refresh);
    editor.model.document.on('change:data', refresh);
    editor.once('destroy', function () {
      editor.model.document.selection.off('change:range', refresh);
      editor.model.document.off('change:data', refresh);
    });
    refresh();
  }

  H5PEditor.AdvancedTextPapiJoTableSort = {
    ASCENDING_COMMAND: ASCENDING_COMMAND,
    DESCENDING_COMMAND: DESCENDING_COMMAND,
    extendConfig: extendConfig,
    getSortContext: getSortContext,
    install: install
  };
})(H5PEditor);
