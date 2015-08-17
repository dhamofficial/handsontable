import copyPaste from 'copyPaste';
import SheetClip from 'SheetClip';
import {KEY_CODES, isCtrlKey} from './../../helpers/unicode';
import {proxy} from './../../helpers/function';
import {registerPlugin} from './../../plugins';
import {WalkontableCellCoords} from './../../3rdparty/walkontable/src/cell/coords';
import {WalkontableCellRange} from './../../3rdparty/walkontable/src/cell/range';


/**
 * @class CopyPaste
 * @plugin CopyPaste
 * @dependencies copyPaste SheetClip
 */
function CopyPastePlugin(instance) {
  var _this = this;

  this.copyPasteInstance = copyPaste();
  this.copyPasteInstance.onCut(onCut);
  this.copyPasteInstance.onPaste(onPaste);
  this.onPaste = onPaste; // for paste testing purposes

  instance.addHook('beforeKeyDown', onBeforeKeyDown);

  function onCut() {
    if (!instance.isListening()) {
      return;
    }
    instance.selection.empty();
  }

  function onPaste(str) {
    var
      input,
      inputArray,
      selected,
      coordsFrom,
      coordsTo,
      cellRange,
      topLeftCorner,
      bottomRightCorner,
      areaStart,
      areaEnd;

    if (!instance.isListening() || !instance.selection.isSelected()) {
      return;
    }
    input = str;
    inputArray = SheetClip.parse(input);
    selected = instance.getSelected();
    coordsFrom = new WalkontableCellCoords(selected[0], selected[1]);
    coordsTo = new WalkontableCellCoords(selected[2], selected[3]);
    cellRange = new WalkontableCellRange(coordsFrom, coordsFrom, coordsTo);
    topLeftCorner = cellRange.getTopLeftCorner();
    bottomRightCorner = cellRange.getBottomRightCorner();
    areaStart = topLeftCorner;
    areaEnd = new WalkontableCellCoords(
      Math.max(bottomRightCorner.row, inputArray.length - 1 + topLeftCorner.row),
      Math.max(bottomRightCorner.col, inputArray[0].length - 1 + topLeftCorner.col));

    instance.addHookOnce('afterChange', function(changes, source) {
      var skippedColumns = 0;

      if(changes !== null) {
        var currentCol = changes[0][1];

        for(var i = 0, chlen = changes.length; i < chlen; i++) {
          if(changes[i][1] === changes[0][1] + i + skippedColumns || changes[i][1] === changes[0][1]) {
            currentCol++;
          } else {
            skippedColumns++;
          }
        }
      }

      if (changes && changes.length) {
        this.selectCell(areaStart.row, areaStart.col, areaEnd.row, areaEnd.col + skippedColumns);
      }
    });

    instance.populateFromArray(areaStart.row, areaStart.col, inputArray, areaEnd.row, areaEnd.col, 'paste', instance.getSettings().pasteMode);
  }

  function onBeforeKeyDown(event) {
    if (!instance.getSelected()) {
      return;
    }
    if (instance.getActiveEditor() && instance.getActiveEditor().isOpened()) {
      return;
    }
    if (isCtrlKey(event.keyCode)) {
      // when CTRL is pressed, prepare selectable text in textarea
      _this.setCopyableText();
      event.stopImmediatePropagation();

      return;
    }
    // catch CTRL but not right ALT (which in some systems triggers ALT+CTRL)
    let ctrlDown = (event.ctrlKey || event.metaKey) && !event.altKey;

    if (event.keyCode == KEY_CODES.A && ctrlDown) {
      instance._registerTimeout(setTimeout(proxy(_this.setCopyableText, _this), 0));
    }
  }

  /**
   * Destroy plugin instance.
   *
   * @function destroy
   * @memberof CopyPaste#
   */
  this.destroy = function() {
    if (this.copyPasteInstance) {
      this.copyPasteInstance.removeCallback(onCut);
      this.copyPasteInstance.removeCallback(onPaste);
      this.copyPasteInstance.destroy();
      this.copyPasteInstance = null;
    }
    instance.removeHook('beforeKeyDown', onBeforeKeyDown);
  };

  instance.addHook('afterDestroy', proxy(this.destroy, this));

  /**
   * @function triggerPaste
   * @memberof CopyPaste#
   */
  this.triggerPaste = proxy(this.copyPasteInstance.triggerPaste, this.copyPasteInstance);

  /**
   * @function triggerCut
   * @memberof CopyPaste#
   */
  this.triggerCut = proxy(this.copyPasteInstance.triggerCut, this.copyPasteInstance);

  /**
   * Prepares copyable text in the invisible textarea.
   *
   * @function setCopyable
   * @memberof CopyPaste#
   */
  this.setCopyableText = function() {
    var settings = instance.getSettings();
    var copyRowsLimit = settings.copyRowsLimit;
    var copyColsLimit = settings.copyColsLimit;

    var selRange = instance.getSelectedRange();
    var topLeft = selRange.getTopLeftCorner();
    var bottomRight = selRange.getBottomRightCorner();
    var startRow = topLeft.row;
    var startCol = topLeft.col;
    var endRow = bottomRight.row;
    var endCol = bottomRight.col;
    var finalEndRow = Math.min(endRow, startRow + copyRowsLimit - 1);
    var finalEndCol = Math.min(endCol, startCol + copyColsLimit - 1);

    var copyableColumnRanges = [];
    copyableColumnRanges.push({
      startRow: startRow,
      startCol: startCol,
      endRow: finalEndRow,
      endCol: finalEndCol
    });

    copyableColumnRanges = Handsontable.hooks.run(instance, "modifyCopyableColumnRange", copyableColumnRanges);

    var copyableData = this.getRangedCopyableData(copyableColumnRanges);

    instance.copyPaste.copyPasteInstance.copyable(copyableData);

    if (endRow !== finalEndRow || endCol !== finalEndCol) {
      Handsontable.hooks.run(instance, "afterCopyLimit", endRow - startRow + 1, endCol - startCol + 1, copyRowsLimit, copyColsLimit);
    }
  };

  this.getRangedCopyableData = function(ranges) {
    var partial = [];

    for (var i = 0, rangesCount = ranges.length; i < rangesCount; i++) {
      partial.push(instance.getCopyableData(ranges[i].startRow, ranges[i].startCol, ranges[i].endRow, ranges[i].endCol));
    }

    if (rangesCount === 1) {
      return partial[0];
    } else {
      return this.mergeCopyableColumnRanges(partial);
    }
  };

  this.mergeCopyableColumnRanges = function(partialData) {
    var mergedData = '';
    var splitRows = [];
    var tempArray;

    for (var i = 0, partialCount = partialData.length; i < partialCount; i++) {
      tempArray = partialData[i].split('\n');
      tempArray.pop();

      splitRows.push(tempArray);
    }

    for (var i = 0, rowCount = splitRows[0].length; i < rowCount; i++) {
      for (var j = 0, splitCount = splitRows.length; j < splitCount; j++) {
        mergedData += splitRows[j][i];

        if(j !== splitCount -1) {
          mergedData += '\t';
        }

      }
      if (i !== rowCount - 1) {
        mergedData += '\n';
      }
    }

    return mergedData;
  };
}

/**
 * Init plugin
 *
 * @function init
 * @memberof CopyPaste#
 */
function init() {
  var instance = this,
    pluginEnabled = instance.getSettings().copyPaste !== false;

  if (pluginEnabled && !instance.copyPaste) {
    /**
     * Instance of CopyPaste Plugin {@link Handsontable.CopyPaste}
     *
     * @alias copyPaste
     * @memberof! Handsontable.Core#
     * @type {CopyPaste}
     */
    instance.copyPaste = new CopyPastePlugin(instance);

  } else if (!pluginEnabled && instance.copyPaste) {
    instance.copyPaste.destroy();
    instance.copyPaste = null;
  }
}


Handsontable.hooks.add('afterInit', init);
Handsontable.hooks.add('afterUpdateSettings', init);

Handsontable.hooks.register('afterCopyLimit');
Handsontable.hooks.register('modifyCopyableColumnRange');

export {CopyPastePlugin};

//registerPlugin('CopyPaste', CopyPastePlugin);
