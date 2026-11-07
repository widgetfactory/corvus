/**
 * Copyright (c) Moxiecode Systems AB. All rights reserved.
 * Copyright (c) 1999–2015 Ephox Corp. All rights reserved.
 * Copyright (c) 2009–2025 Ryan Demmer. All rights reserved.
 * @note    Forked or includes code from TinyMCE 3.x/4.x/5.x (originally under LGPL 2.1) and relicensed under GPL v2+ per LGPL 2.1 § 3.
 *
 * Licensed under the GNU General Public License version 2 or later (GPL v2+):
 * https://www.gnu.org/licenses/gpl-2.0.html
 */

(function (tinymce) {
  var each = tinymce.each,
    trim = tinymce.trim;
  var queryParts = "source protocol authority userInfo user password host port relative path directory file query anchor".split(' ');
  var DEFAULT_PORTS = {
    'ftp': 21,
    'http': 80,
    'https': 443,
    'mailto': 25
  };

  var safeSvgDataUrlElements = ['img', 'video'];

  function isNonNullable(value) {
    return value !== null && value !== undefined;
  }

  /**
   * This class handles parsing, modification and serialization of URI/URL strings.
   * @class tinymce.util.URI
   */
  tinymce.util.URI = function (url, settings) {
    var self = this,
      baseUri, base_url;

    url = trim(url);
    settings = self.settings = settings || {};
    baseUri = settings.base_uri;

    // Strange app protocol that isn't http/https or local anchor
    // For example: mailto,skype,tel etc.
    if (/^([\w\-]+):([^\/]{2})/i.test(url) || /^\s*#/.test(url)) {
      self.source = url;
      return;
    }

    var isProtocolRelative = url.indexOf('//') === 0;

    // Absolute path with no host, fake host and protocol
    if (url.indexOf('/') === 0 && !isProtocolRelative) {
      url = (baseUri ? baseUri.protocol || 'http' : 'http') + '://mce_host' + url;
    }

    // Relative path http:// or protocol relative //path
    if (!/^[\w\-]*:?\/\//.test(url)) {
      base_url = settings.base_uri ? settings.base_uri.path : new tinymce.util.URI(location.href).directory;
      if (settings.base_uri.protocol === "") {
        url = '//mce_host' + self.toAbsPath(base_url, url);
      } else {
        url = /([^#?]*)([#?]?.*)/.exec(url);
        url = ((baseUri && baseUri.protocol) || 'http') + '://mce_host' + self.toAbsPath(base_url, url[1]) + url[2];
      }
    }

    // Parse URL (Credits goes to Steave, http://blog.stevenlevithan.com/archives/parseuri)
    url = url.replace(/@@/g, '(mce_at)'); // Zope 3 workaround, they use @@something

    /*jshint maxlen: 255 */
    /*eslint max-len: 0 */
    url = /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@\/]*):?([^:@\/]*))?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/.exec(url);

    each(queryParts, function (v, i) {
      var part = url[i];

      // Zope 3 workaround, they use @@something
      if (part) {
        part = part.replace(/\(mce_at\)/g, '@@');
      }

      self[v] = part;
    });

    if (baseUri) {
      if (!self.protocol) {
        self.protocol = baseUri.protocol;
      }

      if (!self.userInfo) {
        self.userInfo = baseUri.userInfo;
      }

      if (!self.port && self.host === 'mce_host') {
        self.port = baseUri.port;
      }

      if (!self.host || self.host === 'mce_host') {
        self.host = baseUri.host;
      }

      self.source = '';
    }

    if (isProtocolRelative) {
      self.protocol = '';
    }
  };

  tinymce.util.URI.prototype = {
    /**
     * Sets the internal path part of the URI.
     *
     * @method setPath
     * @param {string} path Path string to set.
     */
    setPath: function (path) {
      var self = this;

      path = /^(.*?)\/?(\w+)?$/.exec(path);

      // Update path parts
      self.path = path[0];
      self.directory = path[1];
      self.file = path[2];

      // Rebuild source
      self.source = '';
      self.getURI();
    },

    /**
     * Converts the specified URI into a relative URI based on the current URI instance location.
     *
     * @method toRelative
     * @param {String} uri URI to convert into a relative path/URI.
     * @return {String} Relative URI from the point specified in the current URI instance.
     * @example
     * // Converts an absolute URL to an relative URL url will be somedir/somefile.htm
     * var url = new tinymce.util.URI('http://www.site.com/dir/').toRelative('http://www.site.com/dir/somedir/somefile.htm');
     */
    toRelative: function (uri) {
      var self = this,
        output;

      if (uri === "./") {
        return uri;
      }

      uri = new tinymce.util.URI(uri, {
        base_uri: self
      });

      // Not on same domain/port or protocol
      if ((uri.host != 'mce_host' && self.host != uri.host && uri.host) || self.port != uri.port ||
        (self.protocol != uri.protocol && uri.protocol !== "")) {
        return uri.getURI();
      }

      var tu = self.getURI(),
        uu = uri.getURI();

      // Allow usage of the base_uri when relative_urls = true
      if (tu == uu || (tu.charAt(tu.length - 1) == "/" && tu.substr(0, tu.length - 1) == uu)) {
        return tu;
      }

      // an empty path after the host is the root, eg: https://domain.tld#anchor
      output = self.toRelPath(self.path, uri.path || '/');

      // keep the directory so the query or anchor is not resolved against the current page
      if (!output && (uri.query || uri.anchor)) {
        output = './';
      }

      // Add query
      if (uri.query) {
        output += '?' + uri.query;
      }

      // Add anchor
      if (uri.anchor) {
        output += '#' + uri.anchor;
      }

      return output;
    },

    /**
     * Converts the specified URI into a absolute URI based on the current URI instance location.
     *
     * @method toAbsolute
     * @param {String} uri URI to convert into a relative path/URI.
     * @param {Boolean} noHost No host and protocol prefix.
     * @return {String} Absolute URI from the point specified in the current URI instance.
     * @example
     * // Converts an relative URL to an absolute URL url will be http://www.site.com/dir/somedir/somefile.htm
     * var url = new tinymce.util.URI('http://www.site.com/dir/').toAbsolute('somedir/somefile.htm');
     */
    toAbsolute: function (uri, noHost) {
      uri = new tinymce.util.URI(uri, {
        base_uri: this
      });

      return uri.getURI(noHost && this.isSameOrigin(uri));
    },

    /**
     * Determine whether the given URI has the same origin as this URI.  Based on RFC-6454.
     * Supports default ports for protocols listed in DEFAULT_PORTS.  Unsupported protocols will fail safe: they
     * won't match, if the port specifications differ.
     *
     * @method isSameOrigin
     * @param {tinymce.util.URI} uri Uri instance to compare.
     * @returns {Boolean} True if the origins are the same.
     */
    isSameOrigin: function (uri) {
      if (this.host == uri.host && this.protocol == uri.protocol) {
        if (this.port == uri.port) {
          return true;
        }

        var defaultPort = DEFAULT_PORTS[this.protocol];
        if (defaultPort && ((this.port || defaultPort) == (uri.port || defaultPort))) {
          return true;
        }
      }

      return false;
    },

    /**
     * Converts a absolute path into a relative path.
     *
     * @method toRelPath
     * @param {String} base Base point to convert the path from.
     * @param {String} path Absolute path to convert into a relative path.
     */
    toRelPath: function (base, path) {
      var items, breakPoint = 0,
        out = '',
        i, l;

      // Split the paths
      base = base.substring(0, base.lastIndexOf('/'));
      base = base.split('/');
      items = path.split('/');

      if (base.length >= items.length) {
        for (i = 0, l = base.length; i < l; i++) {
          if (i >= items.length || base[i] != items[i]) {
            breakPoint = i + 1;
            break;
          }
        }
      }

      if (base.length < items.length) {
        for (i = 0, l = items.length; i < l; i++) {
          if (i >= base.length || base[i] != items[i]) {
            breakPoint = i + 1;
            break;
          }
        }
      }

      if (breakPoint === 1) {
        return path;
      }

      for (i = 0, l = base.length - (breakPoint - 1); i < l; i++) {
        out += "../";
      }

      for (i = breakPoint - 1, l = items.length; i < l; i++) {
        if (i != breakPoint - 1) {
          out += "/" + items[i];
        } else {
          out += items[i];
        }
      }

      return out;
    },

    /**
     * Converts a relative path into a absolute path.
     *
     * @method toAbsPath
     * @param {String} base Base point to convert the path from.
     * @param {String} path Relative path to convert into an absolute path.
     */
    toAbsPath: function (base, path) {
      var i, nb = 0,
        o = [],
        tr, outPath;

      // Split paths
      tr = /\/$/.test(path) ? '/' : '';
      base = base.split('/');
      path = path.split('/');

      // Remove empty chunks
      each(base, function (k) {
        if (k) {
          o.push(k);
        }
      });

      base = o;

      // Merge relURLParts chunks
      for (i = path.length - 1, o = []; i >= 0; i--) {
        // Ignore empty or .
        if (path[i].length === 0 || path[i] === ".") {
          continue;
        }

        // Is parent
        if (path[i] === '..') {
          nb++;
          continue;
        }

        // Move up
        if (nb > 0) {
          nb--;
          continue;
        }

        o.push(path[i]);
      }

      i = base.length - nb;

      // If /a/b/c or /
      if (i <= 0) {
        outPath = o.reverse().join('/');
      } else {
        outPath = base.slice(0, i).join('/') + '/' + o.reverse().join('/');
      }

      // Add front / if it's needed
      if (outPath.indexOf('/') !== 0) {
        outPath = '/' + outPath;
      }

      // Add traling / if it's needed
      if (tr && outPath.lastIndexOf('/') !== outPath.length - 1) {
        outPath += tr;
      }

      return outPath;
    },

    /**
     * Returns the full URI of the internal structure.
     *
     * @method getURI
     * @param {Boolean} noProtoHost Optional no host and protocol part. Defaults to false.
     */
    getURI: function (noProtoHost) {
      var s, self = this;

      // Rebuild source
      if (!self.source || noProtoHost) {
        s = '';

        if (!noProtoHost) {
          if (self.protocol) {
            s += self.protocol + '://';
          } else {
            s += '//';
          }

          if (self.userInfo) {
            s += self.userInfo + '@';
          }

          if (self.host) {
            s += self.host;
          }

          if (self.port) {
            s += ':' + self.port;
          }
        }

        if (self.path) {
          s += self.path;
        } else if (noProtoHost) {
          // keep the root when the host is removed
          s += '/';
        }

        if (self.query) {
          s += '?' + self.query;
        }

        if (self.anchor) {
          s += '#' + self.anchor;
        }

        self.source = s;
      }

      return self.source;
    }
  };

  var decodeUri = function (encodedUri) {
    try {
      // Might throw malformed URI sequence
      return decodeURIComponent(encodedUri);
    } catch (ex) {
      // Fallback to non UTF-8 decoder
      return unescape(encodedUri);
    }
  };

  var blockSvgDataUris = function (allowSvgDataUrls, tagName) {
    if (isNonNullable(allowSvgDataUrls)) {
      return !allowSvgDataUrls;
    } else {
      // Only allow SVGs by default on images/videos since the browser won't execute scripts on those elements
      return isNonNullable(tagName) ? tinymce.inArray(safeSvgDataUrlElements, tagName) == -1 : true;
    }
  };

  var isInvalidUri = function (settings, uri, tagName) {
    // remove all whitespaces from decoded uri to prevent impact on regex matching
    var decodedUri = decodeUri(uri).replace(/\s/g, '');

    if (settings.allow_script_urls) {
      return false;
      // Ensure we don't have a javascript URI, as that is not safe since it allows arbitrary JavaScript execution
    } else if (/((java|vb)script|mhtml):/i.test(decodedUri)) {
      return true;
    } else if (settings.allow_html_data_urls) {
      return false;
    } else if (/^data:image\//i.test(decodedUri)) {
      return blockSvgDataUris(settings.allow_svg_data_urls, tagName) && /^data:image\/svg\+xml/i.test(decodedUri);
    } else {
      return /^data:/i.test(decodedUri);
    }
  };

  tinymce.util.URI.parseDataUri = function (uri) {
    var type, matches;

    uri = decodeURIComponent(uri).split(',');

    matches = /data:([^;]+)/.exec(uri[0]);
    if (matches) {
      type = matches[1];
    }

    return {
      type: type,
      data: uri[1]
    };
  };

  tinymce.util.URI.getDocumentBaseUrl = function (loc) {
    var baseUrl;

    // Pass applewebdata:// and other non web protocols though
    if (loc.protocol.indexOf('http') !== 0 && loc.protocol !== 'file:') {
      baseUrl = loc.href;
    } else {
      baseUrl = loc.protocol + '//' + loc.host + loc.pathname;
    }

    if (/^[^:]+:\/\/\/?[^\/]+\//.test(baseUrl)) {
      baseUrl = baseUrl.replace(/[\?#].*$/, '').replace(/[\/\\][^\/]+$/, '');

      if (!/[\/\\]$/.test(baseUrl)) {
        baseUrl += '/';
      }
    }

    return baseUrl;
  };

  /**
   * Check to see if a URI is safe to use in the Document Object Model (DOM). This will return
   * true if the URI can be used in the DOM without potentially triggering a security issue.
   *
   * @method isDomSafe
   * @static
   * @param {String} uri The URI to be validated.
   * @param {Object} context An optional HTML tag name where the element is being used.
   * @param {Object} options An optional set of options to use when determining if the URI is safe.
   * @return {Boolean} True if the URI is safe, otherwise false.
   */
  tinymce.util.URI.isDomSafe = function (uri, context, options) {
    if (options.allow_script_urls) {
      return true;
    } else {
      // eslint-disable-next-line no-control-regex
      let decodedUri = tinymce.html.Entities.decode(uri).replace(/[\s\u0000-\u001F]+/g, '');

      try {
        // Might throw malformed URI sequence
        decodedUri = decodeURIComponent(decodedUri);
      } catch (ex) {
        // Fallback to non UTF-8 decoder
        decodedUri = unescape(decodedUri);
      }

      // Ensure we don't have a javascript URI, as that is not safe since it allows arbitrary JavaScript execution
      if (/((java|vb)script|mhtml):/i.test(decodedUri)) {
        return false;
      }

      return !isInvalidUri(options, decodedUri, context);
    }
  };
})(tinymce);