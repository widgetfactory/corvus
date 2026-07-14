/**
 * Copyright (c) Moxiecode Systems AB. All rights reserved.
 * Copyright (c) 1999–2015 Ephox Corp. All rights reserved.
 * Copyright (c) 2009–2025 Ryan Demmer. All rights reserved.
 * @note    Forked or includes code from TinyMCE 3.x/4.x/5.x (originally under LGPL 2.1) and relicensed under GPL v2+ per LGPL 2.1 § 3.
 *
 * Licensed under the GNU General Public License version 2 or later (GPL v2+):
 * https://www.gnu.org/licenses/gpl-2.0.html
 */


import * as Newlines from './Newlines';
import * as InternalHtml from './InternalHtml';
import * as Utils from './Utils';
import * as WordFilter from './WordFilter';
import * as FakeClipboard from './FakeClipboard';

var each = tinymce.each,
    VK = tinymce.VK,
    DomParser = tinymce.html.DomParser,
    Serializer = tinymce.html.Serializer,
    BlobCache = tinymce.file.BlobCache,
    Env = tinymce.util.Env;

// IE flag to include Edge
var isIE = tinymce.isIE || tinymce.isIE12;

function getBase64FromUri(uri) {
    var idx;

    idx = uri.indexOf(',');
    if (idx !== -1) {
        return uri.substr(idx + 1);
    }

    return null;
}

function isValidDataUriImage(settings, imgElm) {
    return settings.images_dataimg_filter ? settings.images_dataimg_filter(imgElm) : true;
}

function pasteImage(editor, rng, reader, blob) {
    if (rng) {
        editor.selection.setRng(rng);
        rng = null;
    }

    var dataUri = reader.result;
    var base64 = getBase64FromUri(dataUri);

    var img = new Image();
    img.src = dataUri;

    // TODO: Move the bulk of the cache logic to EditorUpload
    if (isValidDataUriImage(editor.settings, img)) {
        var blobInfo, existingBlobInfo;

        existingBlobInfo = BlobCache.findFirst(function (cachedBlobInfo) {
            return cachedBlobInfo.base64() === base64;
        });

        if (!existingBlobInfo) {
            blobInfo = BlobCache.create('mceclip', blob, base64);
            BlobCache.add(blobInfo);
        } else {
            blobInfo = existingBlobInfo;
        }

        return '<img src="' + blobInfo.blobUri() + '" />';

    } else {
        return '<img src="' + dataUri + '" />';
    }
}

/**
 * Convert URL strings to elements
 * @param content HTML to process
 */
function convertURLs(editor, content) {

    var ex = '([-!#$%&\'\*\+\\./0-9=?A-Z^_`a-z{|}~]+@[-!#$%&\'\*\+\\/0-9=?A-Z^_`a-z{|}~]+\.[-!#$%&\'*+\\./0-9=?A-Z^_`a-z{|}~]+)';
    var ux = '((?:news|telnet|nttp|file|http|ftp|https)://[-!#$%&\'\*\+\\/0-9=?A-Z^_`a-z{|}~;]+\.[-!#$%&@\'\*\+\\./0-9=?A-Z^_`a-z{|}~;]+)';

    // Match attribute patterns, e.g., href="url"
    var attribRe = '(?:[a-zA-Z0-9_-]+=["\'])';

    // Match shortcode/markdown brackets, e.g., {url}, [url], [text](url)
    var bracketRe = '(?:\}|\].?)';

    function createLink(url) {
        // create attribs and decode url to prevent double encoding in dom.createHTML
        var attribs = { 'href': editor.dom.decode(url) }, params = editor.settings.link || {};

        attribs = tinymce.extend(attribs, params.attributes || {});

        return editor.dom.createHTML('a', attribs, url);
    }

    function wrapContent(content) {
        if (content.indexOf('data-mce-convert="url"') === -1) {
            return '<div data-mce-convert="url">' + content + '</div>';
        }

        return content;
    }

    // existing link...
    var decoded = editor.dom.decode(content);

    // skip blobs and data uri
    if (/^<img src="(data|blob):[^>]+?>/.test(content)) {
        return content;
    }

    if (/^<a([^>]+)>([\s\S]+?)<\/a>$/.test(decoded)) {
        return content;
    }

    var urlProcessed = false;

    if (editor.settings.autolink_url !== false) {        
        if (new RegExp('^' + ux + '$').test(content)) {
            content = createLink(content);
            return content;
        }

        // Replace URLs with links if not already linked
        content = content.replace(new RegExp('(' + attribRe + '|' + bracketRe + ')?' + ux, 'gi'), function (match, extra, url) {
            if (extra) {
                return match; // Skip if part of an attribute or shortcode
            }

            // Create a link for the detected URL
            return createLink(url);
        });

        urlProcessed = true;
    }

    if (editor.settings.autolink_email !== false) {
        if (new RegExp('^' + ex + '$').test(content)) {
            return '<a href="mailto:' + content + '">' + content + '</a>';
        }

        content = content.replace(new RegExp('(href="[^"]+?)?(' + ex + ')', 'g'), function (match, attrib, email) {            
            // Only process if the match is not already part of an href
            if (!attrib && email && !email.includes('//')) {
                return '<a href="mailto:' + email + '">' + email + '</a>';
            }
            
            return match; // Return the original match if it's already part of an href or not a valid email
        });        
        
        urlProcessed = true;
    }

    if (urlProcessed) {
        // wrap content - this seems to be required to prevent repeats of link conversion
        content = wrapContent(content);
    }

    return content;
}

/**
 * Gets various content types out of the Clipboard API. It will also get the
 * plain text using older IE and WebKit API:s.
 *
 * @param {ClipboardEvent} clipboardEvent Event fired on paste.
 * @return {Object} Object with mime types and data for those mime types.
 */
function getClipboardContent(editor, clipboardEvent) {
    var eventTimestamp = clipboardEvent.timeStamp;
    
    if (FakeClipboard.hasData()) {
        var data = FakeClipboard.getData();
        var timestamp = FakeClipboard.getTimestamp();

        FakeClipboard.clearData();

        if (timestamp && timestamp > eventTimestamp) {
            return data;
        }
    }
    
    var content = Utils.getDataTransferItems(clipboardEvent.clipboardData || clipboardEvent.dataTransfer || editor.getDoc().dataTransfer);
    //var content = getDataTransferItems(clipboardEvent.clipboardData || editor.getDoc().dataTransfer);

    return content;
}

function isKeyboardPasteEvent(e) {
    return (VK.metaKeyPressed(e) && e.keyCode == 86) || (e.shiftKey && e.keyCode == 45);
}

/**
 * Inserts the specified contents at the caret position.
 */
function insertData(editor, content, skip_undo) {
    // get validate setting
    var validate = editor.settings.validate;

    // reset validate setting
    editor.settings.validate = true;

    // insert content
    editor.execCommand('mceInsertContent', false, content);

    // reset validate
    editor.settings.validate = validate;
}

function pasteText(editor, text) {    
    // encode text and replace returns
    text = editor.dom.encode(text).replace(/\r\n/g, '\n');

    // convert newlines to block elements
    text = Newlines.convert(text, editor.settings.forced_root_block, editor.settings.forced_root_block_attrs);

    pasteHtml(editor, text);
}

function sanitizePastedHTML(editor, html) {
    var parser = new DomParser({ allow_event_attributes: !!editor.settings.paste_allow_event_attributes }, editor.schema);

    // Strip elements
    parser.addNodeFilter('meta,svg,script,noscript', function (nodes) {
        var i = nodes.length;

        while (i--) {
            nodes[i].remove();
        }
    });

    // remove spans
    if (editor.settings.paste_remove_spans) {
        parser.addNodeFilter('span', function (nodes, name) {
            var i = nodes.length;

            while (i--) {
                nodes[i].unwrap();
            }
        });
    }

    // remove attributes
    var remove_attribs = editor.settings.paste_remove_attributes;

    if (remove_attribs) {
        parser.addAttributeFilter(remove_attribs, function (nodes, name) {
            var i = nodes.length;

            while (i--) {
                nodes[i].attr(name, null);
            }
        });
    }

    var fragment = parser.parse(html, { forced_root_block: false, isRootContent: true });

    return new Serializer({ validate: editor.settings.validate }, editor.schema).serialize(fragment);
}

function pasteHtml(editor, content, internal, pasteAsPlainText) {
    if (!content) {
        return false;
    }

    // create object to process
    var o = {
        content: content,
        internal: internal,
        pasteAsPlainText: pasteAsPlainText
    };

    // only process externally sourced content
    if (!internal && editor.settings.paste_enable_default_filters !== false) {
        // set wordContent flag
        o.wordContent = WordFilter.isWordContent(editor, o.content);

        // process stylesheets into content
        if (editor.settings.paste_process_stylesheets) {
            o.content = Utils.processStylesheets(o.content);
        }

        // trim
        o.content = Utils.trimHtml(o.content);

        // Execute pre process handlers
        editor.onPastePreProcess.dispatch(editor, o);

        // sanitize content
        o.content = sanitizePastedHTML(editor, o.content);

        // convert urls in content
        if (editor.settings.paste_convert_urls !== false) {
            o.content = convertURLs(editor, o.content);
        }

        // Create DOM structure
        o.node = editor.dom.create('div', { style: 'display:none' }, o.content);

        // Execute post process handlers
        editor.onPastePostProcess.dispatch(editor, o);

        // get content from node
        o.content = o.node.innerHTML;

        // remove empty paragraphs
        if (editor.settings.paste_remove_empty_paragraphs !== false) {
            o.content = o.content.replace(/<p([^>]+)>(&nbsp;|\u00a0)?<\/p>/g, '');
        }

        // clean up extra whitespace
        if (editor.settings.paste_remove_whitespace) {
            o.content = o.content.replace(/(&nbsp;|\u00a0|\s| ){2,}/g, ' ');
        }

        // process regular expression
        if (editor.settings.paste_filter) {
            var re, rules = editor.settings.paste_filter.split(';');

            each(rules, function (s) {
                // if it is already in Regular Expression format...
                if (/^\/.*\/(g|i|m)*$/.test(s)) {
                    var m = s.match(/^\/(.*)\/([gim]*)$/);
                    re = new RegExp(m[1], m[2] || '');
                    // ...else create expression
                } else {
                    re = new RegExp(s);
                }

                o.content = o.content.replace(re, "");
            });
        }
    }

    editor.onPasteBeforeInsert.dispatch(editor, o);

    if (o.terminate) {
        return;
    }

    insertData(editor, o.content);
}

// This function executes the process handlers and inserts the contents
function insertClipboardContent(editor, clipboardContent, internal, pasteAsPlainText) {
    var content, isPlainTextHtml;

    editor.onGetClipboardContent.dispatch(editor, clipboardContent, pasteAsPlainText);

    // get html content
    content = clipboardContent['x-tinymce/html'] || clipboardContent['text/html'];

    // mark as internal
    internal = internal ? internal : InternalHtml.isMarked(content);

    // unmark content
    content = InternalHtml.unmark(content);

    // pasting content into a pre element so encode html first, then insert using setContent
    if (isPasteInPre(editor)) {
        var text = clipboardContent['text/plain'];

        // encode
        text = editor.dom.encode(text);

        // prefer plain text, otherwise use encoded html
        if (content && !text) {
            content = Utils.trimHtml(content);
            text = editor.dom.encode(content);
        }

        editor.selection.setContent(text, { no_events: true });

        return true;
    }

    /*if (!internal && isPlainTextPaste(clipboardContent)) {
        // set pasteAsPlainText state
        self.pasteAsPlainText = clipboardContent['text/plain'] == content;
    }*/

    var isPlainTextHtml = (internal === false && (Newlines.isPlainText(content)));

    // If we got nothing from clipboard API and pastebin or the content is a plain text (with only
    // some BRs, Ps or DIVs as newlines) then we fallback to plain/text
    if (!content.length || isPlainTextHtml) {
        pasteAsPlainText = true;
    }

    // paste text
    if (pasteAsPlainText) {
        // Use plain text contents from Clipboard API unless the HTML contains paragraphs then
        // we should convert the HTML to plain text since works better when pasting HTML/Word contents as plain text
        if (Utils.hasContentType(clipboardContent, 'text/plain') && isPlainTextHtml) {
            content = clipboardContent['text/plain'];
        } else {
            content = Utils.innerText(content);
        }

        pasteText(editor, content);

        return true;
    }

    // paste HTML
    pasteHtml(editor, content, internal, pasteAsPlainText);
}

/**
 * Chrome on Android doesn't support proper clipboard access so we have no choice but to allow the browser default behavior.
 *
 * @param {Event} e Paste event object to check if it contains any data.
 * @return {Boolean} true/false if the clipboard is empty or not.
 */
function isBrokenAndroidClipboardEvent(e) {
    var clipboardData = e.clipboardData;
    return navigator.userAgent.indexOf('Android') !== -1 && clipboardData && clipboardData.items && clipboardData.items.length === 0;
}

function isHtmlPaste(content) {
    if (!Utils.hasContentType(content, "text/html")) {
        return false;
    }

    return true;
}

function pasteImageData(editor, e, lastRng) {
    var dataTransfer = e.clipboardData || e.dataTransfer;

    function processItems(items) {
        var i, item, hadImage = false;

        if (items) {
            for (i = 0; i < items.length; i++) {
                item = items[i];

                if (/^image\/(jpeg|png|gif|bmp)$/.test(item.type)) {
                    hadImage = true;
                    e.preventDefault();

                    if (editor.settings.paste_data_images !== false) {
                        var blob = item.getAsFile ? item.getAsFile() : item;

                        var reader = new FileReader();
                        // eslint-disable-next-line no-loop-func
                        reader.onload = function () {
                            var html = pasteImage(editor, lastRng, reader, blob);
                            pasteHtml(editor, html);
                        };

                        reader.readAsDataURL(blob);
                    } else {
                        pasteHtml(editor, '<img src="' + Env.transparentSrc + '" data-mce-upload-marker="1" />', true);
                    }
                }
            }
        }

        return hadImage;
    }

    if (!dataTransfer) {
        return true;
    }

    processItems(dataTransfer.items) || processItems(dataTransfer.files);

    return true;
}

function isPasteInPre(editor) {
    var node = editor.selection.getNode();
    return editor.settings.html_paste_in_pre !== false && node && node.nodeName === 'PRE';
}

function isPlainTextFileUrl(content) {
    var plainTextContent = content['text/plain'];
    return plainTextContent ? plainTextContent.indexOf('file://') === 0 : false;
}

var setup = function (editor, pasteBin) {
    var keyboardPastePlainTextState, keyboardPasteTimeStamp = 0;

    // Add command for external usage
    editor.addCommand('mceInsertClipboardContent', function (u, data) {        
        if (data.text) {
            pasteText(editor, data.text);
            return true;
        }

        if (editor.settings.paste_plain_text && !data.internal) {

            if (!data.text) {
                data.text = Utils.innerText(data.content || '');
            }

            pasteText(editor, data.text);

            return true;
        }

        if (data.content) {
            pasteHtml(editor, data.content, data.internal || false);
        }
    });

    var getLastRng = function () {
        return pasteBin.getLastRng() || editor.selection.getRng();
    };

    function getContentAndInsert(e) {
        // Getting content from the Clipboard can take some time
        var clipboardTimer = new Date().getTime();
        var clipboardContent = getClipboardContent(editor, e);
        var clipboardDelay = new Date().getTime() - clipboardTimer;

        function isKeyBoardPaste() {
            if (e.type == 'drop') {
                return false;
            }

            return (new Date().getTime() - keyboardPasteTimeStamp - clipboardDelay) < 1000;
        }

        var internal = Utils.hasContentType(clipboardContent, InternalHtml.internalHtmlMime());

        var pasteAsPlainText = keyboardPastePlainTextState;
        keyboardPastePlainTextState = false;

        if (editor.settings.paste_plain_text === true && !internal) {
            pasteAsPlainText = true;
        }

        if (e.isDefaultPrevented() || isBrokenAndroidClipboardEvent(e)) {
            pasteBin.remove();
            return;
        }

        // Not a keyboard paste prevent default paste and try to grab the clipboard contents using different APIs
        if (!isKeyBoardPaste()) {
            e.preventDefault();
        }

        // Try IE only method if paste isn't a keyboard paste
        if (isIE && (!isKeyBoardPaste() || e.ieFake) && !Utils.hasContentType(clipboardContent, 'text/html')) {
            pasteBin.create();

            editor.dom.bind(editor.dom.get('mcepastebin'), 'paste', function (e) {
                e.stopPropagation();
            });

            editor.getDoc().execCommand('Paste', false, null);
            clipboardContent["text/html"] = pasteBin.getHtml();
        }

        if (isPlainTextFileUrl(clipboardContent)) {
            pasteBin.remove();
            return;
        }

        if (!Utils.hasHtmlOrText(clipboardContent) && pasteImageData(editor, e, getLastRng())) {
            pasteBin.remove();
            return;
        }

        // Grab HTML from paste bin as a fallback
        if (!isHtmlPaste(clipboardContent)) {
            var content = pasteBin.getHtml();

            // no content....?
            if (pasteBin.isDefaultContent(content)) {
                pasteAsPlainText = true;
            } else {
                clipboardContent['text/html'] = content;
            }
        }

        // If clipboard API has HTML then use that directly
        if (isHtmlPaste(clipboardContent)) {
            e.preventDefault();

            // if clipboard lacks internal mime type, inspect html for internal markings
            if (!internal) {
                internal = InternalHtml.isMarked(clipboardContent['text/html']);
            }

            insertClipboardContent(editor, clipboardContent, internal, pasteAsPlainText);

            pasteBin.remove();

        } else if (Utils.hasContentType(clipboardContent, 'text/plain') && Utils.hasContentType(clipboardContent, 'text/uri-list')) {
            /*
            Safari adds the uri-list attribute to links copied within it.
            When pasting something with the url-list within safari using the default functionality it will convert it from www.example.com to <a href="www.example.com">www.example.com</a> when pasting into the pasteBin-div.
            This causes issues. To solve this we bypass the default paste functionality for this situation.
             */
            e.preventDefault();

            clipboardContent['text/html'] = clipboardContent['text/plain'];

            insertClipboardContent(editor, clipboardContent, internal, pasteAsPlainText);
        } else {
            setTimeout(function () {
                function block(e) {
                    e.preventDefault();
                }

                // Block mousedown and click to prevent selection change
                editor.dom.bind(editor.getDoc(), 'mousedown', block);
                editor.dom.bind(editor.getDoc(), 'keydown', block);

                insertClipboardContent(editor, clipboardContent, internal, pasteAsPlainText);

                // Block mousedown and click to prevent selection change
                editor.dom.unbind(editor.getDoc(), 'mousedown', block);
                editor.dom.unbind(editor.getDoc(), 'keydown', block);

                pasteBin.remove();
            }, 0);
        }
    }

    // Grab contents on paste event
    editor.onPaste.add(function (editor, e) {
        if (e.isDefaultPrevented() || isBrokenAndroidClipboardEvent(e) && !FakeClipboard.hasData()) {
            pasteBin.remove();
            return false;
        }

        getContentAndInsert(e);

        e.preventDefault();
    });

    function removePasteBinOnKeyUp(e) {
        // Ctrl+V or Shift+Insert
        if (isKeyboardPasteEvent(e) && !e.isDefaultPrevented()) {
            pasteBin.remove();
        }
    }

    editor.onKeyDown.add(function (editor, e) {
        // Ctrl+V or Shift+Insert
        if (isKeyboardPasteEvent(e) && !e.isDefaultPrevented()) {
            keyboardPasteTimeStamp = new Date().getTime();

            // Prevent undoManager keydown handler from making an undo level with the pastebin in it
            e.stopImmediatePropagation();

            keyboardPastePlainTextState = e.shiftKey && e.keyCode == 86;

            // Remove pastebin if we get a keyup and no paste event
            // For example pasting a file in IE 11 will not produce a paste event
            editor.dom.bind(editor.getBody(), 'keyup', function handler(e) {
                removePasteBinOnKeyUp(e);
                editor.dom.unbind(editor.getBody(), 'keyup', handler);
            });

            editor.dom.bind(editor.getBody(), 'paste', function handler(e) {
                removePasteBinOnKeyUp(e);
                editor.dom.unbind(editor.getBody(), 'paste', handler);
            });
        }
    });

    editor.addCommand('mcePasteFakeClipboard', function (ui, e) {
        var data = FakeClipboard.getData();
        insertClipboardContent(editor, data, true, e.isPlainText === true);
    });
};

tinymce.clipboard.FakeClipboard = FakeClipboard;

export {
    setup,
    pasteHtml,
    pasteText,
    pasteImageData
};