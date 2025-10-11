export function id(elementId) {
    return document.getElementById(elementId);
}

export function query(selector) {
    return Array.from(document.querySelectorAll(selector))
}

export function val(elementId) {
    return id(elementId).value;
}

export function create(tagName) {
    return document.createElement(tagName);
}

export function text(...parts) {
    const el = document.createTextNode(parts.join(' '));
    return el;
}

export function on(elementOrId, eventName, handler) {
    const el = typeof elementOrId === 'string' ? id(elementOrId) : elementOrId;
    return el.addEventListener(eventName, handler);
}

export function click(elementOrId, handler) {
    return on(elementOrId, 'click', handler);
}

export function h(tagName, attributes, ...children) {
    const el = create(tagName);
    if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
            el.setAttribute(key, value);
        }
    }
    for (const child of children) {
        el.appendChild(typeof child === 'string' ? text(child) : child);
    }
    return el;
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

    attr(name, value) {
        this.el[name] = value
        return this
    }

    on(eventName, handler) {
        this.el.addEventListener(eventName, handler)
        return this
    }

    click(handler) {
        return this.on('click', handler)
    }

    off(eventName, handler) {
        this.el.removeEventListener(eventName, handler)
        return this
    }

    hide() {
        return this.attr('hidden', true)
    }

    show() {
        return this.attr('hidden', false)
    }

    disable() {
        return this.attr('disabled', true)
    }

    enable() {
        return this.attr('disabled', false)
    }

    focus() {
        this.el.focus()
        return this
    }

    text() {
        return this.attr('innerText', value)
    }
}