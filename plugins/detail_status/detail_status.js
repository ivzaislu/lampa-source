(function () {
    'use strict';

    // Standalone Lampa plugin: can be loaded directly from a URL.
    // Does not modify the application's templates or source CSS.
    if (window.__lampaDetailStatusPlugin) return;
    window.__lampaDetailStatusPlugin = true;

    var statuses = {
        returning_series: { title: 'Идёт', tone: 'active' },
        ongoing:          { title: 'Идёт', tone: 'active' },
        ended:            { title: 'Завершён', tone: 'ended' },
        canceled:         { title: 'Отменён', tone: 'canceled' },
        cancelled:        { title: 'Отменён', tone: 'canceled' },
        in_production:    { title: 'В производстве', tone: 'pending' },
        post_production:  { title: 'Постпроизводство', tone: 'pending' },
        planned:          { title: 'Запланирован', tone: 'neutral' },
        pilot:            { title: 'Пилот', tone: 'neutral' },
        rumored:          { title: 'По слухам', tone: 'neutral' },
        released:         { title: 'Выпущен', tone: 'active' }
    };

    var classes = [
        'lampa-detail-status--active',
        'lampa-detail-status--ended',
        'lampa-detail-status--canceled',
        'lampa-detail-status--pending',
        'lampa-detail-status--neutral'
    ].join(' ');

    function addStyles() {
        if (document.getElementById('lampa-detail-status-plugin-css')) return;

        var style = document.createElement('style');
        style.id = 'lampa-detail-status-plugin-css';
        style.type = 'text/css';
        style.textContent = [
            '.full-start__status.lampa-detail-status {',
            '  display: inline-flex; align-items: center;',
            '  border: 2px solid currentColor;',
            '  border-radius: 0.45em;',
            '  padding: 0.23em 0.55em;',
            '  line-height: 1.1;',
            '  font-weight: 600;',
            '  white-space: nowrap;',
            '  box-sizing: border-box;',
            '}',
            '.full-start__status.lampa-detail-status--active {',
            '  color: #58e59a; background: rgba(34, 160, 91, 0.16);',
            '}',
            '.full-start__status.lampa-detail-status--ended {',
            '  color: #ff7676; background: rgba(205, 50, 50, 0.16);',
            '}',
            '.full-start__status.lampa-detail-status--canceled {',
            '  color: #ff6262; background: rgba(205, 35, 35, 0.19);',
            '}',
            '.full-start__status.lampa-detail-status--pending {',
            '  color: #ffd36c; background: rgba(200, 140, 30, 0.15);',
            '}',
            '.full-start__status.lampa-detail-status--neutral {',
            '  color: #d0d5db; background: rgba(175, 185, 195, 0.12);',
            '}'
        ].join('\n');

        (document.head || document.body).appendChild(style);
    }

    function normalize(value) {
        return String(value || '').toLowerCase().replace(/^\s+|\s+$/g, '').replace(/[\s-]+/g, '_');
    }

    function onFull(event) {
        // 'complite' is the event name used by Lampa itself.
        if (!event || event.type !== 'complite' || !event.body || !event.data || !event.data.movie) return;

        var status = normalize(event.data.movie.status);
        if (!Object.prototype.hasOwnProperty.call(statuses, status)) return;

        var badge = event.body.find('.full-start__status');
        if (!badge.length) return;

        var details = statuses[status];

        badge.removeClass(classes)
            .removeClass('hide')
            .addClass('lampa-detail-status lampa-detail-status--' + details.tone)
            .text(details.title);
    }

    function init() {
        addStyles();
        Lampa.Listener.follow('full', onFull);
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    }
})();
