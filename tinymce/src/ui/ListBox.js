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
    Event = tinymce.dom.Event,
    each = tinymce.each,
    Dispatcher = tinymce.util.Dispatcher,
    undef;

  /**
   * This class is used to create list boxes/select list. This one will generate
   * a non native control. This one has the benefits of having visual items added.
   *
   * @class tinymce.ui.ListBox
   * @extends tinymce.ui.Control
   * @example
   * // Creates a new plugin class and a custom listbox
   * tinymce.create('tinymce.plugins.ExamplePlugin', {
   *     createControl: function(n, cm) {
   *         switch (n) {
   *             case 'mylistbox':
   *                 var mlb = cm.createListBox('mylistbox', {
   *                      title : 'My list box',
   *                      onselect : function(v) {
   *                          tinymce.activeEditor.windowManager.alert('Value selected:' + v);
   *                      }
   *                 });
   *
   *                 // Add some values to the list box
   *                 mlb.add('Some item 1', 'val1');
   *                 mlb.add('some item 2', 'val2');
   *                 mlb.add('some item 3', 'val3');
   *
   *                 // Return the new listbox instance
   *                 return mlb;
   *         }
   *
   *         return null;
   *     }
   * });
   *
   * // Register plugin with a short name
   * tinymce.PluginManager.add('example', tinymce.plugins.ExamplePlugin);
   *
   * // Initialize TinyMCE with the new plugin and button
   * tinymce.init({
   *    ...
   *    plugins : '-example', // - means TinyMCE will not try to load it
   *    theme_advanced_buttons1 : 'mylistbox' // Add the new example listbox to the toolbar
   * });
   */

  var specialKeyCodeMap = {
    9: 'tab',
    17: 'ctrl',
    18: 'alt',
    27: 'esc',
    //32: 'space',
    37: 'left',
    39: 'right',
    13: 'enter',
    91: 'cmd',
    38: 'up',
    40: 'down'
  };

  tinymce.create('tinymce.ui.ListBox:tinymce.ui.Control', {
    /**
     * Constructs a new listbox control instance.
     *
     * @constructor
     * @method ListBox
     * @param {String} id Control id for the list box.
     * @param {Object} s Optional name/value settings object.
     * @param {Editor} ed Optional the editor instance this button is for.
     */
    ListBox: function (id, s, ed) {
      this._super(id, s, ed);

      // set a control type
      this.type = 'listbox';

      /**
       * Array of ListBox items.
       *
       * @property items
       * @type Array
       */
      this.items = s.items || [];

      /**
       * Fires when the selection has been changed.
       *
       * @event onChange
       */
      this.onChange = new Dispatcher(this);

      /**
       * Fires after the element has been rendered to DOM.
       *
       * @event onPostRender
       */
      this.onPostRender = new Dispatcher(this);

      /**
       * Fires when a new item is added.
       *
       * @event onAdd
       */
      this.onAdd = new Dispatcher(this);

      /**
       * Fires before the menu gets rendered.
       *
       * @event onBeforeRenderMenu
       */
      this.onBeforeRenderMenu = new Dispatcher(this);

      /**
       * Fires when the menu gets rendered.
       *
       * @event onRenderMenu
       */
      this.onRenderMenu = new Dispatcher(this);

      /**
       * Class prefix to identify and style control.
       * 
       * @type String
       */
      this.classPrefix = 'mceListBox';
    },

    deselectAll: function () {
      var self = this;

      each(self.items, function (item) {
        item.selected = false;
      });

      if (self.menu) {
        self.menu.deselectAll();
      }
    },

    /**
     * Selects a item/option by value. This will both add a visual selection to the
     * item and change the title of the control to the title of the option.
     *
     * @method select
     * @param {String/function} value Value to look for inside the list box or a function selector.
     */
    select: function (values) {
      var self = this, fv;

      if (values == null || values == undef) {
        return this.selectByIndex(-1);
      }

      if (!values.length) {
        this.deselectAll();
        return this.selectByIndex(-1);
      }

      // reset
      if (!this.settings.multiple) {
        this.deselectAll();
      }

      // used by fontselect etc.
      if (typeof values == "function") {
        each(self.items, function (item, i) {
          if (values(item.value)) {
            self.selectByIndex(i);
            fv = true;
          }
        });

        if (!fv) {
          self.selectByIndex(-1);
        }

        return;
      }

      if (tinymce.is(values, 'string')) {
        if (self.settings.multiple && self.settings.seperator) {
          values = values.split(self.settings.seperator);
        } else {
          values = [values];
        }
      }

      each(values, function (value) {
        var i = self.findItem(value);

        if (i == -1) {
          // add a new custom combobox value
          if (self.settings.combobox) {
            i = self.add(value, value);
          }
        }

        self.selectByIndex(i);
      });

      // clear combobox and add a tag for each selected item
      if (this.settings.combobox) {
        this.clearComboBox(true);

        if (this.settings.multiple) {
          each(this.items, function (item) {
            if (item.selected) {
              self.addTag(item.value);
            }
          });
        }
      }
    },

    value: function (val) {
      if (!arguments.length) {
        val = [];

        each(this.items, function (item) {
          if (item.selected) {
            val.push(item.value);
          }
        });

        return val.join(' ').trim();
      }

      this.select(val);
      this.settings.onselect.call(this, val);
    },

    /**
     * Selects a item/option by index. This will both add a visual selection to the
     * item and change the title of the control to the title of the option.
     *
     * @method selectByIndex
     * @param {String} idx Index to select, pass -1 to select menu/title of select box.
     */
    selectByIndex: function (idx) {
      var self = this, elm, item;

      elm = DOM.get(this.id + '_text');
      item = this.items[idx];

      if (item) {
        item.selected = !item.selected;

        if (item.selected) {
          this.selectedValue = item.value;
        } else {
          this.selectedValue = null;
        }

        if (!this.settings.combobox) {
          DOM.setHTML(elm, DOM.encode(item.title));
          DOM.removeClass(elm, 'mceTitle');
          DOM.setAttrib(this.id, 'aria-valuenow', item.title);
        }

        if (self.menu) {          
          self.menu.selectItem(self.menu.items[item.id], item.selected);
        }

      } else {
        DOM.setHTML(elm, DOM.encode(this.settings.title));
        DOM.addClass(elm, 'mceTitle');
        this.selectedValue = null;

        DOM.setAttrib(this.id, 'aria-valuenow', this.settings.title);

        if (self.settings.multiple) {
          self.deselectAll();
        }
      }
    },

    /**
     * Adds a option item to the list box.
     *
     * @method add
     * @param {String} name Title for the new option.
     * @param {String} value Value for the new option.
     * @param {Object} settings Optional object with settings like for example class.
     */
    add: function (name, value, settings) {
      settings = settings || {};

      // don't add if it already exists
      if (this.findItem(value) != -1) {
        return;
      }

      settings = tinymce.extend(settings, {
        title: name,
        value: value
      });

      var len = this.items.push(settings);
      this.onAdd.dispatch(this, settings);

      return len - 1;
    },

    findItem: function (value) {
      var idx = -1;

      for (var i = 0, len = this.items.length; i < len; i++) {
        if (this.items[i].value === value) {
          idx = i;
        }
      }

      return idx;
    },

    /**
     * Returns the number of items inside the list box.
     *
     * @method getLength
     * @param {Number} Number of items inside the list box.
     */
    getLength: function () {
      return this.items.length;
    },

    /**
     * Renders the list box as a HTML string. This method is much faster than using the DOM and when
     * creating a whole toolbar with buttons it does make a lot of difference.
     *
     * @method renderHTML
     * @return {String} HTML for the list box control element.
     */
    renderHTML: function () {
      var html = '',
        prefix = this.classPrefix;

      if (this.settings.combobox) {

        var inp = DOM.createHTML('input', {
          type: 'text',
          id: this.id + '_input',
          tabindex: -1,
          autocomplete: 'off',
          spellcheck: false,
          autocapitalize: 'off',
          class: 'mceText',
          placeholder: '...'
        });

        html += DOM.createHTML('div', {
          class: 'mceComboBox'
        }, inp);

      } else {
        html += DOM.createHTML('button', {
          type: 'button',
          id: this.id + '_text',
          tabindex: -1,
          class: 'mceText'
        }, DOM.encode(this.settings.title));
      }

      html += DOM.createHTML('button', {
        type: 'button',
        id: this.id + '_open',
        tabindex: -1,
        class: 'mceOpen'
      });

      return DOM.createHTML('div', {
        id: this.id,
        role: this.settings.combobox ? 'combobox' : 'listbox',
        tabindex: 0,
        'class': prefix + ' ' + this.settings['class'],
        title: this.settings.title,
        'aria-label': this.settings.title,
        'aria-haspopup': 'true',
        'aria-expanded': false
      }, html);
    },

    clearComboBox: function (removetags) {
      var self = this, input = DOM.get(self.id + '_input');

      // find and clear input element
      input.value = '';
      
      if (removetags) {
        DOM.remove(DOM.select('.mceButtonTag', this.id));
      }
    },

    removeTag: function (btn) {
      var self = this;

      each(self.items, function (item, i) {
        if (item.value === btn.value) {
          item.selected = false;

          if (self.selectedValue == item.value) {
            self.selectedValue = null;
          }
        }
      });

      Event.clear(btn);
      DOM.remove(btn);
    },

    addTag: function (value) {
      var self = this, btn, inp;

      inp = DOM.get(self.id + '_input');

      btn = DOM.create('button', {
        'class': 'mceButton mceButtonTag',
        'value': value
      }, '<label>' + value + '</label>');

      DOM.insertBefore(btn, inp);

      Event.add(btn, 'click', function (evt) {
        evt.preventDefault();

        if (evt.target.nodeName == 'LABEL') {
          return;
        }

        self.removeTag(btn);
      });
    },

    /**
     * Displays the drop menu with all items.
     *
     * @method showMenu
     */
    showMenu: function () {
      var self = this,
        pos, elm = DOM.get(this.id),
        menu;

      if (this.isDisabled()) {
        return;
      }

      if (!this.isMenuRendered) {
        this.renderMenu();
        this.isMenuRendered = true;
      }

      if (this.items.length === 0) {
        return;
      }

      pos = DOM.getPos(elm);

      menu = this.menu;
      menu.settings.offset_x = pos.x;
      menu.settings.offset_y = pos.y;
      menu.settings.trigger = elm;

      if (!this.settings.max_width) {
        menu.settings.max_width = elm.offsetWidth;
      }

      // Select in menu
      each(this.items, function (item) {
        if (menu.items[item.id]) {
          // deselect all items
          menu.items[item.id].setSelected(0);

          // select if value match or selected
          if (item.value === self.selectedValue || item.selected) {
            menu.items[item.id].setSelected(1);
          }
        }
      });

      menu.showMenu(0, elm.clientHeight, 0, pos.y);

      Event.add(DOM.doc, 'mousedown', this.hideMenu, this);

      DOM.addClass(this.id, this.classPrefix + 'Selected');

      this.setAriaProperty('expanded', true);
    },

    /**
     * Hides the drop menu.
     *
     * @method hideMenu
     */
    hideMenu: function (e) {
      if (!this.menu) {
        return;
      }

      // Prevent double toggles by canceling the mouse click event to the button
      if (e && e.type == "mousedown" && (e.target.id == this.id + '_text' || e.target.id == this.id + '_open')) {
        return;
      }

      if (!e || !DOM.getParent(e.target, '.mceMenu')) {
        DOM.removeClass(this.id, this.classPrefix + 'Selected');
        Event.remove(DOM.doc, 'mousedown', this.hideMenu, this);

        this.menu.hideMenu();
      }

      this.setAriaProperty('expanded', false);
    },

    /**
     * Renders the menu to the DOM.
     *
     * @method renderMenu
     */
    renderMenu: function () {
      var self = this,
        menu;

        var cls = this.classPrefix + 'Menu' + (this.settings.menu_class ? ' ' + this.settings.menu_class : '');

      menu = this.settings.control_manager.createDropMenu(this.id + '_menu', {
        class: cls,
        max_width: this.settings.max_width || 250,
        max_height: this.settings.max_height || '',
        filter: !!this.settings.filter,
        keyboard_focus: true,
        onselect: function (value, item) {
          if (self.settings.onselect(value, item) !== false) {
            self.select(value);
            menu.close();
          }
        }
      });

      menu.onHideMenu.add(function () {
        self.hideMenu();

        if (self.settings.combobox) {
          menu.clearFilteredItems();
          self.focus();
        }

      });

      // fire onBeforeRenderMenu, which allows list items to be added before display
      this.onBeforeRenderMenu.dispatch(this, menu);

      each(this.items, function (item) {
        // No value then treat it as a title
        if (item.value === undef) {
          menu.add({
            title: item.title,
            role: "option",
            onAction: function (e) {
              if (self.settings.onselect('') !== false) {
                self.select('');
              }

              menu.close();
            }
          });
        } else {
          item.id = DOM.uniqueId();
          item.role = "option";
          item.onAction = function (e) {
            if (self.settings.onselect(item.value, item) !== false) {
              self.select(item.value);
            }

            if (!self.settings.multiple && !self.settings.keepopen) {
              menu.close();
            }
          };

          menu.add(item);
        }
      });

      this.onRenderMenu.dispatch(this, menu);
      this.menu = menu;
    },

    /**
     * Post render event. This will be executed after the control has been rendered and can be used to
     * set states, add events to the control etc. It's recommended for subclasses of the control to call this method by using this._super().
     *
     * @method postRender
     */
    postRender: function () {
      var self = this;

      // clean up
      self.destroy();

      Event.add(this.id, 'click', function (evt) {
        if (evt.target.nodeName == "INPUT" || DOM.hasClass(evt.target, 'mceButtonTag')) {
          return;
        }

        if (self.menu && self.menu.isMenuVisible) {
          self.hideMenu(evt);
        } else {
          self.showMenu(evt);
        }

        Event.cancel(evt);
      });

      Event.add(this.id, 'keydown', function (evt) {
        if (evt.target.nodeName === "INPUT") {
          return;
        }

        if (evt.keyCode == 32) { // Space
          if (self.menu && self.menu.isMenuVisible) {
            self.hideMenu(evt);
          } else {
            self.showMenu(evt);
          }

          Event.cancel(evt);
        }
      });

      Event.add(this.id + '_input', 'keyup', function (evt) {

        setTimeout(function () {
          var value = evt.target.value;

          if (!value) {
            Event.cancel(evt);
            self.hideMenu();
            return;
          }

          if (!specialKeyCodeMap[evt.keyCode]) {
            if (!self.menu || !self.menu.isMenuVisible) {
              self.showMenu();
            }

            evt.target.focus();

            self.menu.filterItems(value);
          }
        }, 0);
      });

      Event.add(this.id + '_input', 'keydown', function (evt) {
        switch (evt.keyCode) {
          // enter
          case 13:
            Event.cancel(evt);

            if (this.value === "") {
              self.showMenu();
            } else {
              if (self.settings.onselect(this.value) !== false) {
                self.select(this.value);
              }

              self.hideMenu();

              this.value = "";
            }
            break;
          // down arrow
          case 40:
          case 38:
            self.showMenu();
            Event.cancel(evt);
            self.menu.focus();
            break;
          // backspace
          case 8:
            // keep normal behaviour while input has a value
            if (this.value) {
              return;
            }

            var tags = DOM.select('button', evt.target.parentNode);

            if (tags.length) {
              var tag = tags.pop(), val = tag.value;

              // remove tag
              self.removeTag(tag);

              Event.cancel(evt);

              // update value with tag value and focus
              this.value = val;
              this.focus();
            }

            break;
        }
      });

      Event.add(this.id, 'focus', function () {
        if (!this._focused) {

          this.keyDownHandler = Event.add(this.id, 'keydown', function (e) {
            if (e.keyCode == 40) {
              self.showMenu();
              Event.cancel(e);
            }
          });

          this.keyPressHandler = Event.add(this.id, 'keypress', function (e) {
            var value;
            if (e.keyCode == 13) {
              // Fake select on enter
              value = self.selectedValue;
              self.selectedValue = null; // Needs to be null to fake change
              Event.cancel(e);
              self.settings.onselect(value);
            }
          });
        }

        this._focused = 1;
      });

      Event.add(this.id, 'blur', function () {
        Event.remove(this.id, 'keydown', this.keyDownHandler);
        Event.remove(this.id, 'keypress', this.keyPressHandler);
        this._focused = 0;
      });

      this.onPostRender.dispatch(this, DOM.get(this.id));

      this.rendered = true;
    },

    /**
     * Destroys the ListBox i.e. clear memory and events.
     *
     * @method destroy
     */
    destroy: function () {
      this._super();

      Event.clear(this.id + '_text');
      Event.clear(this.id + '_open');

      each(this.items, function (item) {
        item.selected = false;
      });

      this.selectedValue = null;
    }
  });
})(tinymce);