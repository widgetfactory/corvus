/**
 * Copyright (c) Moxiecode Systems AB. All rights reserved.
 * Copyright (c) 1999–2015 Ephox Corp. All rights reserved.
 * Copyright (c) 2009–2025 Ryan Demmer. All rights reserved.
 * @note    Forked or includes code from TinyMCE 3.x/4.x/5.x (originally under LGPL 2.1) and relicensed under GPL v2+ per LGPL 2.1 § 3.
 *
 * Licensed under the GNU General Public License version 2 or later (GPL v2+):
 * https://www.gnu.org/licenses/gpl-2.0.html
 */


import * as InternalHtml from './InternalHtml.js';

const internalHtmlMimeType = InternalHtml.internalHtmlMime();

var clipboardData = {
    'text/html': '',
    'text/plain': ''
};

clipboardData[internalHtmlMimeType] = '';

var clipboardTimestamp = 0;

function hasData() {
    return !!clipboardData['text/html'] || !!clipboardData['text/plain'] || !!clipboardData[internalHtmlMimeType];
}

function getData(mimetype) {
    if (mimetype) {
        return clipboardData[mimetype] || null;
    }

    return clipboardData;
}

function getTimestamp() {
    return clipboardTimestamp;
}

function setData(mimetype, content) {
    clipboardData[mimetype] = content;
    clipboardTimestamp = Date.now();
}

function clearData() {
    clipboardData = {
        'text/html': '',
        'text/plain': ''
    };

    clipboardData[internalHtmlMimeType] = '';
    clipboardTimestamp = 0;
}

export {
    hasData,
    getData,
    getTimestamp,
    setData,
    clearData
};