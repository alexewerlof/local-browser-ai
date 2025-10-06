import { id, h } from './dom.js'

function objReverse(obj) {
    return Object.entries(obj).reduce((acc, [k, v]) => {
        acc[v] = k
        return acc
    }, {})
}

function partToStr(part) {
    switch (typeof part) {
        case 'number':
            return String(part)
        case 'boolean':
            return part ? 'true' : 'false'
        case 'string':
            return part
        case 'object':
            if (Array.isArray(part)) {
                return `[${part.map(partToStr).join(', ')}]`
            }
            if (typeof part.toString === 'function') {
                return part.toString()
            }
            return part?.message || JSON.stringify(part)
        default:
            return String(part)
    }
}

export class Konsol {
    static LEVEL = Object.freeze({
        ERROR: 1,
        WARN: 2,
        INFO: 3,
        DEBUG: 4,
    })

    static REV_LEVEL = Object.freeze(objReverse(Konsol.LEVEL))

    constructor(logElementId) {
        this.logEl = id(logElementId);
        this.log = this.info
    }

    print(level, ...parts) {
        const message = parts.map(partToStr).join(' ');
        const newLog = h(
            'p',
            { class: `log log--${level}` },
            h('time', null, new Date().toISOString()),
            h('span', { class: 'log-level' }, level),
            message,
        );
        this.logEl.appendChild(newLog);
        return message;
    }

    debug(...parts) {
        const msg = this.print('debug', ...parts);
        console.debug(msg)
    }

    info(...parts) {
        const msg = this.print('info', ...parts);
        console.info(msg)
    }

    warn(...parts) {
        const msg = this.print('warn', ...parts);
        console.warn(msg)
    }

    error(...parts) {
        const msg = this.print('error', ...parts);
        console.error(msg)
    }

    clear() {
        this.logEl.innerHTML = '';
        console.clear();
    }
}