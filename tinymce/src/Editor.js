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

  // Shorten these names
  var DOM = tinymce.DOM,
    Event = tinymce.dom.Event,
    extend = tinymce.extend,
    each = tinymce.each,
    isGecko = tinymce.isGecko,
    isIE = tinymce.isIE,
    is = tinymce.is,
    ThemeManager = tinymce.ThemeManager,
    PluginManager = tinymce.PluginManager,
    EditorFocus = tinymce.EditorFocus,
    explode = tinymce.explode,
    Zwsp = tinymce.text.Zwsp,
    TrimBody = tinymce.dom.TrimBody;

  /**
   * This class contains the core logic for a TinyMCE editor.
   *
   * @class tinymce.Editor
   * @example
   * // Add a class to all paragraphs in the editor.
   * tinymce.activeEditor.dom.addClass(tinymce.activeEditor.dom.select('p'), 'someclass');
   *
   * // Gets the current editors selection as text
   * tinymce.activeEditor.selection.getContent({format : 'text'});
   *
   * // Creates a new editor instance
   * var ed = new tinymce.Editor('textareaid', {
   *     some_setting : 1
   * });
   *
   * // Select each item the user clicks on
   * ed.onClick.add(function(ed, e) {
   *     ed.selection.select(e.target);
   * });
   *
   * ed.render();
   */
  tinymce.Editor = function (id, settings) {
    var self = this,
      TRUE = true;

    /**
     * Name/value collection with editor settings.
     *
     * @property settings
     * @type Object
     * @example
     * // Get the value of the theme setting
     * tinymce.activeEditor.windowManager.alert("You are using the " + tinymce.activeEditor.settings.theme + " theme");
     */
    self.settings = settings = extend({
      id: id,
      language: 'en',
      theme: 'advanced',
      skin: 'modern',
      delta_width: 0,
      delta_height: 0,
      popup_css: '',
      plugins: '',
      document_base_url: tinymce.documentBaseURL,
      add_form_submit_trigger: TRUE,
      submit_patch: TRUE,
      add_unload_trigger: TRUE,
      convert_urls: TRUE,
      relative_urls: TRUE,
      remove_script_host: TRUE,
      table_inline_editing: false,
      object_resizing: TRUE,
      accessibility_focus: TRUE,
      doctype: '<!DOCTYPE html>',
      visual: TRUE,
      font_size_style_values: 'xx-small,x-small,small,medium,large,x-large,xx-large',
      font_size_legacy_values: 'xx-small,small,medium,large,x-large,xx-large,300%', // See: http://www.w3.org/TR/CSS2/fonts.html#propdef-font-size
      apply_source_formatting: TRUE,
      directionality: 'ltr',
      forced_root_block: 'p',
      hidden_input: TRUE,
      padd_empty_editor: TRUE,
      render_ui: TRUE,
      indentation: '30px',
      fix_table_elements: TRUE,
      inline_styles: TRUE,
      convert_fonts_to_spans: TRUE,
      indent: 'simple',
      indent_before: 'p,h1,h2,h3,h4,h5,h6,blockquote,div,title,style,pre,script,td,ul,li,area,table,thead,tfoot,tbody,tr,section,article,hgroup,aside,figure,option,optgroup,datalist',
      indent_after: 'p,h1,h2,h3,h4,h5,h6,blockquote,div,title,style,pre,script,td,ul,li,area,table,thead,tfoot,tbody,tr,section,article,hgroup,aside,figure,option,optgroup,datalist',
      validate: TRUE,
      entity_encoding: 'named',
      url_converter: self.convertURL,
      url_converter_scope: self,
      validate_styles: TRUE
    }, settings);

    /**
     * Editor instance id, normally the same as the div/textarea that was replaced.
     *
     * @property id
     * @type String
     */
    self.id = self.editorId = id;

    /**
     * State to force the editor to return false on a isDirty call.
     *
     * @property isNotDirty
     * @type Boolean
     * @example
     * function ajaxSave() {
     *     var ed = tinymce.get('elm1');
     *
     *     // Save contents using some XHR call
     *     alert(ed.getContent());
     *
     *     ed.isNotDirty = 1; // Force not dirty state
     * }
     */
    self.isNotDirty = false;

    /**
     * Name/Value object containting plugin instances.
     *
     * @property plugins
     * @type Object
     * @example
     * // Execute a method inside a plugin directly
     * tinymce.activeEditor.plugins.someplugin.someMethod();
     */
    self.plugins = {};

    /**
     * URI object to document configured for the TinyMCE instance.
     *
     * @property documentBaseURI
     * @type tinymce.util.URI
     * @example
     * // Get relative URL from the location of document_base_url
     * tinymce.activeEditor.documentBaseURI.toRelative('/somedir/somefile.htm');
     *
     * // Get absolute URL from the location of document_base_ur\
     * tinymce.activeEditor.documentBaseURI.toAbsolute('somefile.htm');
     */
    self.documentBaseURI = new tinymce.util.URI(settings.document_base_url || tinymce.documentBaseURL, {
      base_uri: tinymce.baseURI
    });

    /**
     * URI object to current document that holds the TinyMCE editor instance.
     *
     * @property baseURI
     * @type tinymce.util.URI
     * @example
     * // Get relative URL from the location of the API
     * tinymce.activeEditor.baseURI.toRelative('/somedir/somefile.htm');
     *
     * // Get absolute URL from the location of the API
     * tinymce.activeEditor.baseURI.toAbsolute('somefile.htm');
     */
    self.baseURI = tinymce.baseURI;

    /**
     * Array with CSS files to load into the iframe.
     *
     * @property contentCSS
     * @type Array
     */
    self.contentCSS = [];

    /**
     * Array of CSS styles to add to head of document when the editor loads.
     *
     * @property contentStyles
     * @type Array
     */
    self.contentStyles = [];

    // Creates all events like onClick, onSetContent etc see Editor.Events.js for the actual logic
    self.setupEvents();

    // Internal command handler objects
    self.execCommands = {};
    self.queryStateCommands = {};
    self.queryValueCommands = {};

    // Call setup
    self.execCallback('setup', self);
  };

  tinymce.Editor.prototype = {
    /**
     * Creates a DomParser with the rules that must apply to any content entering the editor.
     * Callers can add their own filters to the returned parser.
     *
     * @method createParser
     * @param {Object} settings Optional settings, defaults to the editor settings.
     * @return {tinymce.html.DomParser} Parser instance.
     */
    createParser: function (settings) {
      var self = this,
        parser = new tinymce.html.DomParser(settings || self.settings, self.schema);

      // Strip forged data-mce-src, data-mce-href and data-mce-style on input
      parser.addAttributeFilter('data-mce-src,data-mce-href,data-mce-style', function (nodes, name) {
        var i = nodes.length;
        while (i--) {
          nodes[i].attr(name, null);
        }
      });

      // Remove legacy protected comments, nothing creates them now
      parser.addNodeFilter('#comment', function (nodes) {
        var i = nodes.length;
        while (i--) {
          if (/^\s*mce:protected\b/i.test(nodes[i].value)) {
            nodes[i].remove();
          }
        }
      });

      return parser;
    },

    /**
     * Renderes the editor/adds it to the page.
     *
     * @method render
     */
    render: function () {
      var self = this,
        s = self.settings,
        id = self.id,
        sl = tinymce.ScriptLoader;

      // Page is not loaded yet, wait for it
      if (!Event.domLoaded) {
        Event.add(window, 'ready', function () {
          self.render();
        });
        return;
      }

      tinymce.settings = s;

      // Element not found, then skip initialization
      if (!self.getElement()) {
        return;
      }

      // Is a iPad/iPhone and not on iOS5, then skip initialization. We need to sniff
      // here since the browser says it has contentEditable support but there is no visible caret.
      if (tinymce.isIDevice && !tinymce.isIOS5) {
        return;
      }

      // Add hidden input for non input elements inside form elements
      if (!/TEXTAREA|INPUT/i.test(self.getElement().nodeName) && s.hidden_input && DOM.getParent(id, 'form')) {
        DOM.insertAfter(DOM.create('input', {
          type: 'hidden',
          name: id
        }), id);
      }

      // Hide target element early to prevent content flashing
      if (!s.content_editable) {
        self.orgVisibility = self.getElement().style.visibility;
        self.getElement().style.visibility = 'hidden';
      }

      /**
       * Window manager reference, use this to open new windows and dialogs.
       *
       * @property windowManager
       * @type tinymce.WindowManager
       * @example
       * // Shows an alert message
       * tinymce.activeEditor.windowManager.alert('Hello world!');
       *
       * // Opens a new dialog with the file.htm file and the size 320x240
       * // It also adds a custom parameter this can be retrieved by using tinyMCEPopup.getWindowArg inside the dialog.
       * tinymce.activeEditor.windowManager.open({
       *    url : 'file.htm',
       *    width : 320,
       *    height : 240
       * }, {
       *    custom_param : 1
       * });
       */
      if (tinymce.WindowManager) {
        self.windowManager = new tinymce.WindowManager(self);
      }

      if (s.encoding == 'xml') {
        self.onGetContent.add(function (ed, o) {
          if (o.save) {
            o.content = DOM.encode(o.content);
          }
        });
      }

      if (s.add_form_submit_trigger) {
        self.onSubmit.addToTop(function () {
          if (self.initialized) {
            self.save();
            self.isNotDirty = true;
          }
        });
      }

      if (s.add_unload_trigger) {
        self._beforeUnload = tinymce.onBeforeUnload.add(function () {
          if (self.initialized && !self.destroyed && !self.isHidden()) {
            self.save({
              format: 'raw',
              no_events: true
            });
          }
        });
      }

      tinymce.addUnload(self.destroy, self);

      if (s.submit_patch) {
        self.onBeforeRenderUI.add(function () {
          var n = self.getElement().form;

          if (!n) {
            return;
          }

          // Already patched
          if (n._mceOldSubmit) {
            return;
          }

          // Check page uses id="submit" or name="submit" for it's submit button
          if (!n.submit.nodeType && !n.submit.length) {
            self.formElement = n;
            n._mceOldSubmit = n.submit;
            n.submit = function () {
              // Save all instances
              tinymce.triggerSave();
              self.isNotDirty = true;

              return self.formElement._mceOldSubmit(self.formElement);
            };
          }

          n = null;
        });
      }

      // Load scripts
      function loadScripts() {
        if (s.theme && typeof s.theme != "function" && s.theme.charAt(0) != '-' && !ThemeManager.urls[s.theme]) {
          ThemeManager.load(s.theme, 'themes/' + s.theme + '/theme' + tinymce.suffix + '.js');
        }

        each(explode(s.plugins), function (p) {
          if (p && !PluginManager.urls[p]) {
            if (p.charAt(0) == '-') {
              p = p.substr(1, p.length);
              var dependencies = PluginManager.dependencies(p);
              each(dependencies, function (dep) {
                var defaultSettings = {
                  prefix: 'plugins/',
                  resource: dep,
                  suffix: '/plugin' + tinymce.suffix + '.js'
                };
                dep = PluginManager.createUrl(defaultSettings, dep);
                PluginManager.load(dep.resource, dep);
              });
            } else {
              PluginManager.load(p, {
                prefix: 'plugins/',
                resource: p,
                suffix: '/plugin' + tinymce.suffix + '.js'
              });
            }
          }
        });

        each(s.external_plugins, function (url, name) {
          if (url) {
            PluginManager.load(name, url);
            s.plugins += ',' + name;
          }
        });

        // Init when que is loaded
        sl.loadQueue(function () {
          if (!self.removed) {
            self.init();
          }
        });
      }

      loadScripts();
    },

    /**
     * Initializes the editor this will be called automatically when
     * all plugins/themes and language packs are loaded by the rendered method.
     * This method will setup the iframe and create the theme and plugin instances.
     *
     * @method init
     */
    init: function () {
      var self = this,
        s = self.settings,
        w, h, mh, e = self.getElement(),
        o, url, bi, bc, re, initializedPlugins = [];

      tinymce.add(self);

      s.aria_label = s.aria_label || DOM.getAttrib(e, 'aria-label', self.getLang('aria.rich_text_area'));

      /**
       * Reference to the theme instance that was used to generate the UI.
       *
       * @property theme
       * @type tinymce.Theme
       * @example
       * // Executes a method on the theme directly
       * tinymce.activeEditor.theme.someMethod();
       */
      if (s.theme) {
        if (typeof s.theme != "function") {
          s.theme = s.theme.replace(/-/, '');
          o = ThemeManager.get(s.theme);
          self.theme = new o();

          if (self.theme.init) {
            self.theme.init(self, ThemeManager.urls[s.theme] || tinymce.documentBaseURL.replace(/\/$/, ''));
          }
        } else {
          self.theme = s.theme;
        }
      }

      function initPlugin(p) {
        var c = PluginManager.get(p),
          u = PluginManager.urls[p] || tinymce.documentBaseURL.replace(/\/$/, ''),
          po;

        if (c && tinymce.inArray(initializedPlugins, p) === -1) {
          each(PluginManager.dependencies(p), function (dep) {
            initPlugin(dep);
          });

          po = new c(self, u);

          self.plugins[p] = po;

          if (po.init) {
            po.init(self, u);
          }

          initializedPlugins.push(p);
        }
      }

      // Create all plugins
      if (Array.isArray(s.plugins)) {
        s.plugins = s.plugins.join(',');
      }

      each(explode(s.plugins.replace(/\-/g, '')), initPlugin);

      /**
       * Control manager instance for the editor. Will enables you to create new UI elements and change their states etc.
       *
       * @property controlManager
       * @type tinymce.ControlManager
       * @example
       * // Disables the bold button
       * tinymce.activeEditor.controlManager.setDisabled('bold', true);
       */
      self.controlManager = new tinymce.ControlManager(self);

      // Enables users to override the control factory
      self.onBeforeRenderUI.dispatch(self, self.controlManager);

      this.setDirty(false);

      // Measure box
      if (s.render_ui && self.theme) {
        self.orgDisplay = e.style.display;

        if (typeof s.theme != "function") {
          w = s.width; // || e.style.width || e.offsetWidth;
          h = s.height || e.style.height || e.offsetHeight;

          mh = s.min_height || 100;
          re = /^[0-9\.]+(|px)$/i;

          if (re.test('' + w)) {
            w = Math.max(parseInt(w, 10) + (o.deltaWidth || 0), 100);
          }

          if (re.test('' + h)) {
            h = Math.max(parseInt(h, 10) + (o.deltaHeight || 0), mh);
          }

          // Render UI
          o = self.theme.renderUI({
            targetNode: e,
            width: w,
            height: h,
            deltaWidth: s.delta_width,
            deltaHeight: s.delta_height
          });

          if (w) {
            // Resize editor
            DOM.setStyles(o.sizeContainer || o.editorContainer, {
              width: w
            });
          }

          h = (o.iframeHeight || h) + (typeof (h) == 'number' ? (o.deltaHeight || 0) : '');

          if (h < mh) {
            h = mh;
          }
        } else {
          o = s.theme(self, e);

          // Convert element type to id:s
          if (o.editorContainer.nodeType) {
            o.editorContainer = o.editorContainer.id = o.editorContainer.id || self.id + "_parent";
          }

          // Convert element type to id:s
          if (o.iframeContainer.nodeType) {
            o.iframeContainer = o.iframeContainer.id = o.iframeContainer.id || self.id + "_iframecontainer";
          }

          // Use specified iframe height or the targets offsetHeight
          h = o.iframeHeight || e.offsetHeight;

          // Store away the selection when it's changed to it can be restored later with a editor.focus() call
          if (isIE) {
            self.onInit.add(function (ed) {
              ed.dom.bind(ed.getBody(), 'beforedeactivate keydown keyup', function () {
                ed.bookmark = ed.selection.getBookmark(1);
              });
            });

            self.onNodeChange.add(function (ed) {
              if (document.activeElement.id == ed.id + "_ifr") {
                ed.bookmark = ed.selection.getBookmark(1);
              }
            });
          }
        }

        self.editorContainer = o.editorContainer;
      }

      // Load specified content CSS last
      if (s.content_css) {
        each(explode(s.content_css), function (u) {
          self.contentCSS.push(self.documentBaseURI.toAbsolute(u));
        });
      }

      // Load specified content CSS last
      if (s.content_style) {
        self.contentStyles.push(s.content_style);
      }

      // Content editable mode ends here
      if (s.content_editable) {
        e = o = null; // Fix IE leak
        return self.initContentBody();
      }

      // User specified a document.domain value
      if (document.domain && location.hostname != document.domain) {
        tinymce.relaxedDomain = document.domain;
      }

      self.iframeHTML = s.doctype + '<html dir="' + s.directionality + '"><head xmlns="http://www.w3.org/1999/xhtml">';

      // We only need to override paths if we have to
      // IE has a bug where it remove site absolute urls to relative ones if this is specified
      if (s.document_base_url != tinymce.documentBaseURL) {
        self.iframeHTML += '<base href="' + self.documentBaseURI.getURI() + '" />';
      }

      self.iframeHTML += '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />';

      // Load the CSS by injecting them into the HTML this will reduce "flicker"
      /*for (i = 0; i < self.contentCSS.length; i++) {
        var cssUrl = tinymce._addVer(self.contentCSS[i]);
        self.iframeHTML += '<link type="text/css" data-cfasync="false" rel="stylesheet" href="' + cssUrl + '" />';
      }

      self.contentCSS = [];*/

      bi = s.body_id || 'tinymce';

      if (bi.indexOf('=') != -1) {
        bi = self.getParam('body_id', '', 'hash');
        bi = bi[self.id] || bi;
      }

      bc = s.body_class || '';

      if (bc.indexOf('=') != -1) {
        bc = self.getParam('body_class', '', 'hash');
        bc = bc[self.id] || '';
      }

      self.iframeHTML += '</head><body id="' + bi + '" class="mceContentBody ' + bc + '"><br></body></html>';

      // Domain relaxing enabled, then set document domain
      if (tinymce.relaxedDomain) {
        // We need to write the contents here in IE since multiple writes messes up refresh button and back button
        url = 'javascript:(function(){document.open();document.domain="' + document.domain + '";var ed = window.parent.tinymce.get("' + self.id + '");document.write(ed.iframeHTML);document.close();ed.initContentBody();})()';
      }

      // Create iframe
      var ifr = DOM.add(o.iframeContainer, 'iframe', {
        id: self.id + "_ifr",
        frameBorder: '0',
        allowTransparency: "true",
        title: s.aria_label,
        style: {
          height: h
        }
      });

      ifr.onload = function () {
        ifr.onload = null;
        self.onLoad.dispatch();
      };

      // remove src attribute
      //DOM.setAttrib(ifr, "src", url || '');

      self.contentAreaContainer = o.iframeContainer;

      if (o.editorContainer) {
        DOM.get(o.editorContainer).style.display = self.orgDisplay;
      }

      // Restore visibility on target element
      e.style.visibility = self.orgVisibility;

      DOM.get(self.id).style.display = 'none';
      DOM.setAttrib(self.id, 'aria-hidden', true);

      if (!tinymce.relaxedDomain || !url) {
        self.initContentBody();
      }

      e = o = null; // Cleanup
    },

    /**
     * This method get called by the init method ones the iframe is loaded.
     * It will fill the iframe with contents, setups DOM and selection objects for the iframe.
     * This method should not be called directly.
     *
     * @method initContentBody
     */
    initContentBody: function () {
      var self = this,
        settings = self.settings,
        targetElm = DOM.get(self.id),
        doc = self.getDoc(),
        body, contentCssText;

      // Setup iframe body
      if ((!isIE || !tinymce.relaxedDomain) && !settings.content_editable) {
        doc.open();
        doc.write(self.iframeHTML);
        doc.close();

        if (tinymce.relaxedDomain) {
          doc.domain = tinymce.relaxedDomain;
        }
      }

      if (settings.content_editable) {
        DOM.addClass(targetElm, 'mceContentBody');
        self.contentDocument = doc = settings.content_document || document;
        self.contentWindow = settings.content_window || window;
        self.bodyElement = targetElm;

        // Prevent leak in IE
        settings.content_document = settings.content_window = null;
      }

      // It will not steal focus while setting contentEditable
      body = self.getBody();
      body.disabled = true;

      if (!settings.readonly) {
        body.contentEditable = self.getParam('content_editable_state', true);
      }

      body.disabled = false;

      /**
       * Schema instance, enables you to validate elements and it's children.
       *
       * @property schema
       * @type tinymce.html.Schema
       */
      self.schema = new tinymce.html.Schema(settings);

      /**
       * DOM instance for the editor.
       *
       * @property dom
       * @type tinymce.dom.DOMUtils
       * @example
       * // Adds a class to all paragraphs within the editor
       * tinymce.activeEditor.dom.addClass(tinymce.activeEditor.dom.select('p'), 'someclass');
       */
      self.dom = new tinymce.dom.DOMUtils(doc, {
        keep_values: true,
        url_converter: self.convertURL,
        url_converter_scope: self,
        hex_colors: settings.force_hex_style_colors,
        class_filter: settings.class_filter,
        update_styles: true,
        root_element: settings.content_editable ? self.id : null,
        schema: self.schema
      });

      /**
       * HTML parser will be used when contents is inserted into the editor.
       *
       * @property parser
       * @type tinymce.html.DomParser
       */
      self.parser = self.createParser(settings);

      // Convert src and href into data-mce-src, data-mce-href and data-mce-style
      self.parser.addAttributeFilter('src,href,style', function (nodes, name) {
        var i = nodes.length,
          node, dom = self.dom,
          value, internalName;

        while (i--) {
          node = nodes[i];
          value = node.attr(name);
          internalName = 'data-mce-' + name;

          // Add internal attribute if we need to we don't on a refresh of the document
          if (!node.attributes.map[internalName]) {
            if (name === "style") {

              // validate style value by parsing and serializing
              if (settings.validate_styles) {
                value = dom.serializeStyle(dom.parseStyle(value), node.name);
              }

              node.attr(internalName, value);
            } else {
              node.attr(internalName, self.convertURL(value, name, node.name));
            }
          }
        }
      });

      // Keep scripts from executing - removed as this is handled by the Code plugin by placeholder conversion
      /*self.parser.addNodeFilter('script', function (nodes) {
        var i = nodes.length,
          node;

        while (i--) {
          node = nodes[i];
          node.attr('type', 'mce-' + (node.attr('type') || 'text/javascript'));
        }
      });*/

      self.parser.addNodeFilter('#cdata', function (nodes) {
        var i = nodes.length,
          node;

        while (i--) {
          node = nodes[i];
          node.type = 8;
          node.name = '#comment';
          node.value = '[CDATA[' + node.value + ']]';
        }
      });

      self.parser.addNodeFilter('p,h1,h2,h3,h4,h5,h6,div', function (nodes) {
        var i = nodes.length,
          node, nonEmptyElements = self.schema.getNonEmptyElements();

        while (i--) {
          node = nodes[i];

          if (node.isEmpty(nonEmptyElements)) {
            node.empty().append(new tinymce.html.Node('br', 1)).shortEnded = true;
          }
        }
      });

      /**
       * DOM serializer for the editor. Will be used when contents is extracted from the editor.
       *
       * @property serializer
       * @type tinymce.dom.Serializer
       * @example
       * // Serializes the first paragraph in the editor into a string
       * tinymce.activeEditor.serializer.serialize(tinymce.activeEditor.dom.select('p')[0]);
       */
      self.serializer = new tinymce.dom.Serializer(settings, self.dom, self.schema);

      /**
       * Selection instance for the editor.
       *
       * @property selection
       * @type tinymce.dom.Selection
       * @example
       * // Sets some contents to the current selection in the editor
       * tinymce.activeEditor.selection.setContent('Some contents');
       *
       * // Gets the current selection
       * alert(tinymce.activeEditor.selection.getContent());
       *
       * // Selects the first paragraph found
       * tinymce.activeEditor.selection.select(tinymce.activeEditor.dom.select('p')[0]);
       */
      self.selection = new tinymce.dom.Selection(self.dom, self.getWin(), self.serializer, self);

      /**
       * Formatter instance.
       *
       * @property formatter
       * @type tinymce.Formatter
       */
      self.formatter = new tinymce.Formatter(self);

      /**
      * Textpattern instance.
      *
      * @property textpattern
      * @type tinymce.Textpattern
      */
      self.textpattern = new tinymce.TextPattern(self);

      /**
       * Undo manager instance, responsible for handling undo levels.
       /
       * @property undoManager
       * @type tinymce.UndoManager
       * @example
       * // Undoes the last modification to the editor
       * tinymce.activeEditor.undoManager.undo();
       */
      self.undoManager = new tinymce.UndoManager(self);

      self.forceBlocks = new tinymce.ForceBlocks(self);
      self.enterKey = new tinymce.EnterKey(self);
      // internal with no external interface
      self._nodeChangeDispatcher = new tinymce.NodeChange(self);
      self.editorCommands = new tinymce.EditorCommands(self);
      // internal with no external interface
      self._selectionOverrides = new tinymce.SelectionOverrides(self);
      // internal with no external interface
      self._clipBoard = new tinymce.Clipboard(self);

      self.onExecCommand.add(function (editor, command) {
        // Don't refresh the select lists until caret move
        if (!/^(FontName|FontSize)$/.test(command)) {
          self.nodeChanged();
        }
      });

      // Pass through
      self.serializer.onPreProcess.add(function (se, o) {
        return self.onPreProcess.dispatch(self, o, se);
      });

      self.serializer.onPostProcess.add(function (se, o) {
        return self.onPostProcess.dispatch(self, o, se);
      });

      self.onPreInit.dispatch(self);

      if (!settings.browser_spellcheck) {
        doc.body.spellcheck = false;
      }

      if (!settings.readonly) {
        self.bindNativeEvents();
      }

      self.controlManager.onPostRender.dispatch(self, self.controlManager);
      self.onPostRender.dispatch(self);

      self.quirks = tinymce.util.Quirks(self);

      if (settings.directionality) {
        body.dir = settings.directionality;
      }

      if (settings.nowrap) {
        body.style.whiteSpace = "nowrap";
      }

      // Add visual aids when new contents is added
      self.onSetContent.add(function () {
        self.addVisual(self.getBody());
      });

      // Remove empty contents
      if (settings.padd_empty_editor) {
        self.onPostProcess.add(function (ed, o) {
          o.content = o.content.replace(/^(<p[^>]*>(&nbsp;|&#160;|\s|\u00a0|)<\/p>[\r\n]*|<br \/>[\r\n]*)$/, '');
        });
      }

      self.load({
        initial: true,
        format: 'html'
      });

      self.startContent = self.getContent({
        format: 'raw'
      });

      /**
       * Is set to true after the editor instance has been initialized
       *
       * @property initialized
       * @type Boolean
       * @example
       * function isEditorInitialized(editor) {
       *     return editor && editor.initialized;
       * }
       */
      function initEditor() {
        self.initialized = true;

        self.onInit.dispatch(self);
        self.execCallback('setupcontent_callback', self.id, body, doc);
        self.execCallback('init_instance_callback', self);
        self.focus(true);
        self.nodeChanged({
          initial: true
        });

        // Handle auto focus
        if (settings.auto_focus) {
          setTimeout(function () {

            var focusEditor;

            if (settings.auto_focus === true) {
              focusEditor = self;
            } else {
              focusEditor = tinymce.get(settings.auto_focus);
            }

            if (!focusEditor.destroyed) {
              focusEditor.focus();
            }
          }, 100);
        }
      }

      // Add editor specific CSS styles
      if (self.contentStyles.length > 0) {
        contentCssText = '';

        each(self.contentStyles, function (style) {
          contentCssText += style + "\r\n";
        });

        self.dom.addStyle(contentCssText);
      }

      var styleLoader = new tinymce.dom.StyleSheetLoader(self.getDoc());

      // Load specified content CSS last
      each(self.contentCSS, function (url) {
        styleLoader.add(url);
      });

      styleLoader.loadQueue(function () {
        initEditor();
      });

      // Clean up references for IE
      targetElm = doc = body = null;
    },

    /**
     * Focuses/activates the editor. This will set this editor as the activeEditor in the tinymce collection
     * it will also place DOM focus inside the editor.
     *
     * @method focus
     * @param {Boolean} skip_focus Skip DOM focus. Just set is as the active editor.
     */
    focus: function (skip_focus) {
      EditorFocus.focus(this, skip_focus);
    },

    /**
     * Executes a legacy callback. This method is useful to call old 2.x option callbacks.
     * There new event model is a better way to add callback so this method might be removed in the future.
     *
     * @method execCallback
     * @param {String} n Name of the callback to execute.
     * @return {Object} Return value passed from callback function.
     */
    execCallback: function (n) {
      var self = this,
        f = self.settings[n],
        s;

      if (!f) {
        return;
      }

      // Look through lookup
      if (self.callbackLookup && (s = self.callbackLookup[n])) {
        f = s.func;
        s = s.scope;
      }

      if (is(f, 'string')) {
        s = f.replace(/\.\w+$/, '');
        s = s ? tinymce.resolve(s) : 0;
        f = tinymce.resolve(f);
        self.callbackLookup = self.callbackLookup || {};
        self.callbackLookup[n] = {
          func: f,
          scope: s
        };
      }

      return f.apply(s || self, Array.prototype.slice.call(arguments, 1));
    },

    /**
     * Translates the specified string by replacing variables with language pack items it will also check if there is
     * a key mathcin the input.
     *
     * @method translate
     * @param {String} s String to translate by the language pack data.
     * @return {String} Translated string.
     */
    translate: function (s) {
      var c = this.settings.language || 'en',
        i18n = tinymce.i18n;

      if (!s) {
        return '';
      }

      return i18n[c + '.' + s] || s.replace(/\{\#([^\}]+)\}/g, function (a, b) {
        return i18n[c + '.' + b] || '{#' + b + '}';
      });
    },

    /**
     * Returns a language pack item by name/key.
     *
     * @method getLang
     * @param {String} n Name/key to get from the language pack.
     * @param {String} dv Optional default value to retrive.
     */
    getLang: function (n, dv) {
      return tinymce.i18n[(this.settings.language || 'en') + '.' + n] || (is(dv) ? dv : '{#' + n + '}');
    },

    /**
     * Returns a configuration parameter by name.
     *
     * @method getParam
     * @param {String} n Configruation parameter to retrive.
     * @param {String} dv Optional default value to return.
     * @param {String} ty Optional type parameter.
     * @return {String} Configuration parameter value or default value.
     * @example
     * // Returns a specific config value from the currently active editor
     * var someval = tinymce.activeEditor.getParam('myvalue');
     *
     * // Returns a specific config value from a specific editor instance by id
     * var someval2 = tinymce.get('my_editor').getParam('myvalue');
     */
    getParam: function (n, dv, ty) {
      var tr = tinymce.trim,
        v = is(this.settings[n]) ? this.settings[n] : dv,
        o;

      if (ty === 'hash') {
        o = {};

        if (is(v, 'string')) {
          each(v.indexOf('=') > 0 ? v.split(/[;,](?![^=;,]*(?:[;,]|$))/) : v.split(','), function (v) {
            v = v.split('=');

            if (v.length > 1) {
              o[tr(v[0])] = tr(v[1]);
            } else {
              o[tr(v[0])] = tr(v);
            }
          });
        } else {
          o = v;
        }

        return o;
      }

      return v;
    },

    /**
     * Distpaches out a onNodeChange event to all observers. This method should be called when you
     * need to update the UI states or element path etc.
     *
     * @method nodeChanged
     * @param {Object} args Optional object to pass along for the node changed event.
     */
    nodeChanged: function (args) {
      this._nodeChangeDispatcher.nodeChanged(args);
    },

    /**
     * Adds a button that later gets created by the ControlManager. This is a shorter and easier method
     * of adding buttons without the need to deal with the ControlManager directly. But it's also less
     * powerfull if you need more control use the ControlManagers factory methods instead.
     *
     * @method addButton
     * @param {String} name Button name to add.
     * @param {Object} settings Settings object with title, cmd etc.
     * @example
     * // Adds a custom button to the editor and when a user clicks the button it will open
     * // an alert box with the selected contents as plain text.
     * tinymce.init({
     *    ...
     *
     *    theme_advanced_buttons1 : 'example,..'
     *
     *    setup : function(ed) {
     *       // Register example button
     *       ed.addButton('example', {
     *          title : 'example.desc',
     *          image : '../jscripts/tiny_mce/plugins/example/img/example.gif',
     *          onclick : function() {
     *             ed.windowManager.alert('Hello world!! Selection: ' + ed.selection.getContent({format : 'text'}));
     *          }
     *       });
     *    }
     * });
     */
    addButton: function (name, settings) {
      var self = this;

      self.buttons = self.buttons || {};
      self.buttons[name] = settings;
    },

    /**
     * Adds a custom command to the editor, you can also override existing commands with this method.
     * The command that you add can be executed with execCommand.
     *
     * @method addCommand
     * @param {String} name Command name to add/override.
     * @param {addCommandCallback} callback Function to execute when the command occurs.
     * @param {Object} scope Optional scope to execute the function in.
     * @example
     * // Adds a custom command that later can be executed using execCommand
     * tinymce.init({
     *    ...
     *
     *    setup : function(ed) {
     *       // Register example command
     *       ed.addCommand('mycommand', function(ui, v) {
     *          ed.windowManager.alert('Hello world!! Selection: ' + ed.selection.getContent({format : 'text'}));
     *       });
     *    }
     * });
     */
    addCommand: function (name, callback, scope) {
      /**
       * Callback function that gets called when a command is executed.
       *
       * @callback addCommandCallback
       * @param {Boolean} ui Display UI state true/false.
       * @param {Object} value Optional value for command.
       * @return {Boolean} True/false state if the command was handled or not.
       */
      this.execCommands[name] = {
        func: callback,
        scope: scope || this
      };
    },

    /**
     * Adds a custom query state command to the editor, you can also override existing commands with this method.
     * The command that you add can be executed with queryCommandState function.
     *
     * @method addQueryStateHandler
     * @param {String} name Command name to add/override.
     * @param {addQueryStateHandlerCallback} callback Function to execute when the command state retrival occurs.
     * @param {Object} scope Optional scope to execute the function in.
     */
    addQueryStateHandler: function (name, callback, scope) {
      /**
       * Callback function that gets called when a queryCommandState is executed.
       *
       * @callback addQueryStateHandlerCallback
       * @return {Boolean} True/false state if the command is enabled or not like is it bold.
       */
      this.queryStateCommands[name] = {
        func: callback,
        scope: scope || this
      };
    },

    /**
     * Adds a custom query value command to the editor, you can also override existing commands with this method.
     * The command that you add can be executed with queryCommandValue function.
     *
     * @method addQueryValueHandler
     * @param {String} name Command name to add/override.
     * @param {addQueryValueHandlerCallback} callback Function to execute when the command value retrival occurs.
     * @param {Object} scope Optional scope to execute the function in.
     */
    addQueryValueHandler: function (name, callback, scope) {
      /**
       * Callback function that gets called when a queryCommandValue is executed.
       *
       * @callback addQueryValueHandlerCallback
       * @return {Object} Value of the command or undefined.
       */
      this.queryValueCommands[name] = {
        func: callback,
        scope: scope || this
      };
    },

    /**
     * Returns true/false if the command is supported or not.
     *
     * @method queryCommandSupported
     * @param {String} cmd Command that we check support for.
     * @return {Boolean} true/false if the command is supported or not.
     */
    queryCommandSupported: function (cmd) {
      return this.editorCommands.queryCommandSupported(cmd);
    },

    /**
     * Adds a keyboard shortcut for some command or function.
     *
     * @method addShortcut
     * @param {String} pa Shortcut pattern. Like for example: ctrl+alt+o.
     * @param {String} desc Text description for the command.
     * @param {String/Function} cmd_func Command name string or function to execute when the key is pressed.
     * @param {Object} sc Optional scope to execute the function in.
     * @return {Boolean} true/false state if the shortcut was added or not.
     */
    addShortcut: function (pattern, desc, cmdFunc, scope) {
      var self = this;

      if (self.settings.custom_shortcuts === false) {
        return false;
      }

      self.shortcuts = self.shortcuts || {};

      var keyCodeLookup = {
        "f9": 120,
        "f10": 121,
        "f11": 122
      };

      var modifierNames = tinymce.makeMap('alt,ctrl,shift,meta,access');

      function parseShortcut(pattern) {
        var id, key, shortcut = {};

        // Parse modifiers and keys ctrl+alt+b for example
        each(explode(pattern, '+'), function (value) {
          if (value in modifierNames) {
            shortcut[value] = true;
          } else {
            // Allow numeric keycodes like ctrl+219 for ctrl+[
            if (/^[0-9]{2,}$/.test(value)) {
              shortcut.keyCode = parseInt(value, 10);
            } else {
              shortcut.charCode = value.charCodeAt(0);
              shortcut.keyCode = keyCodeLookup[value] || value.toUpperCase().charCodeAt(0);
            }
          }
        });

        // Generate unique id for modifier combination and set default state for unused modifiers
        id = [shortcut.keyCode];
        for (key in modifierNames) {
          if (shortcut[key]) {
            id.push(key);
          } else {
            shortcut[key] = false;
          }
        }
        shortcut.id = id.join(',');

        // Handle special access modifier differently depending on Mac/Win
        if (shortcut.access) {
          shortcut.alt = true;

          if (tinymce.isMac) {
            shortcut.ctrl = true;
          } else {
            shortcut.shift = true;
          }
        }

        // Handle special meta modifier differently depending on Mac/Win
        if (shortcut.meta) {
          if (tinymce.isMac) {
            shortcut.meta = true;
          } else {
            shortcut.ctrl = true;
            shortcut.meta = false;
          }
        }

        return shortcut;
      }

      function createShortcut(pattern, desc, cmdFunc, scope) {
        var shortcuts;

        shortcuts = tinymce.map(explode(pattern, '>'), parseShortcut);
        shortcuts[shortcuts.length - 1] = extend(shortcuts[shortcuts.length - 1], {
          func: cmdFunc,
          scope: scope || self
        });

        return extend(shortcuts[0], {
          desc: self.translate(desc),
          subpatterns: shortcuts.slice(1)
        });
      }

      /*if (is(cmd_func, 'string')) {
        c = cmd_func;

        cmd_func = function () {
          self.execCommand(c, false, null);
        };
      }

      if (is(cmd_func, 'object')) {
        c = cmd_func;

        cmd_func = function () {
          self.execCommand(c[0], c[1], c[2]);
        };
      }

      each(explode(pa), function (pa) {
        var o = {
          func: cmd_func,
          scope: sc || this,
          desc: self.translate(desc),
          alt: false,
          ctrl: false,
          shift: false
        };

        each(explode(pa, '+'), function (v) {
          switch (v) {
            case 'alt':
            case 'ctrl':
            case 'shift':
              o[v] = true;
              break;

            default:
              o.charCode = v.charCodeAt(0);
              o.keyCode = v.toUpperCase().charCodeAt(0);
          }
        });

        self.shortcuts[(o.ctrl ? 'ctrl' : '') + ',' + (o.alt ? 'alt' : '') + ',' + (o.shift ? 'shift' : '') + ',' + o.keyCode] = o;
      });*/

      var cmd;

      cmd = cmdFunc;

      if (typeof cmdFunc === 'string') {
        cmdFunc = function () {
          self.execCommand(cmd, false, null);
        };
      } else if (tinymce.isArray(cmd)) {
        cmdFunc = function () {
          self.execCommand(cmd[0], cmd[1], cmd[2]);
        };
      }

      each(explode(tinymce.trim(pattern.toLowerCase())), function (pattern) {
        var shortcut = createShortcut(pattern, desc, cmdFunc, scope);
        self.shortcuts[shortcut.id] = shortcut;
      });

      return true;
    },

    /**
     * Executes a command on the current instance. These commands can be TinyMCE internal commands prefixed with "mce" or
     * they can be build in browser commands such as "Bold". A compleate list of browser commands is available on MSDN or Mozilla.org.
     * This function will dispatch the execCommand function on each plugin, theme or the execcommand_callback option if none of these
     * return true it will handle the command as a internal browser command.
     *
     * @method execCommand
     * @param {String} cmd Command name to execute, for example mceLink or Bold.
     * @param {Boolean} ui True/false state if a UI (dialog) should be presented or not.
     * @param {mixed} val Optional command value, this can be anything.
     * @param {Object} a Optional arguments object.
     * @return {Boolean} True/false if the command was executed or not.
     */
    execCommand: function (cmd, ui, val, a) {
      var self = this,
        s = 0,
        o, st;

      if (!/^(mceAddUndoLevel|mceEndUndoLevel|mceBeginUndoLevel|mceRepaint|SelectAll)$/.test(cmd) && (!a || !a.skip_focus)) {
        self.focus();
      }

      a = extend({}, a);
      self.onBeforeExecCommand.dispatch(self, cmd, ui, val, a);

      if (a.terminate) {
        return false;
      }

      // Command callback
      if (self.execCallback('execcommand_callback', self.id, self.selection.getNode(), cmd, ui, val)) {
        self.onExecCommand.dispatch(self, cmd, ui, val, a);
        return true;
      }

      // Registred commands
      o = self.execCommands[cmd];

      if (o) {
        st = o.func.call(o.scope, ui, val);

        // Fall through on true
        if (st !== true) {
          self.onExecCommand.dispatch(self, cmd, ui, val, a);
          return st;
        }
      }

      // Plugin commands
      each(self.plugins, function (p) {
        if (p.execCommand && p.execCommand(cmd, ui, val)) {
          self.onExecCommand.dispatch(self, cmd, ui, val, a);
          s = 1;
          return false;
        }
      });

      if (s) {
        return true;
      }

      // Theme commands
      if (self.theme && self.theme.execCommand && self.theme.execCommand(cmd, ui, val)) {
        self.onExecCommand.dispatch(self, cmd, ui, val, a);
        return true;
      }

      // Editor commands
      if (self.editorCommands.execCommand(cmd, ui, val)) {
        self.onExecCommand.dispatch(self, cmd, ui, val, a);
        return true;
      }

      // Browser commands
      self.getDoc().execCommand(cmd, ui, val);
      self.onExecCommand.dispatch(self, cmd, ui, val, a);
    },

    /**
     * Returns a command specific state, for example if bold is enabled or not.
     *
     * @method queryCommandState
     * @param {string} cmd Command to query state from.
     * @return {Boolean} Command specific state, for example if bold is enabled or not.
     */
    queryCommandState: function (cmd) {
      var self = this,
        o, s;

      // Is hidden then return undefined
      if (self._isHidden()) {
        return;
      }

      // Registred commands
      o = self.queryStateCommands[cmd];

      if (o) {
        s = o.func.call(o.scope);

        // Fall though on true
        if (s !== true) {
          return s;
        }
      }

      // Registred commands
      o = self.editorCommands.queryCommandState(cmd);

      if (o !== -1) {
        return o;
      }

      // Browser commands
      try {
        return this.getDoc().queryCommandState(cmd);
      } catch (ex) {
        // Fails sometimes see bug: 1896577
      }
    },

    /**
     * Returns a command specific value, for example the current font size.
     *
     * @method queryCommandValue
     * @param {string} c Command to query value from.
     * @return {Object} Command specific value, for example the current font size.
     */
    queryCommandValue: function (c) {
      var self = this,
        o, s;

      // Is hidden then return undefined
      if (self._isHidden()) {
        return;
      }

      // Registred commands
      o = self.queryValueCommands[c];

      if (o) {
        s = o.func.call(o.scope);

        // Fall though on true
        if (s !== true) {
          return s;
        }
      }

      // Registred commands
      o = self.editorCommands.queryCommandValue(c);

      if (is(o)) {
        return o;
      }

      // Browser commands
      try {
        return this.getDoc().queryCommandValue(c);
      } catch (ex) {
        // Fails sometimes see bug: 1896577
      }
    },

    /**
     * Shows the editor and hides any textarea/div that the editor is supposed to replace.
     *
     * @method show
     */
    show: function () {
      var self = this;

      DOM.show(self.getContainer());
      DOM.hide(self.id);
      self.load();

      self.onShow.dispatch(self);
    },

    /**
     * Hides the editor and shows any textarea/div that the editor is supposed to replace.
     *
     * @method hide
     */
    hide: function () {
      var self = this,
        doc = self.getDoc();

      // Fixed bug where IE has a blinking cursor left from the editor
      if (isIE && doc) {
        doc.execCommand('SelectAll');
      }

      // We must save before we hide so Safari doesn't crash
      self.save();

      // defer the call to hide to prevent an IE9 crash #4921
      DOM.hide(self.getContainer());
      DOM.setStyle(self.id, 'display', self.orgDisplay);

      self.onHide.dispatch(self);
    },

    /**
     * Returns true/false if the editor is hidden or not.
     *
     * @method isHidden
     * @return {Boolean} True/false if the editor is hidden or not.
     */
    isHidden: function () {
      return !DOM.isHidden(this.id);
    },

    /**
     * Sets the progress state, this will display a throbber/progess for the editor.
     * This is ideal for asycronous operations like an AJAX save call.
     *
     * @method setProgressState
     * @param {Boolean} b Boolean state if the progress should be shown or hidden.
     * @param {Number} ti Optional time to wait before the progress gets shown.
     * @param {Object} o Optional object to pass to the progress observers.
     * @return {Boolean} Same as the input state.
     * @example
     * // Show progress for the active editor
     * tinymce.activeEditor.setProgressState(true);
     *
     * // Hide progress for the active editor
     * tinymce.activeEditor.setProgressState(false);
     *
     * // Show progress after 3 seconds
     * tinymce.activeEditor.setProgressState(true, 3000);
     */
    setProgressState: function (b, ti, o) {
      this.onSetProgressState.dispatch(this, b, ti, o);

      return b;
    },

    /**
     * Loads contents from the textarea or div element that got converted into an editor instance.
     * This method will move the contents from that textarea or div into the editor by using setContent
     * so all events etc that method has will get dispatched as well.
     *
     * @method load
     * @param {Object} o Optional content object, this gets passed around through the whole load process.
     * @return {String} HTML string that got set into the editor.
     */
    load: function (o) {
      var self = this,
        e = self.getElement(),
        h;

      if (e) {
        o = o || {};
        o.load = true;

        // Double encode existing entities in the value
        h = self.setContent(is(e.value) ? e.value : e.innerHTML, o);
        o.element = e;

        if (!o.no_events) {
          self.onLoadContent.dispatch(self, o);
        }

        o.element = e = null;

        return h;
      }
    },

    /**
     * Saves the contents from a editor out to the textarea or div element that got converted into an editor instance.
     * This method will move the HTML contents from the editor into that textarea or div by getContent
     * so all events etc that method has will get dispatched as well.
     *
     * @method save
     * @param {Object} o Optional content object, this gets passed around through the whole save process.
     * @return {String} HTML string that got set into the textarea/div.
     */
    save: function (o) {
      var self = this,
        e = self.getElement(),
        h, f;

      if (!e || !self.initialized) {
        return;
      }

      o = o || {};
      o.save = true;

      o.element = e;
      h = o.content = self.getContent(o);

      if (!o.no_events) {
        self.onSaveContent.dispatch(self, o);
      }

      h = o.content;

      if (!/TEXTAREA|INPUT/i.test(e.nodeName)) {
        e.innerHTML = h;

        // Update hidden form element
        f = DOM.getParent(self.id, 'form');

        if (f) {
          each(f.elements, function (e) {
            if (e.name == self.id) {
              e.value = h;
              return false;
            }
          });
        }
      } else {
        e.value = h;
      }

      o.element = e = null;

      if (o.set_dirty !== false) {
        self.setDirty(false);
      }

      return h;
    },

    /**
     * Sets the specified content to the editor instance, this will cleanup the content before it gets set using
     * the different cleanup rules options.
     *
     * @method setContent
     * @param {String} content Content to set to editor, normally HTML contents but can be other formats as well.
     * @param {Object} args Optional content object, this gets passed around through the whole set process.
     * @return {String} HTML string that got set into the editor.
     * @example
     * // Sets the HTML contents of the activeEditor editor
     * tinymce.activeEditor.setContent('<span>some</span> html');
     *
     * // Sets the raw contents of the activeEditor editor
     * tinymce.activeEditor.setContent('<span>some</span> html', {format : 'raw'});
     *
     * // Sets the content of a specific editor (my_editor in this example)
     * tinymce.get('my_editor').setContent(data);
     *
     * // Sets the bbcode contents of the activeEditor editor if the bbcode plugin was added
     * tinymce.activeEditor.setContent('[b]some[/b] html', {format : 'bbcode'});
     */
    setContent: function (content, args) {
      var self = this,
        body = self.getBody(),
        forcedRootBlockName;

      // Setup args object
      args = args || {};
      args.format = args.format || 'html';
      args.set = true;
      args.content = content;

      // Do preprocessing
      if (!args.no_events) {
        self.onBeforeSetContent.dispatch(self, args);
      }

      content = args.content;

      // Padd empty content in Gecko and Safari. Commands will otherwise fail on the content
      // It will also be impossible to place the caret in the editor unless there is a BR element present
      if (content.length === 0 || /^\s+$/.test(content)) {
        forcedRootBlockName = self.settings.forced_root_block;

        // Check if forcedRootBlock is configured and that the block is a valid child of the body
        if (forcedRootBlockName && self.schema.isValidChild(body.nodeName.toLowerCase(), forcedRootBlockName.toLowerCase())) {
          if (isIE) {
            // IE renders BR elements in blocks so lets just add an empty block
            content = '<' + forcedRootBlockName + '></' + forcedRootBlockName + '>';
          } else {
            content = '<' + forcedRootBlockName + '><br data-mce-bogus="1"></' + forcedRootBlockName + '>';
          }
        } else if (!isIE) {
          // We need to add a BR when forced_root_block is disabled on non IE browsers to place the caret
          content = '<br data-mce-bogus="1">';
        }

        self.dom.setHTML(body, content);
        self.onSetContent.dispatch(self, args);
      } else {
        // Parse and serialize the html
        if (args.format !== 'raw') {
          content = new tinymce.html.Serializer({}, self.schema).serialize(
            self.parser.parse(content)
          );
        }

        // Set the new cleaned contents to the editor
        args.content = tinymce.trim(content);
        self.dom.setHTML(body, args.content);

        // Do post processing
        if (!args.no_events) {
          self.onSetContent.dispatch(self, args);
        }

        // Don't normalize selection if the focused element isn't the body in content editable mode since it will steal focus otherwise
        /*if (!self.settings.content_editable || document.activeElement === self.getBody()) {
          self.selection.normalize();
        }*/
      }

      return args.content;
    },

    insertContent: function (value) {
      this.execCommand('mceInsertContent', false, value);
    },

    getSelection: function () {
      return this.selection.getContent();
    },

    /**
     * Gets the content from the editor instance, this will cleanup the content before it gets returned using
     * the different cleanup rules options.
     *
     * @method getContent
     * @param {Object} args Optional content object, this gets passed around through the whole get process.
     * @return {String} Cleaned content string, normally HTML contents.
     * @example
     * // Get the HTML contents of the currently active editor
     * console.debug(tinymce.activeEditor.getContent());
     *
     * // Get the raw contents of the currently active editor
     * tinymce.activeEditor.getContent({format : 'raw'});
     *
     * // Get content of a specific editor:
     * tinymce.get('content id').getContent()
     */
    getContent: function (args) {
      var self = this,
        content, body = self.getBody();

      // Setup args object
      args = args || {};
      args.format = args.format || 'html';
      args.get = true;
      args.getInner = true;

      self._selectionOverrides.hideFakeCaret();
      self._selectionOverrides.destroy();

      // Do preprocessing
      if (!args.no_events) {
        self.onBeforeGetContent.dispatch(self, args);
      }

      // Get raw contents or by default the cleaned contents
      if (args.format == 'raw') {
        content = tinymce.trim(Zwsp.trim(TrimBody.trim(body, self.serializer.getTempAttrs()).innerHTML));
      } else if (args.format == 'text') {
        content = body.innerText || body.textContent;
      } else {
        content = self.serializer.serialize(body, args);
      }

      // Trim whitespace in beginning/end of HTML
      if (args.format != 'text') {
        args.content = tinymce.trim(content);
      } else {
        args.content = content;
      }

      // Do post processing
      if (!args.no_events) {
        self.onGetContent.dispatch(self, args);
      }

      return args.content;
    },

    setDirty: function (state) {
      this.isNotDirty = !state;
    },

    /**
     * Returns true/false if the editor is dirty or not. It will get dirty if the user has made modifications to the contents.
     *
     * @method isDirty
     * @return {Boolean} True/false if the editor is dirty or not. It will get dirty if the user has made modifications to the contents.
     * @example
     * if (tinymce.activeEditor.isDirty())
     *     alert("You must save your contents.");
     */
    isDirty: function () {
      return !this.isNotDirty;
    },

    /**
     * Returns the editors container element. The container element wrappes in
     * all the elements added to the page for the editor. Such as UI, iframe etc.
     *
     * @method getContainer
     * @return {Element} HTML DOM element for the editor container.
     */
    getContainer: function () {
      var self = this;

      if (!self.container) {
        self.container = DOM.get(self.editorContainer || self.id + '_parent');
      }

      return self.container;
    },

    /**
     * Returns the editors content area container element. The this element is the one who
     * holds the iframe or the editable element.
     *
     * @method getContentAreaContainer
     * @return {Element} HTML DOM element for the editor area container.
     */
    getContentAreaContainer: function () {
      return this.contentAreaContainer;
    },

    /**
     * Returns the target element/textarea that got replaced with a TinyMCE editor instance.
     *
     * @method getElement
     * @return {Element} HTML DOM element for the replaced element.
     */
    getElement: function () {
      return DOM.get(this.settings.content_element || this.id);
    },

    /**
     * Returns the iframes window object.
     *
     * @method getWin
     * @return {Window} Iframe DOM window object.
     */
    getWin: function () {
      var self = this,
        elm;

      if (!self.contentWindow) {
        elm = DOM.get(self.id + "_ifr");

        if (elm) {
          self.contentWindow = elm.contentWindow;
        }
      }

      return self.contentWindow;
    },

    /**
     * Returns the iframes document object.
     *
     * @method getDoc
     * @return {Document} Iframe DOM document object.
     */
    getDoc: function () {
      var self = this,
        win;

      if (!self.contentDocument) {
        win = self.getWin();

        if (win) {
          self.contentDocument = win.document;
        }
      }

      return self.contentDocument;
    },

    /**
     * Returns the iframes body element.
     *
     * @method getBody
     * @return {Element} Iframe body element.
     */
    getBody: function () {
      return this.bodyElement || this.getDoc().body;
    },

    /**
     * URL converter function this gets executed each time a user adds an img, a or
     * any other element that has a URL in it. This will be called both by the DOM and HTML
     * manipulation functions.
     *
     * @method convertURL
     * @param {string} url URL to convert.
     * @param {string} name Attribute name src, href etc.
     * @param {string/HTMLElement} elm Tag name or HTML DOM element depending on HTML or DOM insert.
     * @return {string} Converted URL string.
     */
    convertURL: function (url, name, elm) {
      var self = this,
        settings = self.settings;

      // Use callback instead
      if (settings.urlconverter_callback) {
        return self.execCallback('urlconverter_callback', url, elm, true, name);
      }

      // Don't convert link href since thats the CSS files that gets loaded into the editor also skip local file URLs
      if (!settings.convert_urls || (elm && elm.nodeName == 'LINK') || url.indexOf('file:') === 0) {
        return url;
      }

      // Convert to relative
      if (settings.relative_urls) {
        return self.documentBaseURI.toRelative(url);
      }

      // Convert to absolute
      url = self.documentBaseURI.toAbsolute(url, settings.remove_script_host);

      return url;
    },

    /**
     * Adds visual aid for tables, anchors etc so they can be more easily edited inside the editor.
     *
     * @method addVisual
     * @param {Element} elm Optional root element to loop though to find tables etc that needs the visual aid.
     */
    addVisual: function (elm) {
      var self = this,
        settings = self.settings,
        dom = self.dom,
        cls;

      elm = elm || self.getBody();

      if (!is(self.hasVisual)) {
        self.hasVisual = settings.visual;
      }

      // add visualaid class to editor body
      if (self.hasVisual) {
        dom.addClass(self.getBody(), 'mce-visualaid');
      } else {
        dom.removeClass(self.getBody(), 'mce-visualaid');
      }

      each(dom.select('table,a', elm), function (elm) {
        var value;

        switch (elm.nodeName) {
          case 'TABLE':
            cls = settings.visual_table_class || 'mce-item-table';
            value = dom.getAttrib(elm, 'border');

            if (!value || value == '0') {
              if (self.hasVisual) {
                dom.addClass(elm, cls);
              } else {
                dom.removeClass(elm, cls);
              }
            }

            return;

          case 'A':
            if (!dom.getAttrib(elm, 'href', false)) {
              value = dom.getAttrib(elm, 'name') || elm.id;
              cls = 'mce-item-anchor';

              if (value) {
                if (self.hasVisual) {
                  dom.addClass(elm, cls);
                } else {
                  dom.removeClass(elm, cls);
                }
              }
            }

            return;
        }
      });

      self.onVisualAid.dispatch(self, elm, self.hasVisual);
    },


    /**
     * Removes the editor from the dom and tinymce collection.
     *
     * @method remove
     */
    remove: function () {
      var self = this,
        elm = self.getContainer(),
        doc = self.getDoc();

      if (!self.removed) {
        self.removed = 1; // Cancels post remove event execution

        // Fixed bug where IE has a blinking cursor left from the editor
        if (isIE && doc) {
          doc.execCommand('SelectAll');
        }

        // We must save before we hide so Safari doesn't crash
        self.save();

        DOM.setStyle(self.id, 'display', self.orgDisplay);
        self.getBody().onload = null; // Prevent #6816

        // Don't clear the window or document if content editable
        // is enabled since other instances might still be present
        if (!self.settings.content_editable) {
          Event.unbind(self.getWin());
          Event.unbind(self.getDoc());
        }

        Event.unbind(self.getBody());
        Event.clear(elm);

        self.execCallback('remove_instance_callback', self);
        self.onRemove.dispatch(self);

        // Clear all execCommand listeners this is required to avoid errors if the editor was removed inside another command
        self.onExecCommand.listeners = [];

        self._selectionOverrides.destroy();

        tinymce.remove(self);
        DOM.remove(elm);
      }
    },

    /**
     * Destroys the editor instance by removing all events, element references or other resources
     * that could leak memory. This method will be called automatically when the page is unloaded
     * but you can also call it directly if you know what you are doing.
     *
     * @method destroy
     * @param {Boolean} s Optional state if the destroy is an automatic destroy or user called one.
     */
    destroy: function (s) {
      var self = this;

      // One time is enough
      if (self.destroyed) {
        return;
      }

      // We must unbind on Gecko since it would otherwise produce the pesky "attempt to run compile-and-go script on a cleared scope" message
      if (isGecko) {
        Event.unbind(self.getDoc());
        Event.unbind(self.getWin());
        Event.unbind(self.getBody());
      }

      if (!s) {
        tinymce.removeUnload(self.destroy);
        tinymce.onBeforeUnload.remove(self._beforeUnload);

        // Manual destroy
        if (self.theme && self.theme.destroy) {
          self.theme.destroy();
        }

        // Destroy controls, selection and dom
        self.controlManager.destroy();
        self.selection.destroy();
        self.dom.destroy();
      }

      if (self.formElement) {
        self.formElement.submit = self.formElement._mceOldSubmit;
        self.formElement._mceOldSubmit = null;
      }

      self.contentAreaContainer = self.formElement = self.container = self.settings.content_element = self.bodyElement = self.contentDocument = self.contentWindow = null;

      if (self.selection) {
        self.selection = self.selection.win = self.selection.dom = self.selection.dom.doc = null;
      }

      self.destroyed = 1;
    },

    setMode: function (disabled) {
      // It will not steal focus while setting contentEditable
      var body = self.getBody();
      body.contentEditable = disabled;
      body.disabled = disabled;
    },

    _isHidden: function () {
      var s;

      if (!isGecko) {
        return 0;
      }

      // Weird, wheres that cursor selection?
      s = this.selection.getSel();
      return (!s || !s.rangeCount || s.rangeCount === 0);
    }
  };
})(tinymce);