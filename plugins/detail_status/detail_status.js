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

    function dayStamp(value) {
        var date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
        if (!date) return null;

        var stamp = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]));
        var checked = new Date(stamp);
        if (checked.getUTCFullYear() !== Number(date[1]) ||
            checked.getUTCMonth() !== Number(date[2]) - 1 ||
            checked.getUTCDate() !== Number(date[3])) return null;

        return stamp;
    }

    function seasonNumber(value) {
        var number = Number(value);
        return isFinite(number) && Math.floor(number) === number && number > 0 ? number : 0;
    }

    function nextSeasonStatus(next, last) {
        if (last && seasonNumber(next.season_number) > seasonNumber(last.season_number) &&
            seasonNumber(last.season_number) > 0) {
            return { title: 'Скоро новый сезон', tone: 'pending' };
        }
        return { title: 'Скоро новая серия', tone: 'active' };
    }

    function statusForEpisodeSchedule(status, data) {
        var basic = statuses[status];

        // Only these statuses describe TV shows that are still being produced.
        if (status !== 'returning_series' && status !== 'ongoing') return basic;

        var movie = data.movie || {};
        var now = new Date();
        var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        var last = movie.last_episode_to_air;
        var next = movie.next_episode_to_air;
        var nextDate = next && dayStamp(next.air_date);

        // Explicit upcoming episode information has priority over guesses
        // based on the absence of a broadcast schedule.
        if (nextDate !== null && nextDate > today) {
            return nextSeasonStatus(next, last);
        }
        if (nextDate !== null && nextDate === today) {
            return { title: 'Идёт', tone: 'active' };
        }

        var seasons = Array.isArray(movie.seasons) ? movie.seasons : [];
        var lastSeasonNumber = last && seasonNumber(last.season_number);
        var lastSeason = seasons.find(function (season) {
            return seasonNumber(season.season_number) === lastSeasonNumber;
        });

        // An upcoming season with a known premiere date is not a completed show.
        var announcedSeason = seasons.filter(function (season) {
            return seasonNumber(season.season_number) > lastSeasonNumber &&
                lastSeasonNumber > 0 &&
                dayStamp(season.air_date) !== null &&
                dayStamp(season.air_date) > today;
        }).sort(function (a, b) {
            return Number(a.season_number) - Number(b.season_number);
        })[0];

        if (announcedSeason) {
            return { title: 'Скоро новый сезон', tone: 'pending' };
        }

        // Lampa loads the season's episode list on the full-card request.
        // This also covers providers that do not include next_episode_to_air.
        var seasonData = data.episodes || {};
        var episodes = Array.isArray(seasonData.episodes) ? seasonData.episodes : [];
        var future = episodes.filter(function (episode) {
            var date = dayStamp(episode.air_date);
            return seasonNumber(episode.season_number) > 0 && date !== null && date > today;
        }).sort(function (a, b) {
            return dayStamp(a.air_date) - dayStamp(b.air_date);
        });

        if (future.length) return nextSeasonStatus(future[0], last);

        // Reliable evidence of a finished season: TMDB says the last aired
        // episode reaches the total episode count for that same season.
        if (lastSeason && Number(lastSeason.episode_count) > 0 &&
            Number(last.episode_number) >= Number(lastSeason.episode_count)) {
            return { title: 'Продолжение следует…', tone: 'pending' };
        }

        // Alternative evidence when last_episode_to_air is missing:
        // the selected season has all its listed episodes and all have aired.
        var currentSeasonNumber = seasonNumber(seasonData.season_number);
        var selectedSeason = seasons.find(function (season) {
            return seasonNumber(season.season_number) === currentSeasonNumber;
        });
        var actual = episodes.filter(function (episode) {
            return seasonNumber(episode.season_number) === currentSeasonNumber &&
                Number(episode.episode_number) > 0;
        });

        if (!last && selectedSeason && Number(selectedSeason.episode_count) > 0 &&
            actual.length >= Number(selectedSeason.episode_count) &&
            actual.every(function (episode) {
                var date = dayStamp(episode.air_date);
                return date !== null && date <= today;
            })) {
            return { title: 'Продолжение следует…', tone: 'pending' };
        }

        // No confirmed season finale: keep the original ongoing label.
        return basic;
    }

    function onFull(event) {
        // 'complite' is the event name used by Lampa itself.
        if (!event || event.type !== 'complite' || !event.body || !event.data || !event.data.movie) return;

        var status = normalize(event.data.movie.status);
        if (!Object.prototype.hasOwnProperty.call(statuses, status)) return;

        // Other plugins may reuse .full-start__status for quality badges.
        // Match Lampa's original translated status text, not every badge.
        var originalText = Lampa.Lang.translate('tv_status_' + status);
        var badge = event.body
            .find('.full-start-new__rate-line > .full-start__status')
            .filter(function () {
                return $(this).text().trim() === originalText;
            })
            .first();

        // Fail safely if another plugin has altered the structure/label.
        // Never overwrite unrelated quality/format badges.
        if (!badge.length) return;

        var details = statusForEpisodeSchedule(status, event.data);

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
