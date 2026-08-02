/**
 * Copyright (c) Moxiecode Systems AB. All rights reserved.
 * Copyright (c) 1999–2015 Ephox Corp. All rights reserved.
 * Copyright (c) 2009–2025 Ryan Demmer. All rights reserved.
 * @note    Forked or includes code from TinyMCE 3.x/4.x/5.x (originally under LGPL 2.1) and relicensed under GPL v2+ per LGPL 2.1 § 3.
 *
 * Licensed under the GNU General Public License version 2 or later (GPL v2+):
 * https://www.gnu.org/licenses/gpl-2.0.html
 */


/**
 * This module contains logic overriding the selection with keyboard/mouse
 * around contentEditable=false regions.
 *
 * @example
 * // Disable the default cE=false selection
 * tinymce.activeEditor.on('ShowCaret BeforeObjectSelected', function(e) {
 *     e.preventDefault();
 * });
 *
 * @private
 * @class tinymce.SelectionOverrides
 */
(function (tinymce) {

  var CaretWalker = tinymce.caret.CaretWalker, CaretPosition = tinymce.caret.CaretPosition, CaretContainer = tinymce.caret.CaretContainer, CaretUtils = tinymce.caret.CaretUtils,
    CaretContainerRemove = tinymce.caret.CaretContainerRemove, FakeCaret = tinymce.caret.FakeCaret, LineWalker = tinymce.caret.LineWalker, LineUtils = tinymce.caret.LineUtils,
    ClientRect = tinymce.geom.ClientRect;

  var NodeType = tinymce.dom.NodeType, RangeUtils = tinymce.dom.RangeUtils;
  var VK = tinymce.VK, Fun = tinymce.util.Fun, Arr = tinymce.util.Arr;

  var Dispatcher = tinymce.util.Dispatcher, DragDropOverrides = tinymce.DragDropOverrides;

  var curry = Fun.curry,
    isContentEditableTrue = NodeType.isContentEditableTrue,
    isContentEditableFalse = NodeType.isContentEditableFalse,
    isElement = NodeType.isElement,
    isAfterContentEditableFalse = CaretUtils.isAfterContentEditableFalse,
    isBeforeContentEditableFalse = CaretUtils.isBeforeContentEditableFalse,
    getSelectedNode = RangeUtils.getSelectedNode;

  function getVisualCaretPosition(walkFn, caretPosition) {
    while ((caretPosition = walkFn(caretPosition))) {
      if (caretPosition.isVisible()) {
        return caretPosition;
      }
    }

    return caretPosition;
  }

  function setEditorTimeout(editor, callback, time) {
    return setTimeout(function () {
      if (!editor.removed) {
        callback();
      }
    }, time);
  }

  tinymce.SelectionOverrides = function (editor) {
    editor.onShowCaret = new Dispatcher();
    editor.onBeforeObjectSelected = new Dispatcher();
    editor.onObjectSelected = new Dispatcher();
    editor.onContentEditableSelect = new Dispatcher();

    var rootNode = editor.getBody(),
      caretWalker = new CaretWalker(rootNode);
    var getNextVisualCaretPosition = curry(getVisualCaretPosition, caretWalker.next);
    var getPrevVisualCaretPosition = curry(getVisualCaretPosition, caretWalker.prev),
      fakeCaret = new FakeCaret(editor.getBody(), isBlock),
      realSelectionId = 'sel-' + editor.dom.uniqueId(),
      selectedContentEditableNode;

    function isFakeSelectionElement(elm) {
      return editor.dom.hasClass(elm, 'mce-offscreen-selection');
    }

    function getRealSelectionElement() {
      var container = editor.dom.get(realSelectionId);
      return container ? container.getElementsByTagName('*')[0] : container;
    }

    function isBlock(node) {
      return editor.dom.isBlock(node);
    }

    function setRange(range) {
      if (range) {
        editor.selection.setRng(range);
      }
    }

    function getRange() {
      return editor.selection.getRng();
    }

    function scrollIntoView(node, alignToTop) {
      editor.selection.scrollIntoView(node, alignToTop);
    }

    function showCaret(direction, node, before) {
      var evt = {
        target: node,
        direction: direction,
        before: before
      };

      editor.onShowCaret.dispatch(editor, evt);

      if (!evt.target) {
        return null;
      }

      scrollIntoView(node, direction === -1);

      return fakeCaret.show(before, node);
    }

    function selectNode(node) {
       var evt = {
        target: node
      };

      editor.onBeforeObjectSelected.dispatch(editor, evt);

      if (!evt.target) {
        return null;
      }

      return getNodeRange(node);
    }

    function getNodeRange(node) {
      var rng = node.ownerDocument.createRange();

      rng.selectNode(node);

      return rng;
    }

    function isMoveInsideSameBlock(fromCaretPosition, toCaretPosition) {
      var inSameBlock = CaretUtils.isInSameBlock(fromCaretPosition, toCaretPosition);

      // Handle bogus BR <p>abc|<br></p>
      if (!inSameBlock && NodeType.isBr(fromCaretPosition.getNode())) {
        return true;
      }

      return inSameBlock;
    }

    function getNormalizedRangeEndPoint(direction, range) {
      range = CaretUtils.normalizeRange(direction, rootNode, range);

      if (direction == -1) {
        return CaretPosition.fromRangeStart(range);
      }

      return CaretPosition.fromRangeEnd(range);
    }

    function isRangeInCaretContainerBlock(range) {
      return CaretContainer.isCaretContainerBlock(range.startContainer);
    }

    function moveToCeFalseHorizontally(direction, getNextPosFn, isBeforeContentEditableFalseFn, range) {
      var node, caretPosition, peekCaretPosition, rangeIsInContainerBlock;

      if (!range.collapsed) {
        node = getSelectedNode(range);
        if (isContentEditableFalse(node)) {
          return showCaret(direction, node, direction == -1);
        }
      }

      rangeIsInContainerBlock = isRangeInCaretContainerBlock(range);
      caretPosition = getNormalizedRangeEndPoint(direction, range);

      if (isBeforeContentEditableFalseFn(caretPosition)) {
        return selectNode(caretPosition.getNode(direction == -1));
      }

      caretPosition = getNextPosFn(caretPosition);
      if (!caretPosition) {
        if (rangeIsInContainerBlock) {
          return range;
        }

        return null;
      }

      if (isBeforeContentEditableFalseFn(caretPosition)) {
        return showCaret(direction, caretPosition.getNode(direction == -1), direction == 1);
      }

      // Peek ahead for handling of ab|c<span cE=false> -> abc|<span cE=false>
      peekCaretPosition = getNextPosFn(caretPosition);
      if (isBeforeContentEditableFalseFn(peekCaretPosition)) {
        if (isMoveInsideSameBlock(caretPosition, peekCaretPosition)) {
          return showCaret(direction, peekCaretPosition.getNode(direction == -1), direction == 1);
        }
      }

      if (rangeIsInContainerBlock) {
        return renderRangeCaret(caretPosition.toRange());
      }

      return null;
    }

    function moveToCeFalseVertically(direction, walkerFn, range) {
      var caretPosition, linePositions, nextLinePositions,
        closestNextLineRect, caretClientRect, clientX,
        dist1, dist2, contentEditableFalseNode;

      contentEditableFalseNode = getSelectedNode(range);
      caretPosition = getNormalizedRangeEndPoint(direction, range);
      linePositions = walkerFn(rootNode, LineWalker.isAboveLine(1), caretPosition);
      nextLinePositions = Arr.filter(linePositions, LineWalker.isLine(1));
      caretClientRect = Arr.last(caretPosition.getClientRects());

      if (isBeforeContentEditableFalse(caretPosition)) {
        contentEditableFalseNode = caretPosition.getNode();
      }

      if (isAfterContentEditableFalse(caretPosition)) {
        contentEditableFalseNode = caretPosition.getNode(true);
      }

      if (!caretClientRect) {
        return null;
      }

      clientX = caretClientRect.left;

      closestNextLineRect = LineUtils.findClosestClientRect(nextLinePositions, clientX);
      if (closestNextLineRect) {
        if (isContentEditableFalse(closestNextLineRect.node)) {
          dist1 = Math.abs(clientX - closestNextLineRect.left);
          dist2 = Math.abs(clientX - closestNextLineRect.right);

          return showCaret(direction, closestNextLineRect.node, dist1 < dist2);
        }
      }

      if (contentEditableFalseNode) {
        var caretPositions = LineWalker.positionsUntil(direction, rootNode, LineWalker.isAboveLine(1), contentEditableFalseNode);

        closestNextLineRect = LineUtils.findClosestClientRect(Arr.filter(caretPositions, LineWalker.isLine(1)), clientX);
        if (closestNextLineRect) {
          return renderRangeCaret(closestNextLineRect.position.toRange());
        }

        closestNextLineRect = Arr.last(Arr.filter(caretPositions, LineWalker.isLine(0)));
        if (closestNextLineRect) {
          return renderRangeCaret(closestNextLineRect.position.toRange());
        }
      }
    }

    function exitPreBlock(direction, range) {
      var pre, caretPos, newBlock;

      function createTextBlock() {
        var textBlock = editor.dom.create(editor.settings.forced_root_block);

        textBlock.innerHTML = '<br data-mce-bogus="1">';

        return textBlock;
      }

      if (range.collapsed && editor.settings.forced_root_block) {
        pre = editor.dom.getParent(range.startContainer, 'PRE');
        if (!pre) {
          return;
        }

        if (direction == 1) {
          caretPos = getNextVisualCaretPosition(CaretPosition.fromRangeStart(range));
        } else {
          caretPos = getPrevVisualCaretPosition(CaretPosition.fromRangeStart(range));
        }

        if (!caretPos) {
          newBlock = createTextBlock();

          if (direction == 1) {
            editor.dom.insertAfter(newBlock, pre);
          } else {
            editor.dom.insertBefore(newBlock, pre);
          }

          editor.selection.select(newBlock, true);
          editor.selection.collapse();
        }
      }
    }

    function moveH(direction, getNextPosFn, isBeforeContentEditableFalseFn, range) {
      var newRange;

      newRange = moveToCeFalseHorizontally(direction, getNextPosFn, isBeforeContentEditableFalseFn, range);
      if (newRange) {
        return newRange;
      }

      newRange = exitPreBlock(direction, range);
      if (newRange) {
        return newRange;
      }

      return null;
    }

    function moveV(direction, walkerFn, range) {
      var newRange;

      newRange = moveToCeFalseVertically(direction, walkerFn, range);
      if (newRange) {
        return newRange;
      }

      newRange = exitPreBlock(direction, range);
      if (newRange) {
        return newRange;
      }

      return null;
    }

    function getBlockCaretContainer() {
      return editor.dom.select('*[data-mce-caret]')[0];
    }

    function showBlockCaretContainer(blockCaretContainer) {
      if (blockCaretContainer.hasAttribute('data-mce-caret')) {
        CaretContainer.showCaretContainerBlock(blockCaretContainer);
        setRange(getRange()); // Removes control rect on IE
        scrollIntoView(blockCaretContainer[0]);
      }
    }

    function renderCaretAtRange(range) {
      var caretPosition, ceRoot;

      range = CaretUtils.normalizeRange(1, rootNode, range);
      caretPosition = CaretPosition.fromRangeStart(range);

      if (isContentEditableFalse(caretPosition.getNode())) {
        return showCaret(1, caretPosition.getNode(), !caretPosition.isAtEnd());
      }

      if (isContentEditableFalse(caretPosition.getNode(true))) {
        return showCaret(1, caretPosition.getNode(true), false);
      }

      // TODO: Should render caret before/after depending on where you click on the page forces after now
      ceRoot = editor.dom.getParent(caretPosition.getNode(), Fun.or(isContentEditableFalse, isContentEditableTrue));
      if (isContentEditableFalse(ceRoot)) {
        return showCaret(1, ceRoot, false);
      }

      return null;
    }

    function renderRangeCaret(range) {
      var caretRange;

      if (!range || !range.collapsed) {
        return range;
      }

      caretRange = renderCaretAtRange(range);
      if (caretRange) {
        return caretRange;
      }

      return range;
    }

    function deleteContentEditableNode(node) {
      var nextCaretPosition, prevCaretPosition, prevCeFalseElm, nextElement;

      if (!isContentEditableFalse(node)) {
        return null;
      }

      if (isContentEditableFalse(node.previousSibling)) {
        prevCeFalseElm = node.previousSibling;
      }

      prevCaretPosition = getPrevVisualCaretPosition(CaretPosition.before(node));
      if (!prevCaretPosition) {
        nextCaretPosition = getNextVisualCaretPosition(CaretPosition.after(node));
      }

      if (nextCaretPosition && isElement(nextCaretPosition.getNode())) {
        nextElement = nextCaretPosition.getNode();
      }

      CaretContainerRemove.remove(node.previousSibling);
      CaretContainerRemove.remove(node.nextSibling);
      editor.dom.remove(node);

      // The node backing the fake selection is gone, drop the offscreen container with it. This
      // cannot be left to onAfterSetSelectionRange since a null range below never sets a selection.
      removeContentEditableSelection();

      if (editor.dom.isEmpty(editor.getBody())) {
        editor.setContent('');
        editor.focus();
        return;
      }

      if (prevCeFalseElm) {
        return CaretPosition.after(prevCeFalseElm).toRange();
      }

      if (nextElement) {
        return CaretPosition.before(nextElement).toRange();
      }

      if (prevCaretPosition) {
        return prevCaretPosition.toRange();
      }

      if (nextCaretPosition) {
        return nextCaretPosition.toRange();
      }

      return null;
    }

    function isTextBlock(node) {
      var textBlocks = editor.schema.getTextBlockElements();
      return node.nodeName in textBlocks;
    }

    function isEmpty(elm) {
      return editor.dom.isEmpty(elm);
    }

    function mergeTextBlocks(direction, fromCaretPosition, toCaretPosition) {
      var dom = editor.dom,
        fromBlock, toBlock, node, ceTarget;

      fromBlock = dom.getParent(fromCaretPosition.getNode(), dom.isBlock);
      toBlock = dom.getParent(toCaretPosition.getNode(), dom.isBlock);

      if (direction === -1) {
        ceTarget = toCaretPosition.getNode(true);
        if (isAfterContentEditableFalse(toCaretPosition) && isBlock(ceTarget)) {
          if (isTextBlock(fromBlock)) {
            if (isEmpty(fromBlock)) {
              dom.remove(fromBlock);
            }

            return CaretPosition.after(ceTarget).toRange();
          }

          return deleteContentEditableNode(toCaretPosition.getNode(true));
        }
      } else {
        ceTarget = fromCaretPosition.getNode();
        if (isBeforeContentEditableFalse(fromCaretPosition) && isBlock(ceTarget)) {
          if (isTextBlock(toBlock)) {
            if (isEmpty(toBlock)) {
              dom.remove(toBlock);
            }

            return CaretPosition.before(ceTarget).toRange();
          }

          return deleteContentEditableNode(fromCaretPosition.getNode());
        }
      }

      // Verify that both blocks are text blocks
      if (fromBlock === toBlock || !isTextBlock(fromBlock) || !isTextBlock(toBlock)) {
        return null;
      }

      while ((node = fromBlock.firstChild)) {
        toBlock.appendChild(node);
      }

      editor.dom.remove(fromBlock);

      return toCaretPosition.toRange();
    }

    function backspaceDelete(direction, beforeFn, afterFn, range) {
      var node, caretPosition, peekCaretPosition, newCaretPosition;

      if (!range.collapsed) {
        node = getSelectedNode(range);
        if (isContentEditableFalse(node)) {
          return renderRangeCaret(deleteContentEditableNode(node));
        } else {
          return null;
        }
      }

      caretPosition = getNormalizedRangeEndPoint(direction, range);

      if (afterFn(caretPosition) && CaretContainer.isCaretContainerBlock(range.startContainer)) {
        newCaretPosition = direction == -1 ? caretWalker.prev(caretPosition) : caretWalker.next(caretPosition);
        return newCaretPosition ? renderRangeCaret(newCaretPosition.toRange()) : range;
      }

      if (beforeFn(caretPosition)) {
        return renderRangeCaret(deleteContentEditableNode(caretPosition.getNode(direction == -1)));
      }

      peekCaretPosition = direction == -1 ? caretWalker.prev(caretPosition) : caretWalker.next(caretPosition);
      if (beforeFn(peekCaretPosition)) {
        if (direction === -1) {
          return mergeTextBlocks(direction, caretPosition, peekCaretPosition);
        }

        return mergeTextBlocks(direction, peekCaretPosition, caretPosition);
      }
    }

    function registerEvents() {
      var right = curry(moveH, 1, getNextVisualCaretPosition, isBeforeContentEditableFalse);
      var left = curry(moveH, -1, getPrevVisualCaretPosition, isAfterContentEditableFalse);
      var deleteForward = curry(backspaceDelete, 1, isBeforeContentEditableFalse, isAfterContentEditableFalse);
      var backspace = curry(backspaceDelete, -1, isAfterContentEditableFalse, isBeforeContentEditableFalse);
      var up = curry(moveV, -1, LineWalker.upUntil);
      var down = curry(moveV, 1, LineWalker.downUntil);

      function override(evt, moveFn) {
        if (evt.isDefaultPrevented() === false) {
          var range = moveFn(getRange());
          if (range) {
            evt.preventDefault();
            setRange(range);
          }
        }
      }

      function getContentEditableRoot(node) {
        var root = editor.getBody();

        while (node && node != root) {
          if (isContentEditableTrue(node) || isContentEditableFalse(node)) {
            return node;
          }

          node = node.parentNode;
        }

        return null;
      }

      function isXYWithinRange(clientX, clientY, range) {
        if (range.collapsed) {
          return false;
        }

        return Arr.reduce(range.getClientRects(), function (state, rect) {
          return state || ClientRect.containsXY(rect, clientX, clientY);
        }, false);
      }

      // Some browsers (Chrome) lets you place the caret after a cE=false
      // Make sure we render the caret container in this case
      editor.onMouseUp.add(function () {
        var range = getRange();

        if (range.collapsed) {
          setRange(renderCaretAtRange(range));
        }
      });

       editor.onClick.add(function (editor, e) {
        var contentEditableRoot;

        contentEditableRoot = getContentEditableRoot(e.target);

        if (contentEditableRoot) {
          // Prevent clicks on links in a cE=false element
          if (isContentEditableFalse(contentEditableRoot)) {
            e.preventDefault();
            editor.focus();
          }

          // Removes fake selection if a cE=true is clicked within a cE=false like the toc title
          if (isContentEditableTrue(contentEditableRoot)) {
            if (editor.dom.isChildOf(contentEditableRoot, editor.selection.getNode())) {
              removeContentEditableSelection();
            }
          }
        }
      });

      editor.onNewBlock.add(function () {
        removeContentEditableSelection();
        hideFakeCaret();
      });

      editor.onBlur.add(function () {
        removeContentEditableSelection();
        hideFakeCaret();
      });

      function handleTouchSelect(editor) {
        var moved = false;

        editor.dom.bind(editor.getBody(), 'touchstart', function () {
          moved = false;
        });

        editor.dom.bind(editor.getBody(), 'touchmove', function () {
          moved = true;
        });

        editor.dom.bind(editor.getBody(), 'touchend', function (e) {
          var contentEditableRoot = getContentEditableRoot(e.target);

          if (isContentEditableFalse(contentEditableRoot)) {
            if (!moved) {
              e.preventDefault();
              setContentEditableSelection(selectNode(contentEditableRoot));

              // fire fake event
              editor.onContentEditableSelect.dispatch(editor, e);
            }
          }
        });
      }

      var hasNormalCaretPosition = function (elm) {
        var caretWalker = new CaretWalker(elm);

        if (!elm.firstChild) {
          return false;
        }

        var startPos = CaretPosition.before(elm.firstChild);
        var newPos = caretWalker.next(startPos);

        return newPos && !isBeforeContentEditableFalse(newPos) && !isAfterContentEditableFalse(newPos);
      };

      var isInSameBlock = function (node1, node2) {
        var block1 = editor.dom.getParent(node1, editor.dom.isBlock);
        var block2 = editor.dom.getParent(node2, editor.dom.isBlock);
        return block1 === block2;
      };

      var isContentKey = function (e) {
        if (e.keyCode >= 112 && e.keyCode <= 123) {
          return false;
        }

        return true;
      };

      // Checks if the target node is in a block and if that block has a caret position better than the
      // suggested caretNode this is to prevent the caret from being sucked in towards a cE=false block if
      // they are adjacent on the vertical axis
      var hasBetterMouseTarget = function (targetNode, caretNode) {
        var targetBlock = editor.dom.getParent(targetNode, editor.dom.isBlock);
        var caretBlock = editor.dom.getParent(caretNode, editor.dom.isBlock);

        return targetBlock && !isInSameBlock(targetBlock, caretBlock) && hasNormalCaretPosition(targetBlock);
      };

      handleTouchSelect(editor);

      editor.onMouseDown.add(function (editor, e) {
        var contentEditableRoot;

        contentEditableRoot = getContentEditableRoot(e.target);

        if (contentEditableRoot) {
          if (isContentEditableFalse(contentEditableRoot)) {
            e.preventDefault();
            setContentEditableSelection(selectNode(contentEditableRoot));

            // fire fake event
            editor.onContentEditableSelect.dispatch(editor, e);
          } else {
            if (!isXYWithinRange(e.clientX, e.clientY, editor.selection.getRng())) {
              editor.selection.placeCaretAt(e.clientX, e.clientY);
            }
          }
        } else {
          // Remove needs to be called here since the mousedown might alter the selection without calling selection.setRng
          // and therefore not fire the AfterSetSelectionRange event.
          removeContentEditableSelection();
          hideFakeCaret();

          var caretInfo = LineUtils.closestCaret(rootNode, e.clientX, e.clientY);
          if (caretInfo) {
            if (!hasBetterMouseTarget(e.target, caretInfo.node)) {
              e.preventDefault();
              editor.getBody().focus();
              setRange(showCaret(1, caretInfo.node, caretInfo.before));
            }
          }
        }
      });

      editor.onKeyDown.add(function (editor, e) {
        if (VK.modifierPressed(e)) {
          return;
        }

        switch (e.keyCode) {
          case VK.RIGHT:
            override(e, right);
            break;

          case VK.DOWN:
            override(e, down);
            break;

          case VK.LEFT:
            override(e, left);
            break;

          case VK.UP:
            override(e, up);
            break;

          case VK.DELETE:
            override(e, deleteForward);
            break;

          case VK.BACKSPACE:
            override(e, backspace);
            break;

          default:          
            if (isContentEditableFalse(editor.selection.getNode()) && isContentKey(e)) {
              e.preventDefault();
            }
            break;
        }
      });

      function paddEmptyContentEditableArea() {
        var br, ceRoot = getContentEditableRoot(editor.selection.getNode());

        if (isContentEditableTrue(ceRoot) && isBlock(ceRoot) && editor.dom.isEmpty(ceRoot)) {
          br = editor.dom.create('br', {
            "data-mce-bogus": "1"
          });

          editor.dom.empty(ceRoot);
          editor.dom.add(ceRoot, br);

          editor.selection.setRng(CaretPosition.before(br).toRange());
        }
      }

      function handleBlockContainer(e) {
        var blockCaretContainer = getBlockCaretContainer();

        if (!blockCaretContainer) {
          return;
        }

        if (e.type == 'compositionstart') {
          e.preventDefault();
          e.stopPropagation();
          showBlockCaretContainer(blockCaretContainer);
          return;
        }

        if (CaretContainer.hasContent(blockCaretContainer)) {
          showBlockCaretContainer(blockCaretContainer);
        }
      }

      function handleEmptyBackspaceDelete(e) {
        var prevent;

        switch (e.keyCode) {
          case VK.DELETE:
            prevent = paddEmptyContentEditableArea();
            break;

          case VK.BACKSPACE:
            prevent = paddEmptyContentEditableArea();
            break;
        }

        if (prevent) {
          e.preventDefault();
        }
      }

      // Must be added to "top" since undoManager needs to be executed after
      editor.onCompositionStart.addToTop(function (editor, e) {
        handleBlockContainer(e);
        handleEmptyBackspaceDelete(e);
      });

      editor.onKeyUp.addToTop(function (editor, e) {
        handleBlockContainer(e);
        handleEmptyBackspaceDelete(e);
      });

      editor.onCut.add(function () {
        var node = editor.selection.getNode();

        if (isContentEditableFalse(node)) {
          setEditorTimeout(editor, function () {
            setRange(renderRangeCaret(deleteContentEditableNode(node)));
          });
        }
      });

      editor.selection.onGetSelectionRange.add(function (sel, e) {
        var rng = e.range;

        if (selectedContentEditableNode) {
          if (!selectedContentEditableNode.parentNode) {
            // The selected node was removed from the DOM, clean up the offscreen container as well
            removeContentEditableSelection();
            return;
          }

          rng = rng.cloneRange();
          rng.selectNode(selectedContentEditableNode);
          e.range = rng;
        }
      });

      editor.selection.onSetSelectionRange.add(function (sel, e) {
        var rng;

        rng = setContentEditableSelection(e.range);

        if (rng) {
          e.range = rng;
        }
      });

      editor.selection.onAfterSetSelectionRange.add(function (sel, e) {
        var rng = e.range;

        if (!isRangeInCaretContainer(rng)) {
          hideFakeCaret();
        }

        if (!isFakeSelectionElement(rng.startContainer.parentNode)) {
          removeContentEditableSelection();
        }
      });

      editor.dom.bind(editor.getBody(), 'focus', function () {
        // Make sure we have a proper fake caret on focus
        setEditorTimeout(editor, function () {
          editor.selection.setRng(renderRangeCaret(editor.selection.getRng()));
        }, 0);
      });

      editor.onCopy.add(function (editor, e) {
        var clipboardData = e.clipboardData;

        // Make sure we get proper html/text for the fake cE=false selection
        if (!e.isDefaultPrevented() && e.clipboardData) {
          var realSelectionElement = getRealSelectionElement();

          if (realSelectionElement) {
            e.preventDefault();
            clipboardData.clearData();

            var html = realSelectionElement.outerHTML || '';

            clipboardData.setData('text/html', html);
            // set internal html data
            clipboardData.setData('x-tinymce/html', html);
            clipboardData.setData('text/plain', realSelectionElement.outerText);
          }
        }
      });

      DragDropOverrides.init(editor);
    }

    /*function addCss() {
      var styles = editor.contentStyles,
        rootClass = '.mceContentBody';

      styles.push(fakeCaret.getCss());
      styles.push(
        rootClass + ' .mce-offscreen-selection {' +
        'position: absolute;' +
        'left: -9999999999px;' +
        'max-width: 1000000px;' +
        '}' +
        rootClass + ' *[contentEditable=false] {' +
        'cursor: default;' +
        '}' +
        rootClass + ' *[contentEditable=true] {' +
        'cursor: text;' +
        '}'
      );
    }*/

    function isWithinCaretContainer(node) {
      return (
        CaretContainer.isCaretContainer(node) ||
        CaretContainer.startsWithCaretContainer(node) ||
        CaretContainer.endsWithCaretContainer(node)
      );
    }

    function isRangeInCaretContainer(rng) {
      return isWithinCaretContainer(rng.startContainer) || isWithinCaretContainer(rng.endContainer);
    }

    function setContentEditableSelection(range) {
      var node, dom = editor.dom,
        $realSelectionContainer, sel,
        startContainer, startOffset, endOffset, caretPosition, targetClone;

      if (!range) {
        return null;
      }

      if (range.collapsed) {
        if (!isRangeInCaretContainer(range)) {
          caretPosition = getNormalizedRangeEndPoint(1, range);

          if (isContentEditableFalse(caretPosition.getNode())) {
            return showCaret(1, caretPosition.getNode(), !caretPosition.isAtEnd());
          }

          if (isContentEditableFalse(caretPosition.getNode(true))) {
            return showCaret(1, caretPosition.getNode(true), false);
          }
        }

        return null;
      }

      startContainer = range.startContainer;
      startOffset = range.startOffset;
      endOffset = range.endOffset;

      // Normalizes <span cE=false>[</span>] to [<span cE=false></span>]
      if (startContainer.nodeType == 3 && startOffset == 0 && isContentEditableFalse(startContainer.parentNode)) {
        startContainer = startContainer.parentNode;
        startOffset = dom.nodeIndex(startContainer);
        startContainer = startContainer.parentNode;
      }

      if (startContainer.nodeType != 1) {
        return null;
      }

      if (endOffset == startOffset + 1) {
        node = startContainer.childNodes[startOffset];
      }

      if (!isContentEditableFalse(node)) {
        return null;
      }

      targetClone = node.cloneNode(true);

      var evt = {
        node: node,
        target: targetClone
      };

      editor.onObjectSelected.dispatch(editor, evt);

      if (!evt.isDefaultPrevented === false) {
        return null;
      }

      targetClone = evt.target;

      $realSelectionContainer = dom.get(realSelectionId);

      if (!$realSelectionContainer) {
        $realSelectionContainer = dom.create('div', { 'data-mce-bogus': 'all', 'class': 'mce-offscreen-selection', 'id': realSelectionId });
        dom.add(editor.getBody(), $realSelectionContainer);
      }

      range = editor.dom.createRng();

      $realSelectionContainer.innerHTML = '';

      $realSelectionContainer.appendChild(document.createTextNode('\u00a0'));
      $realSelectionContainer.appendChild(targetClone);
      $realSelectionContainer.appendChild(document.createTextNode('\u00a0'));

      range.setStart($realSelectionContainer.firstChild, 1);
      range.setEnd($realSelectionContainer.lastChild, 0);

      dom.setStyle($realSelectionContainer, 'top', dom.getPos(node, editor.getBody()).y);

      $realSelectionContainer.focus();
      sel = editor.selection.getSel();
      sel.removeAllRanges();
      sel.addRange(range);

      dom.setAttrib(dom.select('*[data-mce-selected]'), 'data-mce-selected', null);

      node.setAttribute('data-mce-selected', 1);
      selectedContentEditableNode = node;
      hideFakeCaret();

      return range;
    }

    function removeContentEditableSelection() {
      if (selectedContentEditableNode) {
        selectedContentEditableNode.removeAttribute('data-mce-selected');
        selectedContentEditableNode = null;
      }

      // Always remove the offscreen container, the selected node reference can be
      // cleared or become detached while the container is still in the DOM
      editor.dom.remove(realSelectionId);
    }

    function destroy() {
      fakeCaret.destroy();
      removeContentEditableSelection();
    }

    function hideFakeCaret() {
      fakeCaret.hide();
    }

    registerEvents();
    //addCss();

    return {
      showBlockCaretContainer: showBlockCaretContainer,
      hideFakeCaret: hideFakeCaret,
      destroy: destroy
    };
  };

})(tinymce);