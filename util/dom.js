export function id(elementId) {
    return document.getElementById(elementId)
}

export function createEl(tagName) {
    return document.createElement(tagName)
}

/**
 * Creates a new wrapped DOM element.
 * @param {keyof HTMLElementTagNameMap} tagName The HTML tag name for the element to create.
 * @returns {Wrapper} A new Wrapper instance for the created element.
 */
export function createWrapper(tagName) {
    return new Wrapper(createEl(tagName))
}

export function query(selector) {
    return Array.from(document.querySelectorAll(selector)).map((el) => new Wrapper(el))
}

export function on(target, eventName, handler) {
    return target.addEventListener(eventName, handler)
}

function unwrap(obj) {
    if (!obj || typeof obj !== 'object') {
        throw new TypeError(`Expected an object. Got ${obj} (${typeof obj})`)
    }
    if (obj instanceof Wrapper) {
        return obj.el
    }
    if (obj instanceof HTMLElement) {
        return obj
    }
    throw new TypeError(`Only Wrapper or HTMLElement descendants can be unwrapped. Got ${obj} (${typeof obj})}`)
}

export class Wrapper {
    constructor(ref) {
        if (typeof ref !== 'string' && !(ref instanceof HTMLElement)) {
            throw new TypeError(`Expected an id or HTML Element. Got ${ref} (${typeof ref})`)
        }
        this.ref = ref
    }

    get el() {
        return typeof this.ref === 'string' ? document.getElementById(this.ref) : this.ref
    }

    get val() {
        return this.el.value
    }

    set val(value) {
        this.el.value = value
        return this
    }

    getAttr(name) {
        return this.el.getAttribute(name)
    }

    setAttr(name, value) {
        this.el.setAttribute(name, value)
        return this
    }

    rmAttr(name) {
        this.el.removeAttribute(name)
        return this
    }

    addClass(...classNames) {
        this.el.classList.add(...classNames)
        return this
    }

    rmClass(...classNames) {
        this.el.classList.remove(...classNames)
        return this
    }

    on(eventName, handler) {
        on(this.el, eventName, handler)
        return this
    }

    onClick(handler) {
        return this.on('click', handler)
    }

    off(eventName, handler) {
        this.el.removeEventListener(eventName, handler)
        return this
    }

    hide() {
        this.el.hidden = true
        return this
    }

    show() {
        this.el.hidden = false
        return this
    }

    disable() {
        this.el.disabled = true
        return this
    }

    enable() {
        this.el.disabled = false
        return this
    }

    focus() {
        this.el.focus()
        return this
    }

    click() {
        this.el.click()
        return this
    }

    empty() {
        this.el.innerHTML = ''
        return this
    }

    mapAppend(array, mapFn) {
        return this.append(...array.map(mapFn))
    }

    append(...children) {
        for (const child of children) {
            this.el.appendChild(unwrap(child))
        }
        return this
    }

    get txt() {
        return this.el.innerText
    }

    set txt(value) {
        this.el.innerText = value
        return this
    }

    get html() {
        return this.el.innerHTML
    }

    set html(value) {
        this.el.innerHTML = value
        return this
    }

    get title() {
        return this.el.title
    }

    set title(value) {
        this.el.title = value
        return this
    }
}
