import { markdown2html } from '../util/markdown.js'
import * as format from '../util/format.js'
import * as msg from '../util/msg.js'
import { fetchComponentFiles, Wrapper } from '../util/Wrapper.js'

const files = await fetchComponentFiles('chat-message', import.meta.url)

export class ChatMessage extends HTMLElement {
    _role
    _content
    wrappedShadow

    static attrName = {
        role: 'role',
        content: 'content',
        source: 'source',
        tokenCount: 'token-count',
    }

    static get observedAttributes() {
        return Object.values(this.attrName)
    }

    constructor() {
        super()
        this.wrapped = new Wrapper(this)
        this.wrappedShadow = this.wrapped.setShadow().getShadow()
        this.wrappedShadow.frag.adoptedStyleSheets = [files.sheet]
        this.wrappedShadow.setHtml(files.html)
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return

        switch (name) {
            case ChatMessage.attrName.role:
                this.role = newValue
                break
            case ChatMessage.attrName.content:
                this.content = newValue
                break
            case ChatMessage.attrName.source:
                this.source = JSON.parse(newValue)
                break
            case ChatMessage.attrName.tokenCount:
                this.tokenCount = Number(newValue)
                break
        }
    }

    set source(source) {
        this._source = source
        if (source) {
            const { faviconUrl, title, url } = source
            this.wrappedShadow.byId('source').setAttr('href', url)
            this.wrappedShadow.byId('title').setText(title)
            if (faviconUrl) {
                this.wrappedShadow.byId('favicon').setAttr('src', faviconUrl)
            }
            this.wrappedShadow.byId('content').hide()
        } else {
            this.wrappedShadow.byId('source').rm()
        }
    }

    get source() {
        return this._source
    }

    set tokenCount(tokens) {
        this._tokenCount = tokens
        this.wrappedShadow.byId('token-count').setText(`${format.num(tokens)} tok`)
        if (this.getAttribute(ChatMessage.attrName.tokenCount) !== String(tokens)) {
            this.setAttribute(ChatMessage.attrName.tokenCount, tokens)
        }
        return this
    }

    get tokenCount() {
        return this._tokenCount
    }

    get role() {
        return this._role
    }

    set role(value) {
        if (!msg.VALID_ROLES.includes(value)) {
            throw new Error(`Invalid role: ${value}`)
        }

        this._role = value
        this.wrapped.addClass(value)
        this.wrappedShadow.byId('role').setText(value)
        if (this.getAttribute(ChatMessage.attrName.role) !== value) {
            this.setAttribute(ChatMessage.attrName.role, value)
        }
        return this
    }

    get content() {
        return this._content
    }

    set content(value) {
        if (typeof value !== 'string') {
            throw new Error(`Invalid content: ${value}`)
        }

        this._content = value
        this.wrappedShadow.byId('content').setHtml(markdown2html(value))
        if (this.getAttribute(ChatMessage.attrName.content) !== value) {
            this.setAttribute(ChatMessage.attrName.content, value)
        }
        this.scrollIntoView()
        return this
    }

    scrollIntoView(params) {
        this.wrappedShadow.byId('content').el.scrollIntoView(params)
    }

    toJSON() {
        return msg.base(this.role, this.content)
    }
}

customElements.define('chat-message', ChatMessage)
