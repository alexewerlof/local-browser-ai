/** Used to Give the UI a moment to update */
export function nextAnimationFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve))
}

export function on(target, eventName, handler) {
    return target.addEventListener(eventName, handler)
}

export function off(target, eventName, handler) {
    return target.removeEventListener(eventName, handler)
}

function unwrap(obj) {
    if (typeof obj === 'string') {
        return document.createTextNode(obj)
    }
    if (!obj || typeof obj !== 'object') {
        throw new TypeError(`Expected an object. Got ${obj} (${typeof obj})`)
    }
    if (obj instanceof Text || obj instanceof HTMLElement || obj instanceof DocumentFragment) {
        return obj
    }
    if (obj instanceof Wrapper) {
        return obj.el
    }
    if (obj instanceof Frag) {
        return obj.frag
    }
    throw new TypeError(`Only Frag or DocumentFragment can be unwrapped. Got ${obj} (${typeof obj})`)
}

function wrap(obj) {
    if (typeof obj === 'string') {
        return document.createTextNode(obj)
    }
    if (!obj || typeof obj !== 'object') {
        throw new TypeError(`Expected an object. Got ${obj} (${typeof obj})`)
    }
    if (obj instanceof HTMLElement) {
        return new Wrapper(obj)
    }
    if (obj instanceof DocumentFragment) {
        return new Frag(obj)
    }
    if (obj instanceof Wrapper || obj instanceof Frag) {
        return obj
    }
    throw new TypeError(`Only Frag or DocumentFragment can be wrapped. Got ${obj} (${typeof obj})`)
}

function wrapAll(iterable) {
    return Array.from(iterable, wrap)
}

function unwrapAll(iterable) {
    return Array.from(iterable, unwrap)
}

export class Wrapper {
    _el = null

    constructor(ref) {
        this.el = typeof ref === 'string' ? document.createElement(ref) : ref
    }

    static byId(id) {
        return wrap(document.getElementById(id))
    }

    static byClass(className) {
        return wrapAll(document.getElementsByClassName(className))
    }

    static query(selector) {
        return wrap(document.querySelector(selector))
    }

    static queryAll(selector) {
        return wrapAll(document.querySelectorAll(selector))
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
        return wrapAll(this.el.getElementsByClassName(className))
    }

    query(selector) {
        return wrap(this.el.querySelector(selector))
    }

    queryAll(selector) {
        return wrapAll(this.el.querySelectorAll(selector))
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

    setDataObj(obj) {
        for (const [name, value] of Object.entries(obj)) {
            this.setData(name, value)
        }
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

    setAriaObj(obj) {
        for (const [name, value] of Object.entries(obj)) {
            this.setAria(name, value)
        }
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

    setAttrObj(obj) {
        for (const [name, value] of Object.entries(obj)) {
            this.setAttr(name, value)
        }
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

    rm() {
        this.el.remove()
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
        this.el.innerText = ''
        return this
    }

    append(...children) {
        this.el.append(...unwrapAll(children))
        return this
    }

    mapAppend(array, mapFn) {
        return this.append(...array.map(mapFn))
    }

    prepend(...children) {
        this.el.prepend(...unwrapAll(children))
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

    setShadow(mode = 'open') {
        if (!this.el.shadowRoot) {
            this.el.attachShadow({ mode })
        }
        return this
    }

    getShadow() {
        return new Frag(this.el.shadowRoot)
    }
}

export class Frag {
    _frag = null

    constructor(ref) {
        this.frag = ref instanceof DocumentFragment ? ref : document.createDocumentFragment()
    }

    get frag() {
        return this._frag
    }

    set frag(value) {
        if (!(value instanceof DocumentFragment)) {
            throw new TypeError(`Expected a DocumentFragment. Got ${value} (${typeof value})`)
        }
        this._frag = value
    }

    byId(id) {
        return wrap(this.frag.getElementById(id))
    }

    byClass(className) {
        return wrapAll(this.frag.getElementsByClassName(className))
    }

    query(selector) {
        return wrap(this.frag.querySelector(selector))
    }

    queryAll(selector) {
        return wrapAll(this.frag.querySelectorAll(selector))
    }

    empty() {
        this.frag.replaceChildren()
        return this
    }

    append(...children) {
        this.frag.append(...unwrapAll(children))
        return this
    }

    mapAppend(array, mapFn) {
        return this.append(...array.map(mapFn))
    }

    prepend(...children) {
        this.frag.prepend(...unwrapAll(children))
        return this
    }

    mapPrepend(array, mapFn) {
        return this.prepend(...array.map(mapFn))
    }

    getText() {
        return this.frag.innerText
    }

    setText(text) {
        this.frag.innerText = text
        return this
    }

    getHtml() {
        return this.frag.innerHTML
    }

    setHtml(html) {
        this.frag.innerHTML = html
        return this
    }
}

async function fetchText(url, accept) {
    const response = await fetch(url, { headers: { Accept: accept } })
    if (!response.ok) {
        throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
}

async function fetchHtml(url) {
    return await fetchText(url, 'text/html')
}

async function fetchComponentTemplate(componentName, baseUrl) {
    return await fetchHtml(new URL(`${componentName}.html`, baseUrl))
}

async function fetchCss(url) {
    return await fetchText(url, 'text/css')
}

async function fetchSheet(url) {
    const sheet = new CSSStyleSheet()
    return await sheet.replace(await fetchCss(url))
}

async function fetchComponentSheet(componentName, baseUrl) {
    return fetchSheet(new URL(`${componentName}.css`, baseUrl))
}

function attributeChangedCallback(attrName, oldValue, newValue) {
    if (oldValue !== newValue) {
        const propName = keb2cam(attrName)
        if (propName in this) {
            this[propName] = newValue
        } else {
            console.warn(`Unknown attribute: ${attrName} (no prop ${propName})`)
        }
    }
}

function initShadow(mode = 'open') {
    const shadow = this.attachShadow({ mode })
    if (this._componentFiles.sheet) {
        shadow.adoptedStyleSheets = [this._componentFiles.sheet]
    }
    if (this._componentFiles.html) {
        shadow.innerHTML = this._componentFiles.html
    }
    return new Frag(shadow)
}

/**
 * Fetches component files, attaches them to the constructor, and defines the custom element.
 * @param {string} name The name of the custom element.
 * @param {HTMLElement} constructor The component's class constructor.
 * @param {string} importMetaUrl The `import.meta.url` of the component module.
 * @returns {Promise<void>} A promise that resolves when the custom element is defined.
 */
export async function registerComponent(name, constructor, importMetaUrl, ...observedAttributes) {
    if (typeof name !== 'string') {
        throw new TypeError(`Expected a component name string. Got ${name} (${typeof name})`)
    }
    if (typeof constructor !== 'function') {
        throw new TypeError(`Expected a constructor function. Got ${constructor} (${typeof constructor})`)
    }
    if (typeof importMetaUrl !== 'string') {
        throw new TypeError(`Expected an import.meta.url string. Got ${importMetaUrl} (${typeof importMetaUrl})`)
    }
    if (observedAttributes.length) {
        constructor.observedAttributes = observedAttributes
        constructor.attributeChangedCallback = attributeChangedCallback
    }
    const [html, sheet] = await Promise.all([
        fetchComponentTemplate(name, importMetaUrl),
        fetchComponentSheet(name, importMetaUrl),
    ])
    constructor.prototype._componentFiles = { html, sheet }
    constructor.prototype.initShadow = initShadow
    if (!customElements.get(name)) {
        customElements.define(name, constructor) // There's also an options that we're skipping
    }
    return customElements.whenDefined(name)
}

export function pas2keb(str) {
    if (typeof str !== 'string') {
        throw new TypeError(`Expected a string. Got ${str} (${typeof str})`)
    }
    if (/[^a-zA-Z0-9_]/.test(str)) {
        throw new TypeError(`Invalid characters in string. Only alphanumeric and underscores are allowed. Got: ${str}`)
    }
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase()
}

export function keb2pas(str) {
    if (typeof str !== 'string') {
        throw new TypeError(`Expected a string. Got ${str} (${typeof str})`)
    }
    return (
        str
            .split('-')
            .filter(Boolean) // Remove empty strings from leading/trailing/multiple hyphens
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join('') ||
        // Handle strings that were not kebab-case to begin with (e.g. 'single', 'camelCase')
        (str.length > 0 ? str.charAt(0).toUpperCase() + str.slice(1) : '')
    )
}

export function keb2cam(str) {
    if (typeof str !== 'string') {
        throw new TypeError(`Expected a string. Got ${str} (${typeof str})`)
    }
    return str
        .replace(/^-+/, '') // Remove any leading hyphens
        .replace(/-+$/, '') // Remove any trailing hyphens
        .replace(/-+([a-z])/g, (g, c) => c.toUpperCase())
}
