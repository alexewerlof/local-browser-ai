import { defineComponent, fetchComponentFiles, Wrapper } from '../util/Wrapper.js'

const files = await fetchComponentFiles('imported-page', import.meta.url)

export class ImportedPage extends HTMLElement {
    wrapped
    wrappedShadow

    static attrName = {
        url: 'url',
        title: 'title',
        favicon: 'favicon',
        pageHtml: 'page-html',
        status: 'status',
        progress: 'progress',
    }

    static get observedAttributes() {
        return Object.values(ImportedPage.attrName)
    }

    constructor() {
        super()
        this.wrapped = new Wrapper(this)
        this.wrappedShadow = this.wrapped.setShadow().getShadow()
        this.wrappedShadow.frag.adoptedStyleSheets = [files.sheet]
        this.wrappedShadow.setHtml(files.html)
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            const propName = ImportedPage.attrName[name]
            this[propName] = newValue
        }
    }

    get favicon() {
        return this.wrappedShadow.byId('favicon').getAttr('src')
    }

    set favicon(value) {
        this.wrappedShadow.byId('favicon').setAttr('src', value)
    }

    get url() {
        return this.wrappedShadow.byId('title').getAttr('href')
    }

    set url(value) {
        this.wrappedShadow.byId('title').setAttr('href', value)
    }

    get title() {
        return this.wrappedShadow.byId('title').getText()
    }

    set title(value) {
        this.wrappedShadow.byId('title').setText(value)
    }

    get pageHtml() {
        return this.wrappedShadow.byId('page-html').getHtml()
    }

    set pageHtml(value) {
        this.wrappedShadow.byId('page-html').setHtml(value)
    }

    get status() {
        return this.wrappedShadow.byId('status').getText()
    }

    set status(value) {
        this.wrappedShadow.byId('status').setText(value)
    }

    get progress() {
        return this.wrappedShadow.byId('progress').getValue()
    }

    set progress(value) {
        this.wrappedShadow.byId('progress').setValue(value)
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

await defineComponent('imported-page', ImportedPage)
