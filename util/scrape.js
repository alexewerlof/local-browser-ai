/**
 * This function is injected to a page to scrape the DOM.
 * Please note that due to how Chrome works, it cannot call any other function or use any external variables.
 */
export function scrapePageHtml() {
    // Tag names should be in upper case
    const TAG_BLOCK_LIST = new Set([
        'APPLET',
        'AREA',
        'ASIDE',
        'AUDIO',
        'BASE',
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
        'LINK',
        'META',
        'NAV',
        'NOSCRIPT',
        'OBJECT',
        'OPTION',
        'SCRIPT',
        'SELECT',
        'STYLE',
        'SVG',
        'TEXTAREA',
        'VIDEO',
    ])

    // Tag names should be in upper case
    const ALLOWED_VOID_ELEMENTS = new Set(['BR', 'HR', 'IMG', 'COL', 'SOURCE', 'TRACK', 'WBR'])

    // Keys should be in upper case. All ARIA-* attributes are allowed.
    const ATTR_ALLOW_LIST = {
        IMG: ['SRC', 'ALT'],
        A: ['HREF', 'TITLE'],
    }

    function attributesToRemove(node) {
        const attributesToKeep = ATTR_ALLOW_LIST[node.tagName]
        return [...node.attributes].filter((attr) => {
            const attrUpperCase = attr.name.toUpperCase()
            if (attrUpperCase.startsWith('ARIA-')) {
                return false
            }
            if (attributesToKeep) {
                return !attributesToKeep.includes(attrUpperCase)
            }
            return true
        })
    }

    function createReplacementNode(el) {
        const replacementTag = window.getComputedStyle(el).display === 'inline' ? 'span' : 'div'
        return document.createElement(replacementTag)
    }

    const bodyClone = document.body.cloneNode(true)

    /* Expose shadow DOM content*/
    {
        for (const el of bodyClone.querySelectorAll('*')) {
            if (el.shadowRoot) {
                el.innerHTML = el.shadowRoot.innerHTML
            }
        }
    }

    /* replace custom elements */
    {
        for (const el of bodyClone.querySelectorAll('*')) {
            if (el.tagName.includes('-')) {
                const replacement = createReplacementNode(el)
                while (el.firstChild) {
                    replacement.appendChild(el.firstChild)
                }
                el.parentNode.replaceChild(replacement, el)
            }
        }
    }

    /* Remove unwanted nodes and attributes */
    {
        const walker = document.createTreeWalker(bodyClone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT)

        const nodesToRemove = []
        while (walker.nextNode()) {
            const currentNode = walker.currentNode
            switch (currentNode.nodeType) {
                case Node.ELEMENT_NODE:
                    if (TAG_BLOCK_LIST.has(currentNode.tagName)) {
                        nodesToRemove.push(currentNode)
                    } else {
                        for (const attr of attributesToRemove(currentNode)) {
                            currentNode.removeAttribute(attr.name)
                        }
                    }
                    break
                case Node.COMMENT_NODE:
                    nodesToRemove.push(currentNode)
                    break
            }
        }

        for (const node of nodesToRemove) {
            node.remove()
        }
    }

    /* Remove void elements */
    {
        let removedInPass
        do {
            removedInPass = 0
            const allElements = [...bodyClone.querySelectorAll('*')].reverse()
            for (const el of allElements) {
                if (
                    !ALLOWED_VOID_ELEMENTS.has(el.tagName) &&
                    el.children.length === 0 &&
                    el.textContent.trim() === ''
                ) {
                    el.remove()
                    removedInPass++
                }
            }
        } while (removedInPass > 0)
    }

    return {
        html: bodyClone.innerHTML,
        base: document.baseURI,
    }
}
