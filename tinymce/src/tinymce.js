/**
 * Copyright (c) Moxiecode Systems AB. All rights reserved.
 * Copyright (c) 1999–2015 Ephox Corp. All rights reserved.
 * Copyright (c) 2009–2025 Ryan Demmer. All rights reserved.
 * @note    Forked or includes code from TinyMCE 3.x/4.x/5.x (originally under LGPL 2.1) and relicensed under GPL v2+ per LGPL 2.1 § 3.
 *
 * Licensed under the GNU General Public License version 2 or later (GPL v2+):
 * https://www.gnu.org/licenses/gpl-2.0.html
 */


/* global CollectGarbage */

(function (win) {
  var whiteSpaceRe = /^\s*|\s*$/g,
    undef;

  var slice = [].slice;

  /**
   * Core namespace with core functionality for the TinyMCE API all sub classes will be added to this namespace/object.
   *
   * @static
   * @class tinymce
   * @example
   * // Using each method
   * tinymce.each([1, 2, 3], function(v, i) {
   *   console.log(i + '=' + v);
   * });
   *
   * // Checking for a specific browser
   * if (tinymce.isIE)
   *   console.log("IE");
   */
  var tinymce = {
    /**
     * Initializes the TinyMCE global namespace this will setup browser detection and figure out where TinyMCE is running from.
     */
    _init: function () {
      var self = this,
        doc = document,
        i, nl, n, base, p, v;

      // Get suffix and base
      self.suffix = '';

      // If base element found, add that infront of baseURL
      nl = doc.getElementsByTagName('base');

      for (i = 0; i < nl.length; i++) {
        v = nl[i].href;
        if (v) {
          // Host only value like http://site.com or http://site.com:8008
          if (/^https?:\/\/[^\/]+$/.test(v)) {
            v += '/';
          }

          base = v ? v.match(/.*\//)[0] : ''; // Get only directory
        }
      }

      function getBase(n) {
        if (n.src && /tinymce(|_gzip|_jquery|_prototype|_full)(_dev|_src)?.js/.test(n.src)) {
          if (/_(src|dev)\.js/g.test(n.src)) {
            self.suffix = '_src';
          }

          if ((p = n.src.indexOf('?')) != -1) {
            self.query = n.src.substring(p + 1);
          }

          self.baseURL = n.src.substring(0, n.src.lastIndexOf('/'));

          // If path to script is relative and a base href was found add that one infront
          // the src property will always be an absolute one on non IE browsers and IE 8
          // so this logic will basically only be executed on older IE versions
          if (base && self.baseURL.indexOf('://') == -1 && self.baseURL.indexOf('/') !== 0) {
            self.baseURL = base + self.baseURL;
          }

          return self.baseURL;
        }

        return null;
      }

      // Check document
      nl = doc.getElementsByTagName('script');

      for (i = 0; i < nl.length; i++) {
        if (getBase(nl[i])) {
          return;
        }
      }

      // Check head
      n = doc.getElementsByTagName('head')[0];

      if (n) {
        nl = n.getElementsByTagName('script');
        for (i = 0; i < nl.length; i++) {
          if (getBase(nl[i])) {
            return;
          }
        }
      }

      return;
    },

    /**
     * Checks if a object is of a specific type for example an array.
     *
     * @method is
     * @param {Object} o Object to check type of.
     * @param {string} t Optional type to check for.
     * @return {Boolean} true/false if the object is of the specified type.
     */
    is: function (o, t) {
      if (!t) {
        return o !== undef;
      }

      if (t == 'array' && tinymce.isArray(o)) {
        return true;
      }
      return typeof (o) == t;
    },

    /**
     * Returns true/false if the object is an array or not.
     *
     * @method isArray
     * @param {Object} obj Object to check.
     * @return {boolean} true/false state if the object is an array or not.
     */
    isArray: Array.isArray || function (obj) {
      return Object.prototype.toString.call(obj) === "[object Array]";
    },

    /**
     * Makes a name/object map out of an array with names.
     *
     * @method makeMap
     * @param {Array/String} items Items to make map out of.
     * @param {String} delim Optional delimiter to split string by.
     * @param {Object} map Optional map to add items to.
     * @return {Object} Name/value map of items.
     */
    makeMap: function (items, delim, map) {
      var i;

      items = items || [];
      delim = delim || ',';

      if (typeof (items) == "string") {
        items = items.split(delim);
      }

      map = map || {};

      i = items.length;

      while (i--) {
        map[items[i]] = {};
      }

      return map;
    },

    /**
     * Performs an iteration of all items in a collection such as an object or array. This method will execure the
     * callback function for each item in the collection, if the callback returns false the iteration will terminate.
     * The callback has the following format: cb(value, key_or_index).
     *
     * @method each
     * @param {Object} o Collection to iterate.
     * @param {function} cb Callback function to execute for each item.
     * @param {Object} s Optional scope to execute the callback in.
     * @example
     * // Iterate an array
     * tinymce.each([1,2,3], function(v, i) {
     *     console.debug("Value: " + v + ", Index: " + i);
     * });
     *
     * // Iterate an object
     * tinymce.each({a : 1, b : 2, c: 3], function(v, k) {
     *     console.debug("Value: " + v + ", Key: " + k);
     * });
     */
    each: function (o, cb, s) {
      var n, l;

      if (!o) {
        return 0;
      }

      s = s || o;

      if (o.length !== undef) {
        // Indexed arrays, needed for Safari
        for (n = 0, l = o.length; n < l; n++) {
          if (cb.call(s, o[n], n, o) === false) {
            return 0;
          }
        }
      } else {
        // Hashtables
        for (n in o) {
          // eslint-disable-next-line no-prototype-builtins
          if (o.hasOwnProperty(n)) {
            if (cb.call(s, o[n], n, o) === false) {
              return 0;
            }
          }
        }
      }

      return 1;
    },

    // #ifndef jquery

    /**
     * Creates a new array by the return value of each iteration function call. This enables you to convert
     * one array list into another.
     *
     * @method map
     * @param {Array} a Array of items to iterate.
     * @param {function} f Function to call for each item. It's return value will be the new value.
     * @return {Array} Array with new values based on function return values.
     */
    map: function (a, f) {
      var o = [];

      tinymce.each(a, function (v) {
        o.push(f(v));
      });

      return o;
    },

    /**
     * Filters out items from the input array by calling the specified function for each item.
     * If the function returns false the item will be excluded if it returns true it will be included.
     *
     * @method grep
     * @param {Array} a Array of items to loop though.
     * @param {function} f Function to call for each item. Include/exclude depends on it's return value.
     * @return {Array} New array with values imported and filtered based in input.
     * @example
     * // Filter out some items, this will return an array with 4 and 5
     * var items = tinymce.grep([1,2,3,4,5], function(v) {return v > 3;});
     */
    grep: function (a, f) {
      var o = [];

      tinymce.each(a, function (v) {
        if (!f || f(v)) {
          o.push(v);
        }
      });

      return o;
    },

    /**
     * Returns the index of a value in an array, this method will return -1 if the item wasn't found.
     *
     * @method inArray
     * @param {Array} a Array/Object to search for value in.
     * @param {Object} v Value to check for inside the array.
     * @return {Number/String} Index of item inside the array inside an object. Or -1 if it wasn't found.
     * @example
     * // Get index of value in array this will alert 1 since 2 is at that index
     * alert(tinymce.inArray([1,2,3], 2));
     */
    inArray: function (a, v) {
      var i, l;

      if (a) {
        for (i = 0, l = a.length; i < l; i++) {
          if (a[i] === v) {
            return i;
          }
        }
      }

      return -1;
    },

    toArray: function (obj) {
      var array = obj,
        i, l;

      if (!tinymce.isArray(obj)) {
        array = [];
        for (i = 0, l = obj.length; i < l; i++) {
          array[i] = obj[i];
        }
      }

      return array;
    },

    /**
     * Extends an object with the specified other object(s).
     *
     * @method extend
     * @param {Object} obj Object to extend with new items.
     * @param {Object} ext..n Object(s) to extend the specified object with.
     * @return {Object} o New extended object, same reference as the input object.
     * @example
     * // Extends obj1 with two new fields
     * var obj = tinymce.extend(obj1, {
     *     somefield1 : 'a',
     *     somefield2 : 'a'
     * });
     *
     * // Extends obj with obj2 and obj3
     * tinymce.extend(obj, obj2, obj3);
     */
    extend: function (obj, ext) {
      var i, l, name, args = arguments,
        value;

      for (i = 1, l = args.length; i < l; i++) {
        ext = args[i];
        for (name in ext) {
          // eslint-disable-next-line no-prototype-builtins
          if (ext.hasOwnProperty(name)) {
            value = ext[name];

            if (value !== undef) {
              obj[name] = value;
            }
          }
        }
      }

      return obj;
    },

    // #endif

    /**
     * Removes whitespace from the beginning and end of a string.
     *
     * @method trim
     * @param {String} s String to remove whitespace from.
     * @return {String} New string with removed whitespace.
     */
    trim: function (s) {
      return (s ? '' + s : '').replace(whiteSpaceRe, '');
    },

    /**
     * Creates a class, subclass or static singleton.
     * More details on this method can be found in the Wiki.
     *
     * @method create
     * @param {String} s Class name, inheritage and prefix.
     * @param {Object} p Collection of methods to add to the class.
     * @param {Object} root Optional root object defaults to the global window object.
     * @example
     * // Creates a basic class
     * tinymce.create('tinymce.somepackage.SomeClass', {
     *     SomeClass : function() {
     *         // Class constructor
     *     },
     *
     *     method : function() {
     *         // Some method
     *     }
     * });
     *
     * // Creates a basic subclass class
     * tinymce.create('tinymce.somepackage.SomeSubClass:tinymce.somepackage.SomeClass', {
     *     SomeSubClass: function() {
     *         // Class constructor
     *         this._super(); // Call parent constructor
     *     },
     *
     *     method : function() {
     *         // Some method
     *         this._super(); // Call parent method
     *     },
     *
     *     'static' : {
     *         staticMethod : function() {
     *             // Static method
     *         }
     *     }
     * });
     *
     * // Creates a singleton/static class
     * tinymce.create('static tinymce.somepackage.SomeSingletonClass', {
     *     method : function() {
     *         // Some method
     *     }
     * });
     */
    create: function (s, p, root) {
      var self = this,
        sp, ns, cn, scn, c, de = 0;

      // Parse : <prefix> <class>:<super class>
      s = /^((static) )?([\w.]+)(:([\w.]+))?/.exec(s);
      cn = s[3].match(/(^|\.)(\w+)$/i)[2]; // Class name

      // Create namespace for new class
      ns = self.createNS(s[3].replace(/\.\w+$/, ''), root);

      // Class already exists
      if (ns[cn]) {
        return;
      }

      // Make pure static class
      if (s[2] == 'static') {
        ns[cn] = p;

        if (this.onCreate) {
          this.onCreate(s[2], s[3], ns[cn]);
        }

        return;
      }

      // Create default constructor
      if (!p[cn]) {
        p[cn] = function () { };
        de = 1;
      }

      // Add constructor and methods
      ns[cn] = p[cn];
      self.extend(ns[cn].prototype, p);

      // Extend
      if (s[5]) {
        sp = self.resolve(s[5]).prototype;
        scn = s[5].match(/\.(\w+)$/i)[1]; // Class name

        // Extend constructor
        c = ns[cn];
        if (de) {
          // Add passthrough constructor
          ns[cn] = function () {
            return sp[scn].apply(this, arguments);
          };
        } else {
          // Add inherit constructor
          ns[cn] = function () {
            this._super = sp[scn];
            return c.apply(this, arguments);
          };
        }
        ns[cn].prototype[cn] = ns[cn];

        // Add super methods
        self.each(sp, function (f, n) {
          ns[cn].prototype[n] = sp[n];
        });

        // Add overridden methods
        self.each(p, function (f, n) {
          // Extend methods if needed
          if (sp[n]) {
            ns[cn].prototype[n] = function () {
              this._super = sp[n];
              return f.apply(this, arguments);
            };
          } else {
            if (n != cn) {
              ns[cn].prototype[n] = f;
            }
          }
        });
      }

      // Add static methods
      /*jshint sub:true*/
      /*eslint dot-notation:0*/
      self.each(p['static'], function (f, n) {
        ns[cn][n] = f;
      });
    },

    /**
     * Executed the specified function for each item in a object tree.
     *
     * @method walk
     * @param {Object} o Object tree to walk though.
     * @param {function} f Function to call for each item.
     * @param {String} n Optional name of collection inside the objects to walk for example childNodes.
     * @param {String} s Optional scope to execute the function in.
     */
    walk: function (o, f, n, s) {
      s = s || this;

      if (o) {
        if (n) {
          o = o[n];
        }

        tinymce.each(o, function (o, i) {
          if (f.call(s, o, i, n) === false) {
            return false;
          }

          tinymce.walk(o, f, n, s);
        });
      }
    },

    /**
     * Creates a namespace on a specific object.
     *
     * @method createNS
     * @param {String} n Namespace to create for example a.b.c.doc.
     * @param {Object} o Optional object to add namespace to, defaults to window.
     * @return {Object} New namespace object the last item in path.
     * @example
     * // Create some namespace
     * tinymce.createNS('tinymce.somepackage.subpackage');
     *
     * // Add a singleton
     * var tinymce.somepackage.subpackage.SomeSingleton = {
     *     method : function() {
     *         // Some method
     *     }
     * };
     */
    createNS: function (n, o) {
      var i, v;

      o = o || win;

      n = n.split('.');

      for (i = 0; i < n.length; i++) {
        v = n[i];

        if (!o[v]) {
          o[v] = {};
        }

        o = o[v];
      }

      return o;
    },

    /**
     * Resolves a string and returns the object from a specific structure.
     *
     * @method resolve
     * @param {String} n Path to resolve for example a.b.c.doc.
     * @param {Object} o Optional object to search though, defaults to window.
     * @return {Object} Last object in path or null if it couldn't be resolved.
     * @example
     * // Resolve a path into an object reference
     * var obj = tinymce.resolve('a.b.c.d');
     */
    resolve: function (n, o) {
      var i, l;

      o = o || win;

      n = n.split('.');
      for (i = 0, l = n.length; i < l; i++) {
        o = o[n[i]];

        if (!o) {
          break;
        }
      }

      return o;
    },

    /**
     * Adds an unload handler to the document. This handler will be executed when the document gets unloaded.
     * This method is useful for dealing with browser memory leaks where it might be vital to remove DOM references etc.
     *
     * @method addUnload
     * @param {function} f Function to execute before the document gets unloaded.
     * @param {Object} s Optional scope to execute the function in.
     * @return {function} Returns the specified unload handler function.
     * @example
     * // Fixes a leak with a DOM element that was palces in the someObject
     * tinymce.addUnload(function() {
     *     // Null DOM element to reduce IE memory leak
     *     someObject.someElement = null;
     * });
     */
    addUnload: function (f, s) {
      var unload;

      unload = function (e) {
        var li = self.unloads,
          o, n;

        // the page may be restored from the back/forward cache, so leave everything intact
        if (e && e.persisted) {
          return;
        }

        if (li) {
          // Call unload handlers
          for (n in li) {
            o = li[n];

            if (o && o.func) {
              o.func.call(o.scope, 1);
            } // Send in one arg to distinct unload and user destroy
          }

          // Detach unload function
          win.removeEventListener('pagehide', unload);

          // Destroy references
          self.unloads = o = li = unload = 0;
        }
      };

      f = {
        func: f,
        scope: s || this
      };

      if (!self.unloads) {
        // "unload" is blocked by permissions policy in modern browsers
        win.addEventListener('pagehide', unload);

        // Setup initial unload handler array
        self.unloads = [f];
      } else {
        self.unloads.push(f);
      }

      return f;
    },

    /**
     * Removes the specified function form the unload handler list.
     *
     * @method removeUnload
     * @param {function} f Function to remove from unload handler list.
     * @return {function} Removed function name or null if it wasn't found.
     */
    removeUnload: function (f) {
      var u = this.unloads,
        r = null;

      tinymce.each(u, function (o, i) {
        if (o && o.func == f) {
          u.splice(i, 1);
          r = f;
          return false;
        }
      });

      return r;
    },

    /**
     * Splits a string but removes the whitespace before and after each value.
     *
     * @method explode
     * @param {string} s String to split.
     * @param {string} d Delimiter to split by.
     * @example
     * // Split a string into an array with a,b,c
     * var arr = tinymce.explode('a, b,   c');
     */
    explode: function (s, d) {
      if (!s || tinymce.is(s, 'array')) {
        return s;
      }

      return tinymce.map(s.split(d || ','), tinymce.trim);
    },

    curry: function (fn) {
      var args = slice.call(arguments);

      if (args.length - 1 >= fn.length) {
        return fn.apply(this, args.slice(1));
      }

      return function () {
        var tempArgs = args.concat([].slice.call(arguments));
        return tinymce.curry.apply(this, tempArgs);
      };
    },

    _addVer: function (u) {
      var v;

      if (!this.query) {
        return u;
      }

      v = (u.indexOf('?') == -1 ? '?' : '&') + this.query;

      if (u.indexOf('#') == -1) {
        return u + v;
      }

      return u.replace('#', v + '#');
    }

    /**#@-*/
  };

  // Initialize the API
  tinymce._init();

  // Expose tinymce namespace to the global namespace (window)
  win.tinymce = win.tinyMCE = tinymce;

  // Describe the different namespaces

  /**
   * Root level namespace this contains classes directly releated to the TinyMCE editor.
   *
   * @namespace tinymce
   */

  /**
   * Contains classes for handling the browsers DOM.
   *
   * @namespace tinymce.dom
   */

  tinymce.dom = {};

  /**
   * Contains various tools for rect/position calculation.
   *
   * @namespace tinymce.geom
   */

  tinymce.geom = {};

  /**
   * Contains various tools for characters and zero width space.
   *
   * @namespace tinymce.text
   */

  tinymce.text = {};

  /**
   * Contains various tools for carets.
   *
   * @namespace tinymce.caret
   */

  tinymce.caret = {};

  /**
   * Contains various tools for the clipboard.
   *
   * @namespace tinymce.clipboard
   */

  tinymce.clipboard = {};

  /**
   * Contains html parser and serializer logic.
   *
   * @namespace tinymce.html
   */

  tinymce.html = {};

  /**
   * Contains the different UI types such as buttons, listboxes etc.
   *
   * @namespace tinymce.ui
   */

  tinymce.ui = {};

  /**
   * Contains various utility classes such as json parser, cookies etc.
   *
   * @namespace tinymce.util
   */

  tinymce.util = {};

  /**
   * Contains various file classes.
   *
   * @namespace tinymce.file
   */

  tinymce.file = {};

  /**
   * Contains plugin classes.
   *
   * @namespace tinymce.plugins
   */

  tinymce.plugins = {};
})(window);