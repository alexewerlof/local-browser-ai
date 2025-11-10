export function on(target, eventName, handler) {
    return target.addEventListener(eventName, handler)
}

export function off(target, eventName, handler) {
    return target.removeEventListener(eventName, handler)
}

export class Wrapper {
    _el = null

    constructor(ref) {
        this.el = typeof ref === 'string' ? document.createElement(ref) : ref
    }

    static unwrap(obj) {
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

    static wrap(obj) {
        if (!obj || typeof obj !== 'object') {
            throw new TypeError(`Expected an object. Got ${obj} (${typeof obj})`)
        }
        if (obj instanceof Wrapper) {
            return obj
        }
        if (obj instanceof HTMLElement) {
            return new Wrapper(obj)
        }
        throw new TypeError(`Only Wrapper or HTMLElement descendants can be wrapped. Got ${obj} (${typeof obj})`)
    }

    static wrapAll(iterable) {
        return Array.from(iterable, (obj) => Wrapper.wrap(obj))
    }

    static byId(id) {
        return Wrapper.wrap(document.getElementById(id))
    }

    static byClass(className) {
        return Wrapper.wrapAll(document.getElementsByClassName(className))
    }

    static query(selector) {
        return Wrapper.wrap(document.querySelector(selector))
    }

    static queryAll(selector) {
        return Wrapper.wrapAll(document.querySelectorAll(selector))
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

    byClass(className) {
        return Wrapper.wrapAll(this.el.getElementsByClassName(className))
    }

    query(selector) {
        return Wrapper.wrap(this.el.querySelector(selector))
    }

    queryAll(selector) {
        return Wrapper.wrapAll(this.el.querySelectorAll(selector))
    }

    clone(deep) {
        return new Wrapper(this.el.cloneNode(deep))
    }

    getValue() {
        return this.el.value
    }

    setValue(value) {
        this.el.value = value
        return this
    }

    getData(name) {
        return this.el.dataset[name]
    }

    setData(name, value) {
        this.el.dataset[name] = value
        return this
    }

    rmData(name) {
        delete this.el.dataset[name]
        return this
    }

    getAria(name) {
        return this.el.getAttribute(`aria-${name}`)
    }

    setAria(name, value) {
        this.el.setAttribute(`aria-${name}`, value)
        return this
    }

    rmAria(name) {
        this.el.removeAttribute(`aria-${name}`)
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

    append(...children) {
        for (const child of children) {
            this.el.appendChild(Wrapper.unwrap(child))
        }
        return this
    }

    mapAppend(array, mapFn) {
        return this.append(...array.map(mapFn))
    }

    prepend(...children) {
        for (const child of children) {
            this.el.prepend(Wrapper.unwrap(child))
        }
        return this
    }

    mapPrepend(array, mapFn) {
        return this.prepend(...array.map(mapFn))
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
}
