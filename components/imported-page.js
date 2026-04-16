import { defineComponent, fetchTemplate, fetchStyle, attr2prop, JJHE } from '../vendor/jj.js'

const templatePromise = fetchTemplate(import.meta.resolve('./imported-page.html'))
const stylePromise = fetchStyle(import.meta.resolve('./imported-page.css'))

export class ImportedPage extends HTMLElement {
    static observedAttributes = ['url', 'title', 'favicon', 'page-html', 'status', 'progress']
    static defined = defineComponent('imported-page', ImportedPage)

    #jjHost
    #jjShadow

    constructor() {
        super()
        this.#jjHost = JJHE.from(this).setShadow('open')
        this.#jjShadow = this.#jjHost.getShadow(true)
    }

    async connectedCallback() {
        this.#jjHost.initShadow(await templatePromise, await stylePromise)
    }

    attributeChangedCallback(name, oldValue, newValue) {
        attr2prop(this, name, oldValue, newValue)
    }

    get favicon() {
        return this.#jjShadow.find('#favicon', true).getAttr('src')
    }

    set favicon(value) {
        if (!this.#jjShadow) return
        this.#jjShadow.find('#favicon', true).setAttr('src', value)
    }

    get url() {
        return this.#jjShadow.find('#title', true).getAttr('href')
    }

    set url(value) {
        if (!this.#jjShadow) return
        this.#jjShadow.find('#title', true).setAttr('href', value)
    }

    get title() {
        return this.#jjShadow.find('#title', true).getText()
    }

    set title(value) {
        if (!this.#jjShadow) return
        this.#jjShadow.find('#title', true).setText(value)
    }

    get pageHtml() {
        return this.#jjShadow.find('#page-html', true).getHTML()
    }

    set pageHtml(value) {
        if (!this.#jjShadow) return
        this.#jjShadow.find('#page-html', true).setHTML(value, true)
    }

    get status() {
        return this.#jjShadow.find('#status', true).getText()
    }

    set status(value) {
        if (!this.#jjShadow) return
        this.#jjShadow.find('#status', true).setText(value)
    }

    get progress() {
        return this.#jjShadow.find('#progress', true).getValue()
    }

    set progress(value) {
        if (!this.#jjShadow) return
        this.#jjShadow.find('#progress', true).setValue(value)
    }

    update(progress, status) {
        if (typeof progress !== 'number') {
            throw new TypeError(`Expected a number for progress. Got ${progress} (${typeof progress})`)
        }
        if (progress < 0) {
            progress = 0
        } else if (progress > 100) {
            progress = 100
        }
        this.progress = progress

        if (typeof status !== 'string') {
            throw new TypeError(`Expected a string for status. Got ${status} (${typeof status})`)
        }
        this.status = progress < 100 ? `${status}...` : status

        return this
    }
}

await ImportedPage.defined
