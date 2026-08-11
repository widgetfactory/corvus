/*!
 * DOMPurify v3.x (c) Cure53 — licensed under MPL-2.0 (compatible with GPL-2+).
 * See https://github.com/cure53/DOMPurify/blob/main/LICENSE
 */

import DOMPurify from "dompurify";

/**
 * Copyright (c) 2025 Ryan Demmer
 * Licensed under the GNU General Public License v2.0 or later
 * Includes modified code from TinyMCE 7.x, licensed under the GNU General Public License v2.0 or later
 * @code https://github.com/tinymce/tinymce/tree/main/modules/tinymce/src/core/main/ts/api/html/Sanitization.ts
 * Copyright (c) 2025 Ephox Corporation DBA Tiny Technologies, Inc.
 *  
 * See LICENSE.txt
 */

/**
 * tinymce.html.Sanitizer
 *
 * A custom HTML sanitizer integrating DOMPurify and schema-based filtering.
 * Two modes:
 *  - Purify mode: hooks into DOMPurify for fast DOM transformations.
 *  - Manual mode: walks the tree with NodeIterator, pruning or unwrapping invalid nodes.
 *
 * @param {Object} settings Configuration options (verify_html, purify_html, allow_event_attributes, allow_script_urls, etc.).
 * @param {tinymce.html.Schema} schema HTML schema defining valid elements and attributes.
 */

(function (tinymce) {
    var each = tinymce.each;
    var isDomSafe = tinymce.util.URI.isDomSafe;
    var filteredUrlAttrs = tinymce.makeMap('src,href,data,background,action,formaction,poster,xlink:href');

    /**
     * Constructs a new Sanitizer instance.
     * @constructor
     * @param {Object} settings - Sanitizer settings.
     * @param {tinymce.html.Schema} schema - HTML schema for validation.
     */
    tinymce.html.Sanitizer = function (settings, schema) {
        var self = this;

        var special = schema.getSpecialElements();

        var uid = 0;

        /**
         * Direction of event attribute handling for this instance.
         *
         * "store"   - content entering the editor, so an event attribute is stored as data-mce-on*
         *             and cannot run while editing
         * "restore" - content leaving the editor, so a stored attribute becomes a handler again
         * null      - neither, for content that is only being validated
         *
         * @property mode
         * @type String
         */
        self.mode = null;

        /**
         * Moves event attributes between their live and stored names.
         *
         * A stored attribute arriving from outside is always dropped, as only the editor can
         * produce one, so a forged or stale value can never become a handler on the way out.
         *
         * @param {Element} node Element to process.
         */
        function moveEventAttributes(node) {
            if (!self.mode) {
                return;
            }

            var attrs = node.attributes, i, name, tag = node.tagName.toLowerCase();

            for (i = attrs.length - 1; i >= 0; i--) {
                name = attrs[i].name.toLowerCase();

                if (name.indexOf('data-mce-on') === 0) {
                    if (self.mode === 'restore' && settings.allow_event_attributes) {
                        node.setAttribute(name.substr(9), attrs[i].value);
                    }

                    node.removeAttribute(name);

                    continue;
                }

                if (self.mode === 'store' && name.indexOf('on') === 0) {
                    if (settings.allow_event_attributes && schema.isValid(tag, name)) {
                        node.setAttribute('data-mce-' + name, attrs[i].value);
                    }

                    node.removeAttribute(name);
                }
            }
        }

        function isBooleanAttribute(name) {
            var boolAttrMap = schema.getBoolAttrs();
            return boolAttrMap[name] || boolAttrMap[name.toLowerCase()] || false;
        }

        function shouldKeepAttribute(attrName, attrValue, tagName) {
            attrName = attrName.toLowerCase();
            tagName = tagName.toLowerCase();

            // always disallow dangerous URLs
            if (attrName in filteredUrlAttrs && !isDomSafe(attrValue, tagName, settings)) {
                return false;
            }

            if (!settings.validate) {
                return true;
            }

            // Preserve custom data-* or other dashed attributes including internal attributes eg: data-mce-type
            if (/-/.test(attrName)) {
                return true;
            }

            // Event handlers: only keep if allowed and defined in schema
            if (/^on[a-z]+/i.test(attrName) || attrName.indexOf('on') === 0) {
                if (settings.allow_event_attributes && schema.isValid(tagName, attrName)) {
                    return true;
                }

                return false;
            }

            // Remove attributes not in schema
            if (schema.isValid(tagName, attrName)) {
                return true;
            }

            return false;
        }

        /**
         * Validates and transforms a single DOM element according to schema rules and internal flags.
         *
         * @param {Node} node - The DOM node to process.
         * @returns {boolean|undefined}
         *   - `true` to continue traversal without removing this node.
         *   - `undefined` (or nothing) if the node was removed or replaced.
         *
         * Behavior:
         * 1. Non-element nodes (e.g. text, comments) and the `<body>` tag are left intact (`true` returned).
         * 2. Custom root (`data-mce-root`) and internal TinyMCE nodes (`data-mce-type`) are preserved.
         * 3. Bogus nodes (`data-mce-bogus`) are immediately removed via removeNode().
         * 4. If `settings.validate` is off, no further schema checks occur (`true` returned).
         * 5. The element’s schema rule is fetched. If none exists, the node is removed.
         * 6. Forced attributes (`attributesForced`) are applied (overwriting any existing).
         * 7. Default attributes (`attributesDefault`) are added if missing.
         * 8. If required attributes (`attributesRequired`) are not present, the node is unwrapped and removed.
         * 9. If `removeEmptyAttrs` is true and the element has no attributes, it is unwrapped and removed.
         * 10. If the schema specifies an `outputName` different from the current tag, the element is
         *    replaced with a new element of that name, preserving its children.
         * 11. Remaining attributes are filtered via filterAttributes().
         */
        function processNode(node, evt) {
            if (node.nodeType !== 1) {
                return;
            }

            // before any of the skips below, so internal nodes are covered too
            moveEventAttributes(node);

            var tag = node.tagName.toLowerCase();

            // skip body tag
            if (tag === 'body') {
                return;
            }

            // keep custom root nodes
            if (node.hasAttribute('data-mce-root')) {
                if (evt) {
                    evt.allowedTags[tag] = true;
                }

                return;
            }

            // keep internal nodes
            if (node.hasAttribute('data-mce-type')) {
                if (evt) {
                    evt.allowedTags[tag] = true;
                }

                return;
            }

            // always remove bogus nodes
            if (node.hasAttribute('data-mce-bogus')) {
                if (!evt) {
                    removeNode(node);
                }
                // In hook context: omitting allowedTags entry lets DOMPurify
                // remove the element; FORBID_CONTENTS / KEEP_CONTENT governs children.
                return;
            }

            var rule = schema.getElementRule(tag);

            if (settings.validate && !rule) {
                if (!evt) {
                    if (tag in special) {
                        // Special elements are always removed
                        removeNode(node);
                    } else {
                        // unwrap others
                        removeNode(node, true);
                    }
                }
                // In hook context: don't set allowedTags — DOMPurify removes the element.
                return;
            } else {
                if (evt) {
                    evt.allowedTags[tag] = true;
                }
            }

            if (settings.validate && rule) {
                // Enforce forced attributes
                each(rule.attributesForced, function (attr) {
                    node.setAttribute(
                        attr.name,
                        attr.value === '{$uid}' ? 'mce_' + uid++ : attr.value
                    );
                });

                // Apply default attributes
                each(rule.attributesDefault, function (attr) {
                    if (!node.hasAttribute(attr.name)) {
                        node.setAttribute(
                            attr.name,
                            attr.value === '{$uid}' ? 'mce_' + uid++ : attr.value
                        );
                    }
                });

                // Unwrap and remove if required attributes are missing
                if (
                    rule.attributesRequired &&
                    !rule.attributesRequired.some(function (attr) {
                        return node.hasAttribute(attr.name);
                    })
                ) {
                    if (evt) {
                        evt.allowedTags[tag] = false; // DOMPurify unwraps
                    } else {
                        removeNode(node, true);
                    }
                    return;
                }

                // Unwrap and remove if all attributes should be stripped and none remain
                if (rule.removeEmptyAttrs && node.attributes.length === 0) {
                    if (evt) {
                        evt.allowedTags[tag] = false; // DOMPurify unwraps
                    } else {
                        removeNode(node, true);
                    }
                    return;
                }

                // Rename element if schema defines a different outputName.
                // In hook context, mark for a post-sanitize pass to avoid interfering
                // with DOMPurify's live tree walk.
                if (rule.outputName && rule.outputName !== tag) {
                    if (evt) {
                        node.setAttribute('data-mce-rename', rule.outputName);
                    } else {
                        var newNode = document.createElement(rule.outputName);

                        while (node.firstChild) {
                            newNode.appendChild(node.firstChild);
                        }

                        node.parentNode.replaceChild(newNode, node);
                        node = newNode;
                    }
                }
            }
        }

        /**
         * Removes or unwraps a given DOM node based on its “special” status and bogus flag.
         *
         * @param {Node}  node   - The DOM node to remove or unwrap.
         * @param {boolean} unwrap - If true, children of the node are retained and inserted in its place; otherwise, the node is removed wholesale.
         *
         * Behavior:
         * 1. If the node has no parent, the function exits immediately.
         * 2. If the node’s tag name (lowercased) is in the `special` set, it will always be removed (unwrap forced off).
         * 3. If the node’s `data-mce-bogus` attribute is not exactly `"all"`, it is treated as bogus and forced to unwrap.
         * 4. When unwrapping:
         *    - A `DocumentFragment` is created.
         *    - All child nodes are moved into the fragment.
         *    - The fragment is inserted before the original node.
         *    - The original node is removed from its parent.
         * 5. Otherwise, the node is simply removed from its parent.
         */
        function removeNode(node, unwrap) {
            var parent = node.parentNode;

            if (!parent) {
                return; // No parent, nothing to do
            }

            // Special elements must be completely removed, never unwrapped
            if (special[node.tagName.toLowerCase()]) {
                unwrap = false;
            }

            // Bogus content should always be unwrapped so its children remain
            if (node.hasAttribute('data-mce-bogus') && node.getAttribute('data-mce-bogus') != 'all') {
                unwrap = true;
            }

            if (unwrap) {
                var frag = document.createDocumentFragment();

                while (node.firstChild) {
                    frag.appendChild(node.firstChild);
                }

                parent.insertBefore(frag, node);
                parent.removeChild(node);
            } else {
                parent.removeChild(node);
            }
        }

        /**
         * Filters an element's attributes based on schema and settings.
         * @private
         * @param {Element} node - Element whose attributes to filter.
         */
        function filterAttributes(node) {
            var attrs = node.attributes, tag = node.tagName.toLowerCase();

            for (var i = attrs.length - 1; i >= 0; i--) {
                var name = attrs[i].name;
                var value = attrs[i].value;

                if (!shouldKeepAttribute(name, value, tag)) {

                    if (node.hasAttribute('data-mce-type') && ['id', 'class', 'style'].includes(name)) {
                        continue; // always keep id, class, style of internal attributes
                    }

                    node.removeAttribute(name);
                } else {
                    if (isBooleanAttribute(name)) {
                        node.setAttribute(name, name);
                    }
                }
            }
        }

        /**
         * Creates DOMPurify configuration from settings and schema.
         * @private
         * @returns {Object} Configuration object.
         */
        function getPurifyConfig(mimeType) {

            var config = {
                IN_PLACE: true,
                //RETURN_DOM: true,
                ALLOW_UNKNOWN_PROTOCOLS: true,
                ALLOWED_TAGS: ['#comment', '#cdata-section', 'body'],
                ALLOWED_ATTR: [],
                PARSER_MEDIA_TYPE: mimeType,
                SAFE_FOR_XML: true
            };

            // Allow any URI when allowing script urls
            if (settings.allow_script_urls) {
                config.ALLOWED_URI_REGEXP = /.*/;
                // Allow anything except javascript (or similar) URIs if all html data urls are allowed
            } else if (settings.allow_html_data_urls) {
                config.ALLOWED_URI_REGEXP = /^(?!(\w+script|mhtml):)/i;
            }

            if (schema.isValid('script') || schema.isValid('style')) {
                config.FORCE_BODY = true; // Force body to be present for script/style tags
            }

            return config;
        }

        /**
         * Runs DOMPurify on the given HTML or element, using custom hooks.
         * @private
         * @param {String|Element} body - Input HTML or Body element to sanitize.
         * @returns {Element} Sanitized DOM fragment.
         */
        function purify(body, mimeType) {
            var purifier = DOMPurify();
            purifier.removeAllHooks();

            purifier.addHook('uponSanitizeElement', function (node, data) {
                processNode(node, data);
            });

            purifier.addHook('uponSanitizeAttribute', function (node, data) {
                var attrName = data.attrName.toLowerCase(), attrValue = data.attrValue, tag = node.tagName.toLowerCase();

                data.keepAttr = shouldKeepAttribute(attrName, attrValue, tag);

                if (data.keepAttr) {
                    // We need to tell DOMPurify to forcibly keep the attribute if it's an SVG data URI and svg data URIs are allowed
                    if (settings.allow_svg_data_urls && data.attrValue.startsWith('data:image/svg+xml')) {
                        data.forceKeepAttr = true;
                        return;
                    }

                    if (isBooleanAttribute(attrName)) {
                        data.attrValue = attrName;
                    }

                    data.allowedAttributes[attrName] = true;
                } else if (node.hasAttribute('data-mce-type') && ['id', 'class', 'style'].includes(attrName)) {
                    data.forceKeepAttr = true; // always keep id, class, style of internal attributes
                    return;
                }
            });

            var purifyConfig = getPurifyConfig(mimeType);

            if (typeof body === 'string') {
                purifyConfig.RETURN_DOM = false; // Purify returns a string by default
            }

            purifier.sanitize(body, purifyConfig);

            // Rename elements that were marked by processNode during the hook pass
            // (replaceChild is deferred to avoid interfering with DOMPurify's tree walk).
            var toRename = body.querySelectorAll ? body.querySelectorAll('[data-mce-rename]') : [];
            var r = toRename.length;
            while (r--) {
                var orig = toRename[r];
                var outputName = orig.getAttribute('data-mce-rename');
                orig.removeAttribute('data-mce-rename');
                var renamed = document.createElement(outputName);
                var attrs = orig.attributes;

                for (var a = attrs.length - 1; a >= 0; a--) {
                    renamed.setAttribute(attrs[a].name, attrs[a].value);
                }

                while (orig.firstChild) {
                    renamed.appendChild(orig.firstChild);
                }

                if (orig.parentNode) {
                    orig.parentNode.replaceChild(renamed, orig);
                }
            }

            purifier.removed = [];

            return body;
        }

        /**
         * Sanitizes a DOM tree or HTML fragment.
         * @param {Element} body - Root element to sanitize.
         * @param {string}  mimeType - MIME type hint (unused).
         * @returns {Element} The sanitized root element.
         */
        this.sanitize = function (body, mimeType) {
            if (settings.sanitize_html !== false) {
                return purify(body, mimeType);
            }

            var iterator = document.createNodeIterator(
                body,
                NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT
            );

            var node;

            while ((node = iterator.nextNode())) {
                processNode(node);

                if (node.nodeType === 1) {
                    filterAttributes(node);
                }
            }

            return body;
        };
    };
})(tinymce);