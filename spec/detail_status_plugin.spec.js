import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {describe, expect, test} from 'vitest'

const code = readFileSync(new URL('../plugins/detail_status/detail_status.js', import.meta.url), 'utf8')

function dateIn(days) {
    let day = new Date()
    day.setDate(day.getDate() + days)
    return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-')
}

function createBadge(value) {
    return {value, classes: new Set()}
}

function wrap(badges) {
    return {
        length: badges.length,
        filter(callback) {
            return wrap(badges.filter(badge => callback.call(badge)))
        },
        first() {
            return wrap(badges.slice(0, 1))
        },
        text(value) {
            if (value === undefined) return badges.map(badge => badge.value).join('')
            badges.forEach(badge => { badge.value = value })
            return this
        },
        removeClass(names) {
            badges.forEach(badge => names.split(' ').forEach(name => badge.classes.delete(name)))
            return this
        },
        addClass(names) {
            badges.forEach(badge => names.split(' ').forEach(name => badge.classes.add(name)))
            return this
        }
    }
}

function renderStatus(movie, episodes, original = 'Онгоинг') {
    const handlers = {}
    const statusBadge = createBadge(original)
    const qualityBadge = createBadge('TS')
    const translations = {
        tv_status_returning_series: 'Онгоинг',
        tv_status_ended: 'Завершено',
        tv_status_canceled: 'Отменено',
        tv_status_released: 'Выпущенный'
    }
    const globals = {
        window: {appready: true},
        document: {
            getElementById: () => null,
            createElement: () => ({}),
            head: {appendChild: () => {}}
        },
        Lampa: {
            Listener: {follow: (type, handler) => { handlers[type] = handler }},
            Lang: {translate: key => translations[key] || key}
        },
        $: badge => wrap([badge])
    }

    vm.runInNewContext(code, globals)
    handlers.full({
        type: 'complite',
        data: {movie, episodes},
        body: {find: () => wrap([qualityBadge, statusBadge])}
    })

    return {statusBadge, qualityBadge}
}

describe('detail status plugin', () => {
    test('finished season of an unfinished show displays a continuation badge', () => {
        const {statusBadge, qualityBadge} = renderStatus({
            status: 'Returning Series',
            last_episode_to_air: {season_number: 2, episode_number: 8},
            seasons: [{season_number: 2, episode_count: 8}]
        })
        expect(statusBadge.value).toBe('Продолжение следует…')
        expect(statusBadge.classes.has('lampa-detail-status--pending')).toBe(true)
        expect(qualityBadge.value).toBe('TS')
        expect(qualityBadge.classes.size).toBe(0)
    })

    test('next scheduled episode is distinguished from next scheduled season', () => {
        const base = {
            status: 'Returning Series',
            last_episode_to_air: {season_number: 1, episode_number: 5},
            seasons: [{season_number: 1, episode_count: 10}]
        }
        const episode = renderStatus({...base, next_episode_to_air: {
            season_number: 1, episode_number: 6, air_date: dateIn(7)
        }})
        const season = renderStatus({...base, next_episode_to_air: {
            season_number: 2, episode_number: 1, air_date: dateIn(35)
        }})
        expect(episode.statusBadge.value).toBe('Скоро новая серия')
        expect(season.statusBadge.value).toBe('Скоро новый сезон')
    })

    test('an airing episode today keeps the active label', () => {
        const {statusBadge} = renderStatus({
            status: 'Returning Series',
            last_episode_to_air: {season_number: 1, episode_number: 8},
            next_episode_to_air: {season_number: 2, episode_number: 1, air_date: dateIn(0)},
            seasons: [{season_number: 1, episode_count: 8}]
        })
        expect(statusBadge.value).toBe('Идёт')
    })

    test('an incomplete season without a known date is not labeled completed', () => {
        const {statusBadge} = renderStatus({
            status: 'Returning Series',
            last_episode_to_air: {season_number: 1, episode_number: 3},
            seasons: [{season_number: 1, episode_count: 10}]
        })
        expect(statusBadge.value).toBe('Идёт')
    })

    test('season episode list is used when last_episode_to_air is unavailable', () => {
        const {statusBadge} = renderStatus({
            status: 'Returning Series',
            seasons: [{season_number: 1, episode_count: 2}]
        }, {
            season_number: 1,
            episodes: [
                {season_number: 1, episode_number: 1, air_date: dateIn(-21)},
                {season_number: 1, episode_number: 2, air_date: dateIn(-14)}
            ]
        })
        expect(statusBadge.value).toBe('Продолжение следует…')
    })

    test('terminal statuses are unchanged and the quality badge remains untouched', () => {
        for (const item of [
            {status: 'Ended', original: 'Завершено', expected: 'Завершён'},
            {status: 'Canceled', original: 'Отменено', expected: 'Отменён'},
            {status: 'Released', original: 'Выпущенный', expected: 'Выпущен'}
        ]) {
            const {statusBadge, qualityBadge} = renderStatus({status: item.status}, {}, item.original)
            expect(statusBadge.value).toBe(item.expected)
            expect(qualityBadge.value).toBe('TS')
        }
    })

    test('unknown or overwritten status badge is not modified', () => {
        const {statusBadge, qualityBadge} = renderStatus({
            status: 'Returning Series'
        }, {}, 'WEB-DL')
        expect(statusBadge.value).toBe('WEB-DL')
        expect(qualityBadge.value).toBe('TS')
    })
})
