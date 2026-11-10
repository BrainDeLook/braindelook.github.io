(function () {
    'use strict';
    if (window.LampaTorrentDirect) return;

    var enabled = true;
    var started = false;
    var version = '0.1.0-beta.1';

    function start() {
        if (started) return;
        started = true;
        var show = Lampa.Select.show;
        Lampa.Select.show = function (options) {
            if (enabled && options.title === Lampa.Lang.translate('settings_rest_source')) {
                var torrents = options.items.filter(function (item) {
                    var button = item.btn && item.btn[0];
                    return button && button.nodeType === 1 && button.classList.contains('view--torrent');
                });
                if (torrents.length === 1) return options.onSelect(torrents[0]);
            }
            return show.apply(this, arguments);
        };
    }

    window.LampaTorrentDirect = {
        version: version,
        enable: function () { enabled = true; },
        disable: function () { enabled = false; }
    };
    Lampa.Manifest.plugins = {
        type: 'other', version: version, name: 'Торренты сразу',
        description: 'Кнопка «Смотреть» сразу открывает список торрентов',
        author: 'BrainDeLook'
    };
    if (window.appready) start();
    else Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') start();
    });
})();
