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
  var DOM = tinymce.DOM,
    Event = tinymce.dom.Event;

  /**
   * This class is used to create a UI button. A button is basically a link
   * that is styled to look like a button or icon.
   *
   * @class tinymce.ui.MenuButton
   * @extends tinymce.ui.Control
   * @example
   * // Creates a new plugin class and a custom menu button
   * tinymce.create('tinymce.plugins.ExamplePlugin', {
   *     createControl: function(n, cm) {
   *         switch (n) {
   *             case 'mymenubutton':
   *                 var c = cm.createSplitButton('mysplitbutton', {
   *                     title : 'My menu button',
   *                     image : 'some.gif'
   *                 });
   *
   *                 c.onRenderMenu.add(function(c, m) {
   *                     m.add({title : 'Some title', 'class' : 'mceMenuItemTitle'}).setDisabled(1);
   *
   *                     m.add({title : 'Some item 1', onclick : function() {
   *                         alert('Some item 1 was clicked.');
   *                     }});
   *
   *                     m.add({title : 'Some item 2', onclick : function() {
   *                         alert('Some item 2 was clicked.');
   *                     }});
   *               });
   *
   *               // Return the new menubutton instance
   *               return c;
   *         }
   *
   *         return null;
   *     }
   * });
   */
  tinymce.create('tinymce.ui.MenuButton:tinymce.ui.Button', {
    /**
     * Constructs a new split button control instance.
     *
     * @constructor
     * @method MenuButton
     * @param {String} id Control id for the split button.
     * @param {Object} s Optional name/value settings object.
     * @param {Editor} ed Optional the editor instance this button is for.
     */
    MenuButton: function (id, s, ed) {
      this._super(id, s, ed);

      /**
       * Fires when the menu is rendered.
       *
       * @event onRenderMenu
       */
      this.onRenderMenu = new tinymce.util.Dispatcher(this);

      s.menu_container = s.menu_container || DOM.doc.body;
    },

    /**
     * Shows the menu.
     *
     * @method showMenu
     */
    showMenu: function () {
      var self = this,
        pos, e = DOM.get(self.id),
        m;

      if (self.isDisabled()) {
        return;
      }

      if (!self.isMenuRendered) {
        self.renderMenu();
        self.isMenuRendered = true;
      }

      if (self.isMenuVisible) {
        return self.hideMenu();
      }

      pos = DOM.getPos(e);

      m = self.menu;
      m.settings.offset_x = pos.x;
      m.settings.offset_y = pos.y;
      m.settings.vp_offset_x = pos.x;
      m.settings.vp_offset_y = pos.y;
      m.settings.keyboard_focus = self._focused;
      m.settings.trigger = e;
      m.showMenu(0, e.offsetHeight);

      Event.add(DOM.doc, 'mousedown', self.hideMenu, self);
      self.setState('Selected', 1);

      self.isMenuVisible = 1;

      self.setAriaProperty('expanded', true);
    },

    /**
     * Renders the menu to the DOM.
     *
     * @method renderMenu
     */
    renderMenu: function () {
      var self = this,
        m;

      m = self.settings.control_manager.createDropMenu(self.id + '_menu', {
        class: this.classPrefix + 'Menu',
        icons: self.settings.icons,
        max_width: this.settings.max_width,
        max_height: this.settings.max_height,
        keyboard_focus: true,
        onselect: this.settings.onselect,
        title: this.settings.title
      });

      m.onHideMenu.add(function () {
        self.hideMenu();
        self.focus();
      });

      self.onRenderMenu.dispatch(self, m);
      self.menu = m;
    },

    /**
     * Hides the menu. The optional event parameter is used to check where the event occurred so it
     * doesn'self close them menu if it was a event inside the menu.
     *
     * @method hideMenu
     * @param {Event} e Optional event object.
     */
    hideMenu: function (e) {
      var self = this;

      // Prevent double toogles by canceling the mouse click event to the button
      if (e && e.type == "mousedown" && DOM.getParent(e.target, function (e) {
        return e.id === self.id || e.id === self.id + '_open';
      })) {
        return;
      }

      if (!e || !DOM.getParent(e.target, '.mceMenu')) {
        self.setState('Selected', 0);
        Event.remove(DOM.doc, 'mousedown', self.hideMenu, self);
        if (self.menu) {
          self.menu.hideMenu();
        }
      }

      self.isMenuVisible = 0;
      self.setAriaProperty('expanded', false);
    },

    /**
     * Post render handler. This function will be called after the UI has been
     * rendered so that events can be added.
     *
     * @method postRender
     */
    postRender: function () {
      var self = this,
        s = self.settings;

      this._super();

      Event.add(self.id, 'click', function (evt) {
        if (!self.isDisabled()) {
          if (s.onclick) {
            s.onclick(evt, self.value);
          }

          self.showMenu();
        }
      });
    }
  });
})(tinymce);