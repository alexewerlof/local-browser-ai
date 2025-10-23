import { markdown2html } from '../markdown.js'
import { Wrapper } from './Wrapper.js'
import * as msg from './msg.js'

const VALID_ROLES = ['assistant', 'user', 'system']

export class Message extends Wrapper {
    constructor(role, content = '') {
        super('div')
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
        this.setHtml(markdown2html(value))
    }

    toJSON() {
        return msg.base(this.role, this.content)
    }
}
