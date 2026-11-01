// Browser smoke test for the real Lampa CSS plus the standalone plugin.
// Produces reviewable screenshots; it is not a pixel-perfect regression baseline.
const {chromium} = require('playwright')
const {resolve, join} = require('node:path')
const {pathToFileURL} = require('node:url')
const {mkdirSync} = require('node:fs')

async function main() {
    const repo = resolve(__dirname, '..', '..')
    const fixture = pathToFileURL(join(__dirname, 'detail_episodes_fixture.html')).href
    const plugin = join(repo, 'plugins', 'detail_status', 'detail_status.js')
    const output = join(repo, 'artifacts', 'episode-ui')
    mkdirSync(output, {recursive: true})

    const browser = await chromium.launch({headless: true})
    try {
        const configurations = [
            {name: 'desktop', width: 1440, height: 900},
            {name: 'tv', width: 1920, height: 1080},
            {name: 'mobile', width: 390, height: 844}
        ]

        for (const device of configurations) {
            const page = await browser.newPage({
                viewport: {width: device.width, height: device.height},
                deviceScaleFactor: 1
            })
            await page.goto(fixture, {waitUntil: 'load'})

            await page.evaluate(() => {
                const listeners = {}
                window.appready = true
                window.Lampa = {
                    Listener: {
                        follow: (event, callback) => {
                            if (!listeners[event]) listeners[event] = []
                            listeners[event].push(callback)
                        }
                    },
                    Lang: {translate: text => text}
                }

                const root = document.getElementById('episode-line')
                const more = document.getElementById('more')
                const items = Array.from(root.querySelectorAll('.full-episode--small')).map(element => ({
                    data: {
                        episode_number: Number(element.dataset.episode),
                        name: element.querySelector('.full-episode__name').textContent,
                        air_date: element.dataset.air,
                        comeing: element.dataset.coming === 'true'
                    },
                    render: () => element
                }))
                window.fixtureLine = {
                    items,
                    more: {render: () => more},
                    render: () => root,
                    use: () => {}
                }
                window.fixtureActors = {
                    render: () => document.getElementById('actor-line')
                }
                window.sendFull = detail => (listeners.full || []).forEach(callback => callback(detail))
            })
            await page.addScriptTag({path: plugin})
            await page.evaluate(() => {
                window.sendFull({type: 'build', name: 'episodes', item: window.fixtureLine})
                window.sendFull({type: 'build', name: 'persons', item: window.fixtureActors})
            })

            const measurements = await page.evaluate(() => {
                const row = document.getElementById('episode-line')
                const first = row.querySelector('.full-episode--small')
                const heading = row.querySelector('.lampa-season__number')
                const more = row.querySelector('.card-more__title')
                const upcoming = row.querySelector('.lampa-episode--upcoming')
                const cardStyle = window.getComputedStyle(first)
                const actorRow = document.getElementById('actor-line')
                const actor = actorRow.querySelector('.full-person')
                return {
                    hasStyledRow: row.classList.contains('lampa-episode-redesign'),
                    heading: heading && heading.textContent,
                    more: more && more.textContent,
                    upcomingCalendar: Boolean(upcoming && upcoming.querySelector('.lampa-episode__calendar')),
                    itemCount: row.querySelectorAll('.lampa-episode-card').length,
                    cardWidthInEm: first.getBoundingClientRect().width / parseFloat(cardStyle.fontSize),
                    moreHeight: row.querySelector('.card-more--first').getBoundingClientRect().height,
                    cardHeight: first.getBoundingClientRect().height,
                    moreWidth: row.querySelector('.card-more--first').getBoundingClientRect().width,
                    cardWidth: first.getBoundingClientRect().width,
                    actorRowStyled: actorRow.classList.contains('lampa-person-redesign'),
                    actorCount: actorRow.querySelectorAll('.full-person.selector').length,
                    actorWidthInEm: actor.getBoundingClientRect().width / parseFloat(window.getComputedStyle(actor).fontSize),
                    actorHeight: actor.getBoundingClientRect().height,
                    actorFocusColor: window.getComputedStyle(actorRow.querySelector('.full-person.focus')).color,
                    viewportOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
                }
            })

            if (!measurements.hasStyledRow || measurements.heading !== '02' ||
                measurements.more !== 'Все серии' ||
                !measurements.upcomingCalendar || measurements.itemCount !== 3 ||
                !(measurements.cardWidthInEm > 12 && measurements.cardWidthInEm < 15) ||
                Math.abs(measurements.moreHeight - measurements.cardHeight) > 3 ||
                Math.abs(measurements.moreWidth - measurements.cardWidth) > 3 ||
                !measurements.actorRowStyled || measurements.actorCount !== 5 ||
                !(measurements.actorWidthInEm > 13 && measurements.actorWidthInEm < 18) ||
                !(measurements.actorHeight < measurements.cardHeight) ||
                (device.name === 'mobile' && measurements.viewportOverflow)) {
                throw new Error('Visual smoke checks failed on ' + device.name + ': ' +
                    JSON.stringify(measurements))
            }

            console.log(device.name + ': ' + JSON.stringify(measurements))

            await page.screenshot({
                path: join(output, device.name + '.png'),
                fullPage: true
            })

            if (device.name === 'tv') {
                await page.evaluate(() => {
                    document.querySelector('.full-episode.focus').classList.remove('focus')
                    document.querySelector('.lampa-episode--upcoming').classList.add('focus')
                })
                await page.screenshot({
                    path: join(output, 'tv-upcoming-focused.png'),
                    fullPage: true
                })
            }

            await page.close()
        }
    } finally {
        await browser.close()
    }
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
