/**
 * This function is injected to a page to scrape the DOM.
 * Please note that due to how Chrome works, it cannot call any other function or use any external variables.
 */
export function scrapePageHtml() {
    const tagNameBlockList = new Set([
        'APPLET',
        'ASIDE',
        'AUDIO',
        'BUTTON',
        'CANVAS',
        'EMBED',
        'FOOTER',
        'FORM',
        'FRAME',
        'FRAMESET',
        'HEADER',
        'IFRAME',
        'INPUT',
        'NAV',
        'NOSCRIPT',
        'OBJECT',
        'OPTION',
        'SCRIPT',
        'SELECT',
        'STYLE',
        'SVG',
        'SVG',
        'TEXTAREA',
        'VIDEO',
    ])

    const attributeWhitelist = new Set(['href', 'src', 'alt', 'title'])

    const bodyClone = document.body.cloneNode(true)
    // Flatten all shadow DOMs within the cloned body.
    // We query all elements within the clone and check for a shadowRoot.
    // If a shadowRoot exists, we replace the element's content with the shadowRoot's content.
    // This needs to be done before we start removing elements with the TreeWalker.
    const allElements = bodyClone.querySelectorAll('*')
    for (const el of allElements) {
        if (el.shadowRoot) {
            el.innerHTML = el.shadowRoot.innerHTML
        }
    }

    // Replace custom elements with div or span based on their display property
    for (const el of allElements) {
        if (el.tagName.includes('-')) {
            const display = window.getComputedStyle(el).display
            const replacementTag = display === 'inline' ? 'span' : 'div'
            const replacement = document.createElement(replacementTag)
            while (el.firstChild) {
                replacement.appendChild(el.firstChild)
            }
            el.parentNode.replaceChild(replacement, el)
        }
    }
    const walker = document.createTreeWalker(bodyClone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT)

    const nodesToRemove = []
    const nodesToClean = []
    let currentNode = walker.nextNode()
    while (currentNode) {
        if (currentNode.nodeType === Node.COMMENT_NODE) {
            nodesToRemove.push(currentNode)
        } else {
            const href = currentNode.getAttribute('href')
            // Remove anchor links that point to a hash on the current page.
            if (
                tagNameBlockList.has(currentNode.tagName) ||
                (currentNode.tagName === 'A' && href && href.startsWith('#'))
            ) {
                nodesToRemove.push(currentNode)
            } else {
                nodesToClean.push(currentNode)
            }
        }
        currentNode = walker.nextNode()
    }

    for (const node of nodesToClean) {
        for (const attr of [...node.attributes]) {
            const attrName = attr.name.toLowerCase()
            if (!attributeWhitelist.has(attrName) && !attrName.startsWith('aria-')) {
                node.removeAttribute(attr.name)
            }
        }
    }

    for (const node of nodesToRemove) {
        node.remove()
    }

    // Remove empty elements that don't matter.
    // Some elements like <img> or <hr> are self-closing and are meaningful.
    const voidElementsToKeep = new Set(['BR', 'HR', 'IMG'])
    let removedInPass
    do {
        removedInPass = 0
        const allElements = bodyClone.querySelectorAll('*')
        for (let i = allElements.length - 1; i >= 0; i--) {
            const el = allElements[i]
            if (!voidElementsToKeep.has(el.tagName) && el.children.length === 0 && el.textContent.trim() === '') {
                el.remove()
                removedInPass++
            }
        }
        // Repeat until no more empty elements are removed in a full pass.
    } while (removedInPass > 0)

    return bodyClone.innerHTML
}
