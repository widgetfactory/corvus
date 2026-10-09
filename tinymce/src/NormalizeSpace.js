/**
 * Copyright (c) 2009–2026 Ryan Demmer. All rights reserved.
 *
 * Licensed under the GNU General Public License version 2 or later (GPL v2+):
 * https://www.gnu.org/licenses/gpl-2.0.html
 */


(function (tinymce) {
  var TreeWalker = tinymce.dom.TreeWalker;

  /**
   * Replaces an nbsp inserted by the browser for a typed space with a normal space when it sits between two non-whitespace chars.
   */
  tinymce.NormalizeSpace = function (editor) {
    var dom = editor.dom, selection = editor.selection, pending = null;

    function isWhiteSpace(chr) {
      return /[\s ]/.test(chr);
    }

    // stop at blocks, br, embedded content and non-editable content
    function isBoundary(node) {
      if (dom.getContentEditableParent(node.nodeType === 3 ? node.parentNode : node) === 'false') {
        return true;
      }

      return node.nodeType === 1 && (dom.isBlock(node) || /^(BR|IMG|HR|INPUT|SELECT|TEXTAREA|IFRAME|VIDEO|AUDIO|OBJECT|EMBED|SVG)$/i.test(node.nodeName));
    }

    // nearest char before or after a text position, through inline elements within the block
    function adjacentChar(textNode, offset, forward) {
      var value, block, walker, node, chr;

      chr = forward ? textNode.nodeValue.substring(offset).replace(/​/g, '').charAt(0) : textNode.nodeValue.substring(0, offset).replace(/​/g, '').slice(-1);

      if (chr) {
        return chr;
      }

      block = dom.getParent(textNode, dom.isBlock) || editor.getBody();
      walker = new TreeWalker(textNode, block);

      while ((node = forward ? walker.next() : walker.prev2())) {
        if (isBoundary(node)) {
          return null;
        }

        if (node.nodeType === 3) {
          value = node.nodeValue.replace(/​/g, '');

          if (value) {
            return forward ? value.charAt(0) : value.charAt(value.length - 1);
          }
        }
      }

      return null;
    }

    // returns false if there is no following char yet so the check can be repeated
    function normalize(textNode, index) {
      var before, after, rng, container, offset;

      if (!textNode.parentNode || textNode.nodeValue.charAt(index) !== ' ') {
        return true;
      }

      after = adjacentChar(textNode, index + 1, true);

      if (after === null) {
        return false;
      }

      before = adjacentChar(textNode, index, false);

      if (!before || isWhiteSpace(before) || isWhiteSpace(after)) {
        return true;
      }

      rng = selection.getRng(true);
      container = rng.startContainer;
      offset = rng.startOffset;

      textNode.replaceData(index, 1, ' ');

      // replaceData moves a caret inside the replaced range, length is unchanged so restore it
      if (container === textNode) {
        rng = dom.createRng();
        rng.setStart(container, offset);
        rng.collapse(true);
        selection.setRng(rng);
      }

      return true;
    }

    if (!editor.getParam('normalize_space', true)) {
      return;
    }

    editor.onKeyDown.add(function (ed, e) {
      // plain space only, not modified space (nbsp shortcut) or IME composition
      if (e.keyCode === 32 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.isComposing) {
        pending = { space: true };
      }
    });

    editor.onKeyUp.add(function (ed, e) {
      var rng = selection.getRng(true), node = rng.startContainer, offset = rng.startOffset, current = pending;

      pending = null;

      if (!current || !rng.collapsed || node.nodeType !== 3) {
        return;
      }

      // space just typed, the nbsp is directly before the caret
      if (current.space) {
        if (!normalize(node, offset - 1)) {
          pending = { node: node, index: offset - 1 };
        }

        return;
      }

      // next char typed after a space that had nothing following it
      if (current.node === node && offset === current.index + 2) {
        normalize(node, current.index);
      }
    });
  };
})(tinymce);
