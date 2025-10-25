export function query(selector) {
    return Array.from(document.querySelectorAll(selector)).map((el) => new Wrapper(el))
}

export function on(target, eventName, handler) {
    return target.addEventListener(eventName, handler)
}

export function off(target, eventName, handler) {
    return target.removeEventListener(eventName, handler)
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
    _el = null

    constructor(ref) {
        this.el = typeof ref === 'string' ? document.createElement(ref) : ref
    }

    static fromId(elementId) {
        return new Wrapper(document.getElementById(elementId))
    }

    static fromTagName(tagName) {
        return new Wrapper(tagName)
    }

    get el() {
        return this._el
    }

    set el(value) {
        if (!(value instanceof HTMLElement)) {
            throw new TypeError(`Expected an string or HTMLElement. Got: ${value} (${typeof value})`)
        }
        this._el = value
    }

    clone() {
        return new Wrapper(this.el.cloneNode(true))
    }

    getValue() {
        return this.el.value
    }

    setValue(value) {
        this.el.value = value
        return this
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

    rmAttrs(...names) {
        for (const name of names) {
            this.el.removeAttribute(name)
        }
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
        off(this.el, eventName, handler)
        return this
    }

    hide() {
        return this.setAttr('hidden', '').setAttr('aria-hidden', 'true')
    }

    show() {
        return this.rmAttrs('hidden', 'aria-hidden')
    }

    disable() {
        return this.setAttr('disabled', '').setAttr('aria-disabled', 'true')
    }

    enable() {
        return this.rmAttrs('disabled', 'aria-disabled')
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

    getTitle() {
        return this.getAttr('title')
    }

    setTitle(title) {
        return this.setAttr('title', title)
    }

    getText() {
        return this.el.innerText
    }

    setText(text) {
        this.el.innerText = text
        return this
    }

    getHtml() {
        return this.el.innerHTML
    }

    setHtml(html) {
        this.el.innerHTML = html
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
}
