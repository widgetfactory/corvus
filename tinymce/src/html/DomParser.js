/**
 * Originally based on TinyMCE 3.x/4.x/5.x
 * Includes modified code from TinyMCE 7.x, licensed under the GNU General Public License v2.0 or later
 * @code https://github.com/tinymce/tinymce/tree/main/modules/tinymce/src/core/main/ts/api/html/DomParser.ts
 * @code https://github.com/tinymce/tinymce/tree/main/modules/tinymce/src/core/main/ts/html/InvalidNodes.ts
 * @code https://github.com/tinymce/tinymce/tree/main/modules/tinymce/src/core/main/ts/html/ParserFilters.ts
 *
 * Copyright (c) Moxiecode Systems AB
 * Copyright (c) 1999–2025 Ephox Corporation. All rights reserved.
 * Licensed under the GNU Lesser General Public License v2.1 or later.
 * See LICENSE.TXT in the original TinyMCE project.
 *
 * This version:
 * Copyright (c) 2025 Ryan Demmer
 * Relicensed under the GNU General Public License v2.0 or later,
 * as permitted by Section 3 of the LGPL.
 *
 * See LICENSE for GPL terms.
 */

(function (tinymce) {
  var Node = tinymce.html.Node,
    TransparentElements = tinymce.html.TransparentElements,
    InvalidNodes = tinymce.html.InvalidNodes,
    FilterNode = tinymce.html.FilterNode,
    each = tinymce.each,
    explode = tinymce.explode,
    extend = tinymce.extend,
    makeMap = tinymce.makeMap;

  var NBSP = '\u00A0';

  /**
   * This class parses HTML code into a DOM like structure of nodes it will remove redundant whitespace and make
   * sure that the node tree is valid according to the specified schema. So for example: <p>a<p>b</p>c</p> will become <p>a</p><p>b</p><p>c</p>
   *
   * @example
   * var parser = new tinymce.html.DomParser({validate: true}, schema);
   * var rootNode = parser.parse('<h1>content</h1>');
   *
   * @class tinymce.html.DomParser
   */

  /**
   * Constructs a new DomParser instance.
   *
   * @constructor
   * @method DomParser
   * @param {Object} settings Name/value collection of settings. comment, cdata, text, start and end are callbacks.
   * @param {tinymce.html.Schema} schema HTML Schema class to use when parsing.
   */
  tinymce.html.DomParser = function (settings, schema) {
    var self = this,
      nodeFilters = [],
      attributeFilters = [];

    settings = settings || {};
    settings.validate = "validate" in settings ? settings.validate : true;
    settings.root_name = settings.root_name || 'body';
    self.schema = schema = schema || new tinymce.html.Schema();

    settings.sanitize_html = "sanitize_html" in settings ? settings.sanitize_html : true;

    var Sanitizer = new tinymce.html.Sanitizer(settings, schema);
    var nativeParser = new DOMParser();

    /**
     * Finds invalid children of a node according to the schema.
     * Populates the `invalids` array with nodes that are not allowed in their parent.
     *
     * @param {Node} node - The root node to validate from.
     * @param {Array} invalids - Accumulator array for invalid children.
     */
    function findInvalidChildren(node, invalids) {
      if (InvalidNodes.isInvalid(schema, node)) {
        invalids.push(node);
      }
    }

    /**
     * Adds a node filter function to the parser, the parser will collect the specified nodes by name
     * and then execute the callback ones it has finished parsing the document.
     *
     * @example
     * parser.addNodeFilter('p,h1', function(nodes, name) {
     *		for (var i = 0; i < nodes.length; i++) {
     *			console.log(nodes[i].name);
     *		}
     * });
     * @method addNodeFilter
     * @method {String} name Comma separated list of nodes to collect.
     * @param {function} callback Callback function to execute once it has collected nodes.
     */
    self.addNodeFilter = function (name, callback) {
      each(explode(name), function (name) {
        var i;

        for (i = 0; i < nodeFilters.length; i++) {
          if (nodeFilters[i].name === name) {
            nodeFilters[i].callbacks.push(callback);
            return;
          }
        }

        nodeFilters.push({
          name: name,
          callbacks: [callback]
        });
      });
    };

    /**
     * Adds a attribute filter function to the parser, the parser will collect nodes that has the specified attributes
     * and then execute the callback ones it has finished parsing the document.
     *
     * @example
     * parser.addAttributeFilter('src,href', function(nodes, name) {
     *		for (var i = 0; i < nodes.length; i++) {
     *			console.log(nodes[i].name);
     *		}
     * });
     * @method addAttributeFilter
     * @method {String} name Comma separated list of nodes to collect.
     * @param {function} callback Callback function to execute once it has collected nodes.
     */
    self.addAttributeFilter = function (name, callback) {
      each(explode(name), function (name) {
        var i;

        for (i = 0; i < attributeFilters.length; i++) {
          if (attributeFilters[i].name === name) {
            attributeFilters[i].callbacks.push(callback);
            return;
          }
        }

        attributeFilters.push({
          name: name,
          callbacks: [callback]
        });
      });
    };

    /**
     * Parses the specified HTML string into a DOM like node tree and returns the result.
     *
     * @example
     * var rootNode = new DomParser({...}).parse('<b>text</b>');
     * @method parse
     * @param {String} html Html string to sax parse.
     * @param {Object} args Optional args object that gets passed to all filter functions.
     * @return {tinymce.html.Node} Root node containing the tree.
     */
    self.parse = function (html, args) {
      var rootNode, validate;
      var blockElements, startWhiteSpaceRegExp, invalidChildren = [];

      var endWhiteSpaceRegExp, allWhiteSpaceRegExp, whitespaceElements, textRootBlockElements, shortEndedElements;
      var nonEmptyElements, rootBlockName;

      args = args || {};
      blockElements = extend(makeMap('script,style,head,html,body,title,meta,param'), schema.getBlockElements());
      nonEmptyElements = schema.getNonEmptyElements();
      shortEndedElements = schema.getShortEndedElements();
      validate = settings.validate;
      rootBlockName = "forced_root_block" in args ? args.forced_root_block : settings.forced_root_block;

      whitespaceElements = schema.getWhiteSpaceElements();
      textRootBlockElements = schema.getTextRootBlockElements();

      startWhiteSpaceRegExp = /^[ \t\r\n]+/;
      endWhiteSpaceRegExp = /[ \t\r\n]+$/;
      allWhiteSpaceRegExp = /[ \t\r\n]+/g;

      /**
       * Checks if any ancestor node preserves whitespace (e.g., <pre>, <code>).
       * @param {tinymce.html.Node} node - The node to inspect.
       * @returns {boolean} True if any parent element preserves whitespace.
       */
      function hasWhitespaceParent(node) {
        var temp = node.parent;

        while (temp) {
          // `whitespaceElements` comes from schema.getWhiteSpaceElements(),
          // and includes script, style, pre, textarea, etc.
          if (whitespaceElements[temp.name]) {
            return true;
          }

          temp = temp.parent;
        }

        return false;
      }

      /**
       * Determines if the current node resides within an empty text-root block.
       * Walks up until a text-root block element is found, then tests emptiness.
       * @param {tinymce.html.Node} node - The node to check.
       * @returns {boolean} True if that text-root block is empty.
       */
      function isTextRootBlockEmpty(node) {
        var tempNode = node;

        while (tempNode) {
          if (textRootBlockElements[tempNode.name]) {
            return isEmpty(tempNode);
          }

          tempNode = tempNode.parent;
        }
        return false;
      }

      /**
       * Tests whether a node is block-level according to schema rules.
       * @param {tinymce.html.Node} node - Node to test.
       * @returns {boolean} True if the node is a block element.
       */
      function isBlock(node) {
        return node.name in blockElements || TransparentElements.isTransparentBlock(schema, node);
      }

      /**
       * Checks if a node lies at the start or end edge of its block parent.
       * Helpful for trimming whitespace at block boundaries.
       * @param {tinymce.html.Node} node - Node to evaluate.
       * @param {boolean} start - True to test start edge, false for end edge.
       * @param {tinymce.html.Node} root - Root context node.
       * @returns {boolean} True if node is at specified edge of block.
       */
      function isAtEdgeOfBlock(node, start) {
        var neighbour = start ? node.prev : node.next;

        if (neighbour || !node.parent) {
          return false;
        }

        return isBlock(node.parent) && (node.parent !== rootNode || args.isRootContent === true);
      }

      /**
       * Identifies line-break candidates: next to a block boundary or a <br> tag.
       * @param {tinymce.html.Node} node - Node to test.
       * @param {Function} isBlockFn - Function to determine block nodes.
       * @returns {boolean} True if node acts as a line break.
       */
      function walkTree(root, preprocessors, postprocessors) {
        var traverseOrder = [];
        var node = root, lastNode = root;

        while (node) {
          var tempNode = node;

          for (var i = 0; i < preprocessors.length; i++) {
            preprocessors[i](tempNode);
          }

          if ((!tempNode.parent) && tempNode !== root) {
            node = lastNode;
          } else {
            traverseOrder.push(tempNode);
          }

          lastNode = node;
          node = node.walk();
        }

        for (var i = traverseOrder.length - 1; i >= 0; i--) {
          var postNode = traverseOrder[i];
          for (var j = 0; j < postprocessors.length; j++) {
            postprocessors[j](postNode);
          }
        }
      }

      /**
       * Pads an empty node: inserts <br> for blocks or a non-breaking space for inline.
       * @param {tinymce.html.Node} node - The empty node to pad or replace.
       */
      function paddEmptyNode(node) {
        var brPreferred = settings.pad_empty_with_br || args.insert;

        if (brPreferred && isBlock(node)) {
          var newNode = new Node('br', 1);
          newNode.shortEnded = true;

          if (args.insert) {
            newNode.attr('data-mce-bogus', '1');
          }

          node.empty().append(newNode);
        } else {
          var nbspNode = new Node('#text', 3);
          nbspNode.value = NBSP;
          node.empty().append(nbspNode);
        }
      }

      /**
       * Checks if node has exactly one child of given name.
       * @param {tinymce.html.Node} node - Node to inspect.
       * @param {string} name - Child node name to match.
       * @returns {boolean} True if only child matches name.
       */
      function hasOnlyChild(node, name) {
        var firstChild = node.firstChild;
        return !!firstChild && firstChild === node.lastChild && firstChild.name === name;
      }

      /**
       * Detects if a node contains a single non-breaking space as its child.
       * @param {tinymce.html.Node} node - Node to inspect.
       * @returns {boolean} True if node is padded with &nbsp; only.
       */
      function isPaddedWithNbsp(node) {
        return hasOnlyChild(node, '#text') && node.firstChild && node.firstChild.value === NBSP;
      }

      /**
       * Determines if a node is a line break node.
       * @param {tinymce.html.Node} node - Node to inspect.
       * @param {boolean} isBlock - Function to check if a node is block-level. 
       * @returns {boolean} True if node is a line break or <br>.
       */
      function isLineBreakNode(node, isBlock) {
        return node && (isBlock(node) || node.name === 'br');
      }

      /**
       * Determines if a node is empty according to schema rules.
       * @param {tinymce.html.Node} node - Node to inspect.
       * @returns {boolean} True if node is empty.
       */
      function isEmpty(node) {
        return node.isEmpty(nonEmptyElements, whitespaceElements);
      }

      /**
       * Creates pre- and post-processors to normalize whitespace in text nodes.
       * Removes redundant spaces and pads/unwraps empty inline and block elements as needed.
       *
       * @param {Node} root - The root node of the parsed document.
       * @return {[Function, Function]} Array containing preprocessor and postprocessor functions.
       */
      function whitespaceCleaner(root) {

        function preprocess(node) {
          if (node.type === 3) {

            if (!hasWhitespaceParent(node)) {
              var text = node.value || '';
              text = text.replace(allWhiteSpaceRegExp, ' ');

              if (isLineBreakNode(node.prev, isBlock) || isAtEdgeOfBlock(node, true, root)) {
                text = text.replace(startWhiteSpaceRegExp, '');
              }

              if (text.length === 0) {
                node.remove();
              } else {
                node.value = text;
              }
            }
          }
        }

        function postprocess(node) {
          if (node.type === 1) {
            var elementRule = schema.getElementRule(node.name);

            if (validate && elementRule) {
              var isNodeEmpty = isEmpty(node);

              if (elementRule.paddInEmptyBlock && isNodeEmpty && isTextRootBlockEmpty(node)) {
                paddEmptyNode(node);
              } else if (elementRule.removeEmpty && isNodeEmpty) {
                if (isBlock(node)) {
                  node.remove();
                } else {
                  node.unwrap();
                }
              } else if (elementRule.paddEmpty && (isNodeEmpty || isPaddedWithNbsp(node))) {
                paddEmptyNode(node);
              }
            }
          } else if (node.type === 3) {
            if (!hasWhitespaceParent(node)) {
              var text = node.value || '';

              if ((node.next && isBlock(node.next)) || isAtEdgeOfBlock(node, false)) {
                text = text.replace(endWhiteSpaceRegExp, '');
              }

              if (text.length === 0) {
                node.remove();
              } else {
                node.value = text;
              }
            }
          }
        }

        return [preprocess, postprocess];
      }

      /**
       * Parses and sanitizes an HTML fragment in its proper context.
       *
       * 1. Wraps the raw `html` string in a temporary root element (<body> or
       *    a special element defined by the schema) so that fragments like
       *    `<tr>…</tr>` parse correctly.
       * 2. Uses the native DOMParser (with the correct MIME type for `format`)
       *    to turn that string into a real DOM tree.
       * 3. Passes the resulting `<body>` element through DomPurify to strip
       *    unsafe tags/attributes.
       * 4. Returns either the sanitized body or, if it was a “special” root,
       *    the first child of that body (so you get back the wrapper element).
       *
       * @param {String} html     - The raw HTML to parse.
       * @param {String} rootName - Tag to use as the fragment root (e.g. 'table', 'tr').
       * @param {String} format   - Either 'html' or 'xhtml', which picks the parsing MIME type.
       * @return {Element}        - The sanitized DOM element (body or its firstChild).
       */
      function parseAndSanitizeWithContext(html, rootName, format) {
        var mimeType = format === 'xhtml' ? 'application/xhtml+xml' : 'text/html';
        var specialElements = schema.getSpecialElements();

        // Determine the root element to wrap the HTML in when parsing. If we're dealing with a
        // special element then we need to wrap it so the internal content is handled appropriately.
        var isSpecialRoot = specialElements[rootName.toLowerCase()] ? true : false;

        var content = isSpecialRoot ? `<${rootName}>${html}</${rootName}>` : html;

        const makeWrap = function () {
          if (format === 'xhtml') {
            // If parsing XHTML then the content must contain the xmlns declaration, see https://www.w3.org/TR/xhtml1/normative.html#strict
            return `<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>${content}</body></html>`;
          } else if (/^[\s]*<head/i.test(html) || /^[\s]*<html/i.test(html) || /^[\s]*<!DOCTYPE/i.test(html)) {
            return `<html>${content}</html>`;
          } else {
            return `<body>${content}</body>`;
          }
        };

        var body = nativeParser.parseFromString(makeWrap(), mimeType).body;

        body = Sanitizer.sanitize(body, mimeType);

        return isSpecialRoot ? body.firstChild : body;
      }

      /**
       * Transfers children from a native DOM element to a TinyMCE Node tree,
       * optionally skipping over disallowed attributes and handling special cases.
       *
       * @param {Node} parent - The TinyMCE Node to populate.
       * @param {Element} nativeParent - The native browser DOM element.
       * @param {Object} specialElements - A map of element names considered special (e.g., script, textarea).
       */
      function transferChildren(parent, nativeParent, specialElements) {
        var parentName = parent.name;

        // Exclude the special elements where the content is RCDATA as their content needs to be parsed instead of being left as plain text
        // See: https://html.spec.whatwg.org/multipage/parsing.html#parsing-html-fragments
        var isSpecial = parentName in specialElements && parentName !== 'title' && parentName !== 'textarea' && parentName !== 'noscript';

        var childNodes = nativeParent.childNodes;

        for (var ni = 0, nl = childNodes.length; ni < nl; ni++) {
          var nativeChild = childNodes[ni], nodeType = nativeChild.nodeType, nodeName = nativeChild.nodeName.toLowerCase();

          var newNode = new Node(nodeName, nodeType);

          if (nodeType == 1) { // ELEMENT_NODE
            var attributes = Array.from(nativeChild.attributes);

            if (settings.sanitize_html) {
              // DOMPurify will reverse the order of attributes, so we need to reverse it back
              //attributes.reverse();
            }

            for (var ai = 0, al = attributes.length; ai < al; ai++) {
              var attr = attributes[ai];
              newNode.attr(attr.name, attr.value);
            }

            newNode.shortEnded = nodeName in shortEndedElements || false;

            if (nodeName === 'template') {
              // Recurse into the fragment children, but keep <template> itself
              transferChildren(newNode, nativeChild.content, specialElements);
              parent.append(newNode);
              continue; // prevent falling through and recursing into the element itself
            }
          }

          if (nodeType == 3) { // TEXT_NODE
            newNode.value = nativeChild.data;

            if (isSpecial) {
              newNode.raw = true;
            }
          }

          if (nodeType == 8 || nodeType == 4 || nodeType == 7 || nodeType == 11) { // COMMENT_NODE, CDATA_SECTION_NODE, PROCESSING_INSTRUCTION_NODE, DOCUMENT_FRAGMENT_NODE           
            var value = nativeChild.data;

            if (nodeType == 8) { // COMMENT_NODE
              // If conditional comments are not allowed then prefix with a space
              if (!settings.allow_conditional_comments && value.toLowerCase().indexOf('[if') === 0) {
                value = ' ' + value;
              }
            }

            newNode.value = value;
          }

          transferChildren(newNode, nativeChild, specialElements);

          parent.append(newNode);
        }
      }

      /**
       * Wraps consecutive inline or text nodes into forced block elements.
       * Ensures top-level content is enclosed in the configured root block (e.g., <p>).
       * Trims leading and trailing whitespace within each created block for cleanliness.
       *
       * @method addRootBlocks
       * @private
       */
      function addRootBlocks(rootNode, rootBlockName) {
        var node = rootNode.firstChild, rootBlockNode = null;

        function isWrappableNode(node) {
          // text node with non-whitespace
          if (node.type === 3) {
            return !!tinymce.trim(node.value);
          }

          if (node.type === 1) {
            // never wrap template
            if (node.name === 'template') {
              return false;
            }

            // don't wrap blocks or <p> itself
            if (node.name === 'p' || blockElements[node.name]) {
              return false;
            }

            // don't wrap special editor artifacts
            if (node.attr('data-mce-type')) {
              return false;
            }

            // optional: treat contenteditable=false as a boundary
            if (node.attr('contenteditable') === 'false') {
              return false;
            }

            return true; // phrasing/inline-ish
          }

          return false;
        }

        // Removes whitespace at beginning and end of block so:
        // <p> x </p> -> <p>x</p>
        function trim(rootBlock) {
          if (rootBlock) {
            node = rootBlock.firstChild;
            if (node && node.type === 3) {
              node.value = node.value.replace(startWhiteSpaceRegExp, '');
            }

            node = rootBlock.lastChild;
            if (node && node.type === 3) {
              node.value = node.value.replace(endWhiteSpaceRegExp, '');
            }
          }
        }

        // Check if rootBlock is valid within rootNode for example if P is valid in H1 if H1 is the contentEditable root
        if (!schema.isValidChild(rootNode.name, rootBlockName.toLowerCase())) {
          return;
        }

        while (node) {
          var next = node.next;

          if (isWrappableNode(node)) {
            if (!rootBlockNode) {
              // Create a new root block element
              rootBlockNode = new Node(rootBlockName, 1);
              rootBlockNode.attr(settings.forced_root_block_attrs);
              rootNode.insert(rootBlockNode, node);
              rootBlockNode.append(node);
            } else {
              rootBlockNode.append(node);
            }
          } else {
            trim(rootBlockNode);
            rootBlockNode = null;
          }

          node = next;
        }

        trim(rootBlockNode);
      }

      var rootName = (args.context || settings.root_name).toLowerCase();

      var element = parseAndSanitizeWithContext(html, rootName, args.format);

      TransparentElements.updateChildren(schema, element);

      rootNode = new Node(rootName, 11);

      transferChildren(rootNode, element, schema.getSpecialElements());

      // empty element to prevent memory leak
      element.innerHTML = '';

      // Run whitespace and filter passes
      var [whitespacePre, whitespacePost] = whitespaceCleaner(rootNode);

      var invalidFinder = validate ? function (node) {
        findInvalidChildren(node, invalidChildren);
      } : function () { };

      var matches = { nodes: {}, attributes: {} };

      var matchFinder = function (node) {
        FilterNode.matchNode(nodeFilters, attributeFilters, node, matches);
      };

      walkTree(rootNode, [whitespacePre, matchFinder], [whitespacePost, invalidFinder]);

      // Reverse collected invalid children for bottom-up cleanup
      invalidChildren.reverse();

      // Fix invalid children or report invalid children in a contextual parsing
      if (validate && invalidChildren.length) {
        if (args.context) {
          var topLevelChildren = [];
          var otherChildren = [];

          for (var i = 0; i < invalidChildren.length; i++) {
            var child = invalidChildren[i];

            if (child.parent === rootNode) {
              topLevelChildren.push(child);
            } else {
              otherChildren.push(child);
            }
          }

          InvalidNodes.cleanInvalidNodes(otherChildren, schema, rootNode, matchFinder);

          args.invalid = topLevelChildren.length > 0;
        } else {
          InvalidNodes.cleanInvalidNodes(invalidChildren, schema, rootNode, matchFinder);
        }
      }

      // Wrap nodes in the root into block elements if the root is body
      if (rootBlockName && (rootNode.name == 'body' || args.isRootContent)) {
        addRootBlocks(rootNode, rootBlockName);
      }

      // Run filters only when the contents is valid
      if (!args.invalid) {
        FilterNode.runFilters(matches, args);
      }

      return rootNode;
    };

    // Remove <br> at end of block elements Gecko and WebKit injects BR elements to
    // make it possible to place the caret inside empty blocks. This logic tries to remove
    // these elements and keep br elements that where intended to be there intact
    if (settings.remove_trailing_brs) {
      self.addNodeFilter('br', function (nodes) {
        var i, l = nodes.length,
          node, blockElements = extend({}, schema.getBlockElements());
        var nonEmptyElements = schema.getNonEmptyElements(), whitespaceElements = schema.getWhiteSpaceElements(), transparentElements = schema.getTransparentElements(),
          parent, prev, prevName;
        var textNode, elementRule;

        // Remove brs from body element as well
        blockElements.body = 1;

        function isBlock(node) {
          return node.name in blockElements || node.name in transparentElements;
        }

        // Must loop forwards since it will otherwise remove all brs in <p>a<br><br><br></p>
        for (i = 0; i < l; i++) {
          node = nodes[i];
          parent = node.parent;

          if (parent && isBlock(parent) && node === parent.lastChild) {
            // Loop all nodes to the left of the current node and check for other BR elements
            // excluding bookmarks since they are invisible
            prev = node.prev;

            while (prev) {
              prevName = prev.name;

              // Ignore bookmarks
              if (prevName !== 'span' || prev.attr('data-mce-type') !== 'bookmark') {
                // Found another br it's a <br><br> structure then don't remove anything
                if (prevName === 'br') {
                  node = null;
                }
                break;
              }

              prev = prev.prev;
            }

            if (node) {

              // skip breaks with attributes
              if (node.attributes.length && node.attributes[0].name !== 'data-mce-bogus') {
                continue;
              }

              node.remove();

              // Is the parent to be considered empty after we removed the BR
              if (parent.isEmpty(nonEmptyElements, whitespaceElements)) {
                elementRule = schema.getElementRule(parent.name);

                // Remove or padd the element depending on schema rule
                if (elementRule) {
                  if (elementRule.removeEmpty) {
                    parent.remove();
                  } else if (elementRule.paddEmpty) {
                    parent.empty().append(new Node('#text', 3)).value = '\u00a0';
                  }
                }
              }
            }
          } else {
            // Replaces BR elements inside inline elements like <p><b><i><br></i></b></p>
            // so they become <p><b><i>&nbsp;</i></b></p>
            let lastParent = node;
            while (parent && parent.firstChild === lastParent && parent.lastChild === lastParent) {
              lastParent = parent;

              if (blockElements[parent.name]) {
                break;
              }

              parent = parent.parent;
            }

            if (lastParent === parent) {
              var textNode = new Node('#text', 3);
              textNode.value = '\u00a0';
              node.replace(textNode);
            }
          }
        }
      });
    }

    if (settings.fix_list_elements) {
      self.addNodeFilter('ul,ol', function (nodes) {
        let i = nodes.length, node, parentNode;

        while (i--) {
          node = nodes[i];
          parentNode = node.parent;

          if (parentNode && (parentNode.name === 'ul' || parentNode.name === 'ol')) {
            if (node.prev && node.prev.name === 'li') {
              node.prev.append(node);
            } else {
              const li = new Node('li', 1);
              li.attr('style', 'list-style-type: none');
              node.wrap(li);
            }
          }
        }
      });
    }

    self.addAttributeFilter('href', function (nodes) {
      var i = nodes.length,
        node;

      var appendRel = function (rel) {
        var parts = rel.split(' ').filter(function (p) {
          return p.length > 0;
        });
        return parts.concat(['noopener']).sort().join(' ');
      };

      var addNoOpener = function (rel) {
        var newRel = rel ? tinymce.trim(rel) : '';
        if (!/\b(noopener)\b/g.test(newRel)) {
          return appendRel(newRel);
        } else {
          return newRel;
        }
      };

      if (!settings.allow_unsafe_link_target) {
        while (i--) {
          node = nodes[i];
          if (node.name === 'a' && node.attr('target') === '_blank' && /:\/\//.test(node.attr('href'))) {
            node.attr('rel', addNoOpener(node.attr('rel')));
          }
        }
      }
    });

    // Force anchor names closed, unless the setting "allow_html_in_named_anchor" is explicitly included.
    if (!settings.allow_html_in_named_anchor) {
      self.addAttributeFilter('id,name', function (nodes) {
        var i = nodes.length,
          sibling, prevSibling, parent, node;

        while (i--) {
          node = nodes[i];
          if (node.name === 'a' && node.firstChild && !node.attr('href')) {
            parent = node.parent;

            // Move children after current node
            sibling = node.lastChild;
            do {
              prevSibling = sibling.prev;
              parent.insert(sibling, node);
              sibling = prevSibling;
            } while (sibling);
          }
        }
      });
    }

    if (settings.validate && schema.getValidClasses()) {
      self.addAttributeFilter('class', function (nodes) {
        var i = nodes.length,
          node, classList, ci, className, classValue;
        var validClasses = schema.getValidClasses(),
          validClassesMap, valid;

        while (i--) {
          node = nodes[i];
          classList = node.attr('class').split(' ');
          classValue = '';

          for (ci = 0; ci < classList.length; ci++) {
            className = classList[ci];
            valid = false;

            validClassesMap = validClasses['*'];

            if (validClassesMap && validClassesMap[className]) {
              valid = true;
            }

            validClassesMap = validClasses[node.name];

            if (!valid && validClassesMap && validClassesMap[className]) {
              valid = true;
            }

            if (valid) {
              if (classValue) {
                classValue += ' ';
              }

              classValue += className;
            }
          }

          if (!classValue.length) {
            classValue = null;
          }

          node.attr('class', classValue);
        }
      });
    }

    self.getAttributeFilters = function () {
      return attributeFilters;
    };

    self.getNodeFilters = function () {
      return nodeFilters;
    };
  };
})(tinymce);