import { markdown2html } from '../util/markdown.js'
import * as format from '../util/format.js'
import * as msg from '../util/msg.js'
import { defineComponent, fetchTemplate, fetchStyle, attr2prop, JJHE } from '../vendor/jj.js'

const templatePromise = fetchTemplate(import.meta.resolve('./chat-message.html'))
const stylePromise = fetchStyle(import.meta.resolve('./chat-message.css'))

export class ChatMessage extends HTMLElement {
    static observedAttributes = ['role', 'favicon', 'context', 'content', 'token-count']
    static defined = defineComponent('chat-message', ChatMessage)

    #jjHost
    #jjShadow
    _contentMarkdown

    constructor() {
        super()
        this.#jjHost = JJHE.from(this).setShadow('open')
        this.#jjShadow = this.#jjHost.getShadow(true)
    }

    async connectedCallback() {
        this.#jjHost.initShadow(await templatePromise, await stylePromise)
        this.role = msg.VALID_ROLES[0]
        this.favicon = ''
        this.context = ''
        this.content = ''
        this.tokenCount = 0
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

    get context() {
        return this.#jjShadow.find('#context', true).getText()
    }

    set context(value) {
        if (!this.#jjShadow) return
        this.#jjShadow.find('#context', true).setText(value)
    }

    get tokenCount() {
        return this.#jjShadow.find('#token-count', true).getText()
    }

    set tokenCount(tokens) {
        if (!this.#jjShadow) return
        this.#jjShadow.find('#token-count', true).setText(`${format.num(tokens)} tok`)
    }

    get role() {
        return this.#jjShadow.find('#role', true)
    }

    set role(value) {
        if (!msg.VALID_ROLES.includes(value)) {
            throw new Error(`Invalid role: ${value}`)
        }

        for (const role of msg.VALID_ROLES) {
            if (role === value) {
                this.#jjHost.addClass(value)
            } else {
                this.#jjHost.rmClass(role)
            }
        }
        if (!this.#jjShadow) return
        this.#jjShadow.find('#role', true).setText(value)
    }

    get content() {
        return this._contentMarkdown
    }

    set content(value) {
        if (typeof value !== 'string') {
            throw new Error(`Invalid content: ${value}`)
        }

        this._contentMarkdown = value

        if (!this.#jjShadow) return
        this.#jjShadow.find('#content', true).setHTML(markdown2html(value), true)
        this.scrollIntoView()
        return this
    }

    scrollIntoView(params) {
        this.#jjShadow.find('#content', true).ref.scrollIntoView(params)
    }

    toJSON() {
        let finalContent = this.content
        if (this.context) {
            finalContent = `Context:\n${this.context}\n\nQuery:\n${this.content}`
        }
        return msg.base(this.role, finalContent)
    }
}

await ChatMessage.defined
