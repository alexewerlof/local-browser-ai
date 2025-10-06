export function id(elementId) {
    return document.getElementById(elementId);
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
