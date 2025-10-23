import { html2markdown } from '../markdown.js'
import { createEl, createWrapper, Wrapper } from './dom.js'
import * as msg from './msg.js'

const defaultFavIcon = 'images/icon-32.png'
export class ImportedContent extends Wrapper {
    constructor(message) {
        super(createEl('div'))
        this.addClass('chat-container__chat', 'chat-container__chat--imported-content')

        this.markdownContent = message.format === 'text' ? message.payload : html2markdown(message.payload)
        console.log(this.markdownContent)

        const title = createWrapper('span').setText(message.title)
        const link = createWrapper('a')
            .setAttr('href', message.url)
            .setAttr('title', message.url)
            .setAttr('target', '_blank')
            .setAttr('rel', 'noopener noreferrer')
            .append(createWrapper('img').setAttr('src', message.faviconUrl || defaultFavIcon), title)

        this.tokenCountIndicator = createWrapper('div').addClass('chat-container__chat__token-count', 'subtle-text')
        this.append(link, this.tokenCountIndicator)
    }

    set tokenCount(value) {
        this.tokenCountIndicator.setText(`${value} tok`)
    }

    toJSON() {
        return msg.user(this.markdownContent)
    }
}
