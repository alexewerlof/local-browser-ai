import { markdown2html } from '../markdown.js'
import * as format from '../util/format.js'
import * as msg from '../util/msg.js'
import { fetchComponentFiles, Wrapper } from '../util/Wrapper.js'

const files = await fetchComponentFiles('chat-message', import.meta.url)

export class ChatMessage extends HTMLElement {
    _role
    _content
    wrappedShadow

    constructor(role, content = '', options = {}) {
        super()
        this.wrapped = new Wrapper(this)

        this.wrappedShadow = this.wrapped.setShadow().getShadow()
        this.wrappedShadow.frag.adoptedStyleSheets = [files.sheet]
        // this.shadowRoot.adoptedStyleSheets = [extra.css]
        this.wrappedShadow.setHtml(files.html)
        this.wrappedShadow.byId('root').addClass(role)

        this.role = role
        this.content = content

        const { source, tokenCount } = options
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

        if (Number.isFinite(tokenCount)) {
            this.tokenCount = tokenCount
        }
    }

    set tokenCount(tokens) {
        this.wrappedShadow.byId('token-count').setText(`${format.num(tokens)} tok`)
        return this
    }

    get role() {
        return this._role
    }

    set role(value) {
        if (!msg.VALID_ROLES.includes(value)) {
            throw new Error(`Invalid role: ${value}`)
        }

        this._role = value
        this.wrappedShadow.byId('role').setText(value)
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
