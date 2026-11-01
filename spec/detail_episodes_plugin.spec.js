import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {describe, expect, test} from 'vitest'

const plugin = readFileSync(new URL('../plugins/detail_status/detail_status.js', import.meta.url), 'utf8')

class Node {
    constructor(classes = '') {
        this.names = new Set(classes.split(/\s+/).filter(Boolean))
        this.classList = {
            add: value => this.names.add(value),
            contains: value => this.names.has(value)
        }
        this.children = []
        this.textContent = ''
        this.innerHTML = ''
        this.parentNode = null
        this.handlers = []
    }
    set className(value) {
        this.names = new Set(value.split(/\s+/).filter(Boolean))
    }
    get firstChild() {
        return this.children[0] || null
    }
    appendChild(node) {
        if (node.parentNode) {
            node.parentNode.children = node.parentNode.children.filter(child => child !== node)
        }
        node.parentNode = this
        this.children.push(node)
        return node
    }
    insertBefore(node, target) {
        if (node.parentNode) {
            node.parentNode.children = node.parentNode.children.filter(child => child !== node)
        }
        node.parentNode = this
        const index = this.children.indexOf(target)
        this.children.splice(index < 0 ? this.children.length : index, 0, node)
        return node
    }
    querySelector(selector) {
        const className = selector.slice(1)
        for (const child of this.children) {
            if (child.names.has(className)) return child
            const nested = child.querySelector(selector)
            if (nested) return nested
        }
        return null
    }
}

function episode(data, classes = 'full-episode full-episode--small selector') {
    const root = new Node(classes)
    const image = new Node('full-episode__img')
    const body = new Node('full-episode__body')
    root.appendChild(image)
    root.appendChild(body)
    const number = new Node('full-episode__num')
    number.textContent = String(data.episode_number)
    const name = new Node('full-episode__name')
    name.textContent = data.name
    const date = new Node('full-episode__date')
    date.textContent = data.air_date || '----'
    body.appendChild(number)
    body.appendChild(name)
    body.appendChild(date)
    return {data, render: () => root, root}
}

function setup() {
    const handlers = []
    const styles = []
    const ctx = {
        window: {appready: true},
        document: {
            getElementById: () => null,
            createElement: () => new Node(),
            head: {appendChild: elem => styles.push(elem)}
        },
        Lampa: {
            Listener: {follow: (name, handler) => {
                if (name === 'full') handlers.push(handler)
            }},
            Lang: {translate: key => key}
        }
    }
    vm.runInNewContext(plugin, ctx)
    function send(event) {
        handlers.forEach(handler => handler(event))
    }
    return {send, styles, handlers}
}

function row(items) {
    const root = new Node('items-line')
    const moreNode = new Node('card-more card-more--first selector')
    const title = new Node('card-more__title')
    title.textContent = 'Ещё'
    moreNode.appendChild(title)
    return {
        root,
        moreNode,
        title,
        items,
        listeners: [],
        more: {render: () => moreNode},
        render: () => root,
        use(module) { this.listeners.push(module) }
    }
}

describe('detail episodes plugin', () => {
    test('initial cards are decorated, and the existing more button is preserved', () => {
        const harness = setup()
        const aired = episode({episode_number: 1, name: 'Первая серия', air_date: '2020-01-01'})
        const coming = episode({episode_number: 2, name: 'Вторая серия', air_date: '2099-11-05', comeing: true}, 'full-episode full-episode--small full-episode--next selector')
        const line = row([aired, coming])
        harness.send({type: 'build', name: 'episodes', item: line})

        expect(line.title.textContent).toBe('Все серии')
        expect(line.moreNode.names.has('selector')).toBe(true)
        expect(line.root.names.has('lampa-episode-redesign')).toBe(true)
        expect(aired.root.names.has('selector')).toBe(true)
        expect(aired.root.querySelector('.lampa-episode__heading')).not.toBeNull()
        expect(aired.root.querySelector('.lampa-episode__availability').textContent).toBe('Доступна')
        expect(coming.root.querySelector('.lampa-episode__calendar')).not.toBeNull()
        expect(coming.root.querySelector('.lampa-episode__availability').textContent).toBe('Скоро')
        expect(harness.styles).toHaveLength(2)
    })

    test('lazy-loaded episodes receive the same layout', () => {
        const harness = setup()
        const line = row([])
        harness.send({type: 'build', name: 'episodes', item: line})
        const appended = episode({episode_number: 8, name: 'Восьмая', air_date: '2020-12-01'})
        line.listeners[0].onPush(appended, appended.data)
        expect(appended.root.querySelector('.lampa-episode__heading')).not.toBeNull()
        expect(appended.root.querySelector('.full-episode__num').textContent).toBe('08')
    })

    test('repeated build notification is idempotent', () => {
        const harness = setup()
        const a = episode({episode_number: 3, name: 'Эпизод', air_date: '2020-01-01'})
        const line = row([a])
        harness.send({type: 'build', name: 'episodes', item: line})
        harness.send({type: 'build', name: 'episodes', item: line})
        expect(line.listeners).toHaveLength(1)
        expect(a.root.querySelector('.lampa-episode__heading').children).toHaveLength(2)
    })

    test('other full build sections are left alone', () => {
        const harness = setup()
        const line = row([episode({episode_number: 1, name: 'Имя'})])
        harness.send({type: 'build', name: 'persons', item: line})
        expect(line.title.textContent).toBe('Ещё')
        expect(line.listeners).toHaveLength(0)
    })
})
