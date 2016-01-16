window.IconController = (function () {
    "use strict";
    /**
     *
     * @param {string} name
     * @param {HTMLElement} el
     * @param {boolean} isEnabled
     * @constructor
     * @extends EventEmitter
     */
    function Icon(name, el, isEnabled) {
        this.name = name;
        this.el = el;

        if (isEnabled) {
            this.enable();
        } else {
            this.disable();
        }
        this.deactive();
        el.addEventListener('click', this.emit.bind(this, 'click'));
    }

    EventEmitter.bindPrototype(Icon);
    Icon.prototype.enable = function () {
        if (this._enabled === undefined || !this._enabled) {
            this._enabled = true;
            this.el.classList.remove('hidden');
            this.emit('enable');
        }
        return this;
    };
    Icon.prototype.disable = function () {
        if (this._enabled === undefined || this._enabled) {
            this._enabled = false;
            this.el.classList.add('hidden');
            this.emit('disable');
        }
        return this;
    };
    Icon.prototype.isEnabled = function () {
        return this._enabled;
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
     * @param {boolean} [isEnabled] initial enable state
     * @returns {Icon}
     */
    IconController.prototype.add = function (name, el, isEnabled) {
        return this.icons[name] = new Icon(name, el, isEnabled)
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
    IconController.prototype.disableAll = function () {
        for (var key in this.icons) {
            this.icons[key].disable();
        }
    };
    return IconController;
})();