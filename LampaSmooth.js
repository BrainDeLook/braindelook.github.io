/* Lampa Smooth 0.2.0-beta.1 — reuse a navigation probe only within the same JS turn. */
(function () {
    'use strict';
    if (window.LampaSmooth) return;

    function start() {
        if (window.LampaSmooth) return;
        if (!window.Navigator || !window.MutationObserver || !window.Promise) return;
        var navigation = window.Navigator;
        var originalCan = navigation.canmove;
        var originalMove = navigation.move;
        var originalNavigate = navigation.navigate;
        // This optimization relies on Lampa's element-returning SpatialNavigator contract.
        if (typeof originalCan !== 'function' || typeof originalMove !== 'function' ||
            typeof originalNavigate !== 'function' || !/snNavigate/.test(String(originalNavigate)) ||
            !/_getAllRects/.test(String(originalNavigate))) return;

        var cached = null;
        var reuse = null;
        var enabled = false;
        var observer = new MutationObserver(clear);
        var expiry = Promise.resolve();
        var options = ['straightOnly', 'straightOverlapThreshold', 'ignoreHiddenElement', 'rememberSource', 'navigableFilter'];

        function clear() {
            cached = null;
            observer.disconnect();
        }

        function canmove(direction) {
            clear();
            var next = originalCan.call(this, direction);
            // Custom filters may have side effects. Virtual rectangles may change without DOM mutations.
            if (!(next instanceof HTMLElement) || this.navigableFilter || this.navigate !== navigate ||
                !this._collection.every(function (element) { return element instanceof HTMLElement; })) return next;
            var nav = this;
            var record = {
                nav: nav, direction: direction, next: next, focus: nav._focus,
                collection: nav._collection.slice(), previous: nav._previous,
                options: options.map(function (name) { return nav[name]; }),
                x: window.pageXOffset, y: window.pageYOffset
            };
            cached = record;
            observer.observe(document, {subtree: true, childList: true, attributes: true, characterData: true});
            expiry.then(function () { if (cached === record) clear(); });
            return next;
        }

        function move(direction) {
            var record = cached;
            var changed = observer.takeRecords().length > 0;
            clear();
            var nav = this;
            var valid = record && !changed && record.nav === nav && record.direction === direction &&
                record.focus === nav._focus && record.previous === nav._previous &&
                record.x === window.pageXOffset && record.y === window.pageYOffset &&
                record.collection.length === nav._collection.length &&
                record.collection.every(function (element, index) { return element === nav._collection[index]; }) &&
                options.every(function (name, index) { return nav[name] === record.options[index]; });
            var outer = reuse;
            reuse = valid ? record : null;
            // Always keep native move/focus/unfocus events, including nested navigation from plugins.
            try { return originalMove.call(nav, direction); }
            finally { reuse = outer; }
        }

        function navigate(target, direction) {
            var record = reuse;
            reuse = null;
            if (record && record.nav === this && record.focus === target && record.direction === direction) return record.next;
            return originalNavigate.apply(this, arguments);
        }

        function enable() {
            if (enabled || navigation.canmove !== originalCan || navigation.move !== originalMove || navigation.navigate !== originalNavigate) return;
            navigation.canmove = canmove;
            navigation.move = move;
            navigation.navigate = navigate;
            enabled = true;
        }

        function disable() {
            clear();
            if (!enabled) return;
            if (navigation.canmove === canmove) navigation.canmove = originalCan;
            if (navigation.move === move) navigation.move = originalMove;
            if (navigation.navigate === navigate) navigation.navigate = originalNavigate;
            enabled = false;
        }

        window.LampaSmooth = {version: '0.2.0-beta.1', enable: enable, disable: disable};
        enable();
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
