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

    // Full-screen episode line: enhance presentation while preserving
    // the original episode DOM nodes, select events and TV focus mechanics.
    function addEpisodeStyles() {
        if (document.getElementById('lampa-detail-episodes-css')) return;

        var style = document.createElement('style');
        style.id = 'lampa-detail-episodes-css';
        style.type = 'text/css';
        style.textContent = [
            '.lampa-episode-redesign .full-episode--small {',
            '  display: flex; flex-direction: column; flex-shrink: 0;',
            '  width: 17.5em; overflow: visible;',
            '  border: 1px solid rgba(255,255,255,.12); border-radius: 1em;',
            '  background: rgba(12,19,28,.82);',
            '  transition: border-color .2s, box-shadow .2s, transform .2s;',
            '}',
            '.lampa-episode-redesign .full-episode--small .full-episode__img {',
            '  display: block; width: 100%; padding-bottom: 56.25%;',
            '  border-radius: 1em 1em 0 0; overflow: hidden;',
            '  background: rgba(22,32,45,.9);',
            '}',
            '.lampa-episode-redesign .full-episode--small .full-episode__img img {',
            '  width: 100%; height: 100%; object-fit: cover;',
            '  border-radius: 1em 1em 0 0;',
            '}',
            '.lampa-episode-redesign .full-episode--small .full-episode__body {',
            '  position: relative; inset: auto; flex: 1;',
            '  display: flex; flex-direction: column;',
            '  justify-content: flex-start; border-radius: 0 0 1em 1em;',
            '  padding: .85em 1em .95em; background: transparent;',
            '  color: #f8f9fc; min-height: 5.9em;',
            '}',
            '.lampa-episode-redesign .lampa-episode__heading {',
            '  display: flex; align-items: baseline; gap: .65em; min-width: 0;',
            '}',
            '.lampa-episode-redesign .full-episode__num {',
            '  font-size: 1em; font-weight: 700; line-height: 1.3;',
            '  margin: 0; color: #a2b5c6; flex-shrink: 0;',
            '}',
            '.lampa-episode-redesign .full-episode__name {',
            '  min-width: 0; line-height: 1.35; font-size: 1.12em;',
            '  font-weight: 600; white-space: normal;',
            '  overflow: hidden; display: -webkit-box;',
            '  -webkit-box-orient: vertical; -webkit-line-clamp: 2;',
            '}',
            '.lampa-episode-redesign .lampa-episode__meta {',
            '  display: flex; align-items: center; flex-wrap: wrap;',
            '  gap: .4em .75em; margin-top: auto; padding-top: .65em;',
            '}',
            '.lampa-episode-redesign .full-episode__date {',
            '  font-size: .95em; margin: 0; line-height: 1.3;',
            '  color: #b9c4ce;',
            '}',
            '.lampa-episode-redesign .lampa-episode__availability {',
            '  margin-left: auto; color: #83ddae;',
            '  font-size: .78em; font-weight: 600; white-space: nowrap;',
            '}',
            '.lampa-episode-redesign .lampa-episode--upcoming {',
            '  border-color: rgba(248,190,88,.38);',
            '}',
            '.lampa-episode-redesign .full-episode--next .full-episode__img {',
            '  background: linear-gradient(135deg, #1c2839, #141a2b);',
            '}',
            '.lampa-episode-redesign .full-episode--next .full-episode__img::after {',
            '  display: none;',
            '}',
            '.lampa-episode-redesign .lampa-episode--upcoming .lampa-episode__availability,',
            '.lampa-episode-redesign .lampa-episode--upcoming .full-episode__date {',
            '  color: #f4ca77;',
            '}',
            '.lampa-episode-redesign .lampa-episode__calendar {',
            '  display: flex; flex-direction: column; gap: .6em;',
            '  position: absolute; inset: 0; align-items: center;',
            '  justify-content: center; color: #f4ca77;',
            '}',
            '.lampa-episode-redesign .lampa-episode__calendar svg {',
            '  width: 2.35em !important; height: 2.35em !important;',
            '}',
            '.lampa-episode-redesign .lampa-episode__calendar-label {',
            '  font-weight: 600; font-size: .92em;',
            '}',
            '.lampa-episode-redesign .full-episode--small.focus,',
            '.lampa-episode-redesign .full-episode--small.hover {',
            '  border-color: #fff; box-shadow: 0 0 0 .19em #fff,',
            '    0 .7em 2em rgba(0,0,0,.3);',
            '  transform: scale(1.018); z-index: 2;',
            '}',
            '.lampa-episode-redesign .full-episode--small.focus::after {',
            '  display: none;',
            '}',
            '.lampa-episode-redesign .full-episode__viewed {',
            '  display: none;',
            '}',
            '.lampa-episode-redesign .full-episode--viewed .full-episode__viewed {',
            '  display: block; z-index: 2; top: .55em; right: .55em;',
            '  border-radius: 50%; padding: .25em; background: rgba(0,0,0,.55);',
            '}',
            '.lampa-episode-redesign .card-more--first {',
            '  width: 12em !important; min-height: 14em;',
            '  align-self: stretch;',
            '}',
            '.lampa-episode-redesign .card-more--first .card-more__box {',
            '  height: auto !important; min-height: 14em;',
            '  border: 1px solid rgba(255,255,255,.17);',
            '  border-radius: 1em; background: rgba(20,32,46,.72);',
            '  display: flex; align-items: center; justify-content: center;',
            '  flex-direction: column;',
            '}',
            '.lampa-episode-redesign .card-more--first .card-more__title {',
            '  position: static; margin: 0; padding: 0 1em;',
            '  font-size: 1.2em; font-weight: 600; line-height: 1.3;',
            '}',
            '.lampa-episode-redesign .card-more--first .card-more__title::before {',
            '  content: "↗"; display: block; font-size: 1.6em;',
            '  font-weight: 400; margin-bottom: .6em; color: #a2d9ef;',
            '}',
            '.lampa-episode-redesign .card-more--first.focus .card-more__box {',
            '  border-color: #fff; box-shadow: 0 0 0 .19em #fff;',
            '}',
            '.lampa-episode-redesign .card-more--first.focus .card-more__box::after {',
            '  display: none;',
            '}',
            '@media (max-width: 580px) {',
            '  .lampa-episode-redesign .full-episode--small {width: 15.8em;}',
            '  .lampa-episode-redesign .card-more--first {width: 10em !important;}',
            '}',
            '@media (prefers-reduced-motion: reduce) {',
            '  .lampa-episode-redesign .full-episode--small {',
            '    transition: none; transform: none !important;',
            '  }',
            '}'
        ].join('\n');

        (document.head || document.body).appendChild(style);
    }

    function episodeUpcoming(episode) {
        if (episode.comeing === true) return true;

        var date = dayStamp(episode.air_date);
        if (date === null) return false;

        var now = new Date();
        return date > Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function decorateEpisode(item, episode) {
        if (!item || !episode || typeof item.render !== 'function') return;

        var root = item.render(true);
        if (!root || !root.classList || !root.classList.contains('full-episode--small') ||
            root.classList.contains('lampa-episode-card')) return;

        var body = root.querySelector('.full-episode__body');
        var num = root.querySelector('.full-episode__num');
        var name = root.querySelector('.full-episode__name');
        var date = root.querySelector('.full-episode__date');
        var image = root.querySelector('.full-episode__img');

        if (!body || !num || !name || !date || !image) return;

        var upcoming = episodeUpcoming(episode);
        root.classList.add('lampa-episode-card');

        if (upcoming) root.classList.add('lampa-episode--upcoming');

        if (Number(episode.episode_number) > 0) {
            var number = String(episode.episode_number);
            num.textContent = number.length < 2 ? '0' + number : number;
        }

        var heading = document.createElement('div');
        heading.className = 'lampa-episode__heading';
        heading.appendChild(num);
        heading.appendChild(name);
        body.insertBefore(heading, body.firstChild);

        var meta = document.createElement('div');
        meta.className = 'lampa-episode__meta';
        if (!episode.air_date) date.textContent = 'Дата уточняется';
        meta.appendChild(date);

        var availability = document.createElement('span');
        availability.className = 'lampa-episode__availability';
        availability.textContent = upcoming ?
            (episode.air_date ? 'Скоро' : 'Анонс') :
            (episode.air_date ? 'Доступна' : '');
        meta.appendChild(availability);
        body.appendChild(meta);

        if (upcoming) {
            var cal = document.createElement('div');
            cal.className = 'lampa-episode__calendar';
            cal.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
                'aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/>' +
                '<path d="M7 3v4M17 3v4M3 10h18M8 15h3"/></svg>' +
                '<span class="lampa-episode__calendar-label">' +
                (episode.air_date ? 'Скоро в эфире' : 'Анонс') + '</span>';
            image.appendChild(cal);
        }
    }

    function decorateEpisodesRow(line) {
        if (!line || typeof line.render !== 'function') return;

        var root = line.render(true);
        if (!root || !root.classList ||
            root.classList.contains('lampa-episode-redesign')) return;

        root.classList.add('lampa-episode-redesign');

        // Keep the existing "MoreFirst" item in the same position:
        // repositioning it breaks the internal active index and TV scrolling.
        if (line.more && typeof line.more.render === 'function') {
            var more = line.more.render(true);
            var label = more && more.querySelector('.card-more__title');
            if (label) label.textContent = 'Все серии';
        }

        // First items already exist when Lampa emits full:build.
        (line.items || []).forEach(function (item) {
            if (item && item.data) decorateEpisode(item, item.data);
        });

        // Preserve lazy-loaded items: they arrive later during horizontal scroll.
        if (typeof line.use === 'function') {
            line.use({
                onPush: function (item, episode) {
                    decorateEpisode(item, episode);
                }
            });
        }
    }

    function onFullBuild(event) {
        if (event && event.type === 'build' && event.name === 'episodes') {
            decorateEpisodesRow(event.item);
        }
    }

    function init() {
        addStyles();
        addEpisodeStyles();
        Lampa.Listener.follow('full', onFull);
        Lampa.Listener.follow('full', onFullBuild);
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    }
})();
