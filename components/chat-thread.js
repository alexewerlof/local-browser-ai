import { fetchComponentFiles, Wrapper } from '../util/Wrapper.js'
import { ChatMessage } from './chat-message.js'

const files = await fetchComponentFiles('chat-thread', import.meta.url)

export class ChatThread extends HTMLElement {
    constructor() {
        super()
        this.wrapped = new Wrapper(this)
        this.wrappedShadow = this.wrapped.setShadow().getShadow()
        this.wrappedShadow.frag.adoptedStyleSheets = [files.sheet]
        this.wrappedShadow.setHtml(files.html)
    }

    append(...children) {
        for (const child of children) {
            if (child instanceof ChatMessage) {
                this.wrappedShadow.append(child)
            } else {
                throw new TypeError(`Expected ChatMessage or HTMLElement. Got: ${child} (${typeof child})`)
            }
        }
    }
}

customElements.define('chat-thread', ChatThread)
