import { markdown2html } from '../markdown.js'
import * as msg from '../util/msg.js'
import { fetchComponentFiles, Wrapper } from '../util/Wrapper.js'

const files = await fetchComponentFiles('chat-message', import.meta.url)
customElements.define('chat-message', ChatMessage)

export class ChatMessage extends HTMLElement {
    _role
    _content
    _shadow

    constructor(role, content = '') {
        super()

        this._shadow = new Wrapper(this).setShadow().getShadow()
        this._shadow.frag.adoptedStyleSheets = [files.sheet]
        // this.shadowRoot.adoptedStyleSheets = [extra.css]
        this._shadow.setHtml(files.html)
        this._shadow.byId('root').addClass(role)

        this.role = role
        this.content = content
    }

    get role() {
        return this._role
    }

    set role(value) {
        if (!msg.VALID_ROLES.includes(value)) {
            throw new Error(`Invalid role: ${value}`)
        }

        this._role = value
        this._shadow.byId('role').setText(value)
    }

    get content() {
        return this._content
    }

    set content(value) {
        if (typeof value !== 'string') {
            throw new Error(`Invalid content: ${value}`)
        }

        this._content = value
        this._shadow.byId('content').setHtml(markdown2html(value))
        this.scrollIntoView()
    }

    scrollIntoView(params) {
        this._shadow.byId('content').el.scrollIntoView(params)
    }

    toJSON() {
        return msg.base(this.role, this.content)
    }
}
