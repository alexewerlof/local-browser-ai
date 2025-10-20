import { MarkdownIt } from '../vendor/markdown-it.js'
import { createEl, Wrapper } from './dom.js'
const md2html = MarkdownIt()

const VALID_ROLES = ['assistant', 'user', 'system']

export class Message extends Wrapper {
    constructor(role, content = '') {
        super(createEl('div'))
        this.addClass('chat-container__chat', `chat-container__chat--${role}`)

        this.role = role
        this.content = content
    }

    get role() {
        return this._role
    }

    set role(value) {
        if (!VALID_ROLES.includes(value)) {
            throw new Error(`Invalid role: ${value}`)
        }

        this._role = value
    }

    get content() {
        return this._content
    }

    set content(value) {
        if (typeof value !== 'string') {
            throw new Error(`Invalid content: ${value}`)
        }

        this._content = value
        this.html = md2html.render(value)
    }

    toJSON() {
        return {
            role: this.role,
            content: this.content,
        }
    }
}
