/* Lampa Smooth 0.3.0-beta.1 — navigation optimization and return to search results. */
(function () {
    'use strict';
    if (window.LampaSmooth) return;

    function createSearchReturn() {
        var search = Lampa.Search;
        if (!search || typeof search.open !== 'function' || !search.listener || !Lampa.Listener) return null;
        var originalOpen = search.open;
        var enabled = false;
        var current = null;
        var pending = null;
        var restoring = null;
        var timer = 0;

        function remember() {
            if (!current) return;
            var root = search.render(true);
            root = root.nodeType === 1 ? root : root[0];
            var focused = root.querySelector('.focus');
            current.index = 0;
            current.results.some(function (record, index) {
                var element = record.result.render(true);
                element = element.nodeType === 1 ? element : element[0];
                if (focused && element.contains(focused)) { current.index = index; return true; }
                return false;
            });
            current.sourceTitle = current.results[current.index].source.title;
            pending = current;
            var selected = current;
            setTimeout(function () { if (pending === selected && !selected.card) pending = null; }, 0);
        }

        function open(parameters) {
            if (!enabled) return originalOpen.apply(search, arguments);
            var restore = restoring;
            restoring = null;
            pending = null;
            current = {parameters: parameters || {}, base: Lampa.Activity.active(), query: '', results: [], restore: restore};
            var session = current;
            var result = originalOpen.apply(search, arguments);
            if (restore) {
                restore.index = 0;
                session.results.some(function (record, index) {
                    if (record.source.title === restore.sourceTitle) { restore.index = index; return true; }
                    return false;
                });
            }
            if (restore && current === session && restore.index > 0 && session.results[restore.index]) {
                session.sources.enable(session.results[restore.index].result);
            }
            return result;
        }

        search.listener.follow('sources', function (event) {
            if (!enabled) return;
            // The header also calls Lampa's private open function directly.
            if (!current) current = {parameters: {}, base: Lampa.Activity.active(), query: '', results: [], restore: null};
            var session = current;
            session.sources = event.sources;
            event.sources.listener.follow('search', function (event) {
                session.query = event.query;
                if (session.restore && event.query !== session.restore.query) session.restore = null;
            });
            event.sources.listener.follow('create', function (event) {
                session.results.push({source: event.source, result: event.result});
            });
            event.sources.listener.follow('select', function () { if (enabled && current === session) remember(); });
            event.sources.listener.follow('finded', function (event) {
                if (!session.restore || !event.count || event.result !== session.results[session.restore.index].result) return;
                session.restore = null;
                requestAnimationFrame(function () {
                    if (enabled && current === session && document.body.classList.contains('search--open')) event.result.toggle();
                });
            });
        });
        search.listener.follow('close', function () { current = null; });
        Lampa.Listener.follow('activity', function (event) {
            if (!enabled) return;
            if (event.type === 'init' && event.component === 'full') {
                if (!pending && current && document.body.classList.contains('search--open')) remember();
                if (pending && !pending.card) pending.card = event.object;
            }
            if (!pending) return;
            if (event.type === 'archive' && event.object === pending.base && pending.card) {
                var saved = pending;
                pending = null;
                timer = setTimeout(function () {
                    timer = 0;
                    if (!enabled || Lampa.Activity.active() !== saved.base || document.body.classList.contains('search--open')) return;
                    var parameters = {};
                    Object.keys(saved.parameters).forEach(function (name) { parameters[name] = saved.parameters[name]; });
                    parameters.input = saved.query;
                    restoring = saved;
                    open(parameters);
                }, 0);
            } else if (event.type === 'destroy' && (event.object === pending.base || event.object === pending.card)) pending = null;
        });

        return {
            enable: function () { if (!enabled && search.open === originalOpen) { search.open = open; enabled = true; } },
            disable: function () {
                enabled = false;
                if (search.open === open) search.open = originalOpen;
                clearTimeout(timer);
                current = pending = restoring = null;
            }
        };
    }

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
        var searchReturn = createSearchReturn();

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
            if (searchReturn) searchReturn.enable();
        }

        function disable() {
            clear();
            if (searchReturn) searchReturn.disable();
            if (!enabled) return;
            if (navigation.canmove === canmove) navigation.canmove = originalCan;
            if (navigation.move === move) navigation.move = originalMove;
            if (navigation.navigate === navigate) navigation.navigate = originalNavigate;
            enabled = false;
        }

        window.LampaSmooth = {version: '0.3.0-beta.1', enable: enable, disable: disable};
        enable();
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') start(); });
})();
