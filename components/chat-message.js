import { markdown2html } from '../util/markdown.js'
import * as format from '../util/format.js'
import * as msg from '../util/msg.js'
import { registerComponent, Wrapper } from '../util/Wrapper.js'

export class ChatMessage extends HTMLElement {
    wrapped
    wrappedShadow
    _contentMarkdown

    constructor() {
        super()
        this.wrapped = new Wrapper(this)
        this.wrappedShadow = this.initShadow()
        this.role = msg.VALID_ROLES[0]
        this.favicon = ''
        this.context = ''
        this.content = ''
        this.tokenCount = 0
    }

    get favicon() {
        return this.wrappedShadow.byId('favicon').getAttr('src')
    }

    set favicon(value) {
        this.wrappedShadow.byId('favicon').setAttr('src', value)
    }

    get context() {
        return this.wrappedShadow.byId('context').getText()
    }

    set context(value) {
        this.wrappedShadow.byId('context').setText(value)
    }

    get tokenCount() {
        return this.wrappedShadow.byId('token-count').getText()
    }

    set tokenCount(tokens) {
        this.wrappedShadow.byId('token-count').setText(`${format.num(tokens)} tok`)
    }

    get role() {
        return this.wrappedShadow.byId('role')
    }

    set role(value) {
        if (!msg.VALID_ROLES.includes(value)) {
            throw new Error(`Invalid role: ${value}`)
        }

        for (const role of msg.VALID_ROLES) {
            if (role === value) {
                this.wrapped.addClass(value)
            } else {
                this.wrapped.rmClass(role)
            }
        }
        this.wrappedShadow.byId('role').setText(value)
    }

    get content() {
        return this._contentMarkdown
    }

    set content(value) {
        if (typeof value !== 'string') {
            throw new Error(`Invalid content: ${value}`)
        }

        this._contentMarkdown = value

        this.wrappedShadow.byId('content').setHtml(markdown2html(value))
        this.scrollIntoView()
        return this
    }

    scrollIntoView(params) {
        this.wrappedShadow.byId('content').el.scrollIntoView(params)
    }

    toJSON() {
        let finalContent = this.content
        if (this.context) {
            finalContent = `Context:\n${this.context}\n\nQuery:\n${this.content}`
        }
        return msg.base(this.role, finalContent)
    }
}

await registerComponent(
    'chat-message',
    ChatMessage,
    import.meta.url,
    'role',
    'favicon',
    'context',
    'content',
    'token-count',
)
