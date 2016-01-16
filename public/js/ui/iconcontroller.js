window.IconController = (function () {
    "use strict";
    /**
     *
     * @param {string} name
     * @param {HTMLElement} el
     * @param {boolean} visible
     * @constructor
     * @extends EventEmitter
     */
    function Icon(name, el, visible) {
        this.name = name;
        this.el = el;

        if (visible) {
            this.show();
        } else {
            this.hide();
        }
        this.deactive();
        el.addEventListener('click', this.emit.bind(this, 'click'));
    }

    EventEmitter.bindPrototype(Icon);
    Icon.prototype.show = function () {
        if (this._visible === undefined || !this._visible) {
            this._visible = true;
            this.el.classList.remove('hidden');
            this.emit('show');
        }
        return this;
    };
    Icon.prototype.hide = function () {
        if (this._visible === undefined || this._visible) {
            this._visible = false;
            this.el.classList.add('hidden');
            this.emit('hide');
        }
        return this;
    };
    Icon.prototype.isVisible = function () {
        return this._visible;
    };

    Icon.prototype.active = function () {
        if (this._active === undefined || !this._active) {
            this._active = true;
            this.el.classList.add('on');
            this.emit('active');
        }
        return this;
    };
    Icon.prototype.deactive = function () {
        if (this._active === undefined || this._active) {
            this._active = false;
            this.el.classList.remove('on');
            this.emit('deactive');
        }
        return this;
    };
    Icon.prototype.isActive = function () {
        return this._active;
    };
    Icon.prototype.toggle = function () {
        if (this._active)
            this.deactive();
        else
            this.active();
        this.emit('toggle', this._active);
        return this;
    };

    function IconController() {
        /**
         * @type Object.<string,Icon>
         */
        this.icons = {__proto__: null};
    }

    IconController.Icon = Icon;

    /**
     *
     * @param {string} name Icon name
     * @param {HTMLElement} el Icon Element
     * @param {boolean} [isVisible] initial show state
     * @returns {Icon}
     */
    IconController.prototype.add = function (name, el, isVisible) {
        return this.icons[name] = new Icon(name, el, isVisible)
    };
    IconController.prototype.remove = function (name) {
        delete this.icons[name];
    };
    /**
     * @param {string} name
     * @returns {Icon}
     */
    IconController.prototype.get = function (name) {
        return this.icons[name];
    };
    IconController.prototype.hideAll = function () {
        for (var key in this.icons) {
            this.icons[key].hide();
        }
    };
    return IconController;
})();