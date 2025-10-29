const FULFILLED = 'fulfilled'
const REJECTED = 'rejected'
const RPC_FLAG = 'rpc'
const RPC_FLAG_VAL = 'com.alexewerlof.rpc'

export class Server {
    _handlers = Object.create(null)
    id = ''

    constructor(id, handlers = {}) {
        if (typeof id !== 'string') {
            throw new TypeError(`Expected a string. Got ${id} (${typeof id})`)
        }
        if (id.length === 0) {
            throw new TypeError('Expected a non-empty string for id')
        }
        this.id = id

        if (!handlers || typeof handlers !== 'object') {
            throw new TypeError(`Expected an object for handlers. Got ${handlers} (${typeof handlers})`)
        }

        if (Object.keys(handlers).length === 0) {
            console.debug(`${id} has no handlers.`)
            return
        }

        for (const [handlerName, handlerFn] of Object.entries(handlers)) {
            if (typeof handlerFn !== 'function') {
                throw new TypeError(`Expected a function. Got ${handlerFn} (${typeof handlerFn})`)
            }
            console.debug(`Registered RPC handler: ${this.id}::${handlerName}()`)
            this._handlers[handlerName] = handlerFn
        }

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            try {
                if (sender?.id !== chrome.runtime.id) {
                    throw new Error(`Not a message from this extension: ${sender.id}`)
                }
                if (!message || typeof message !== 'object') {
                    throw new TypeError(`Expected a message object. Got ${message} (${typeof message})`)
                }
                if (message[RPC_FLAG] !== RPC_FLAG_VAL) {
                    throw new Error(`Incorrect RPC flag: ${message[RPC_FLAG]}`)
                }
                const { serverId, handlerName, params = [] } = message
                if (serverId !== this.id) {
                    throw new Error(`Expected serverId: ${this.id}. Got: ${serverId}`)
                }
                const handlerFn = this._handlers[handlerName]
                if (typeof handlerFn !== 'function') {
                    throw new Error(`Handler not found: ${handlerName}`)
                }
                if (!Array.isArray(params)) {
                    throw new TypeError(`Expected an array of parameters. Got ${params} (${typeof params})`)
                }

                const signature = createSignature(this.constructor.name, this.id, handlerName, ...params)
                console.time(signature)
                callFn(handlerFn, params)
                    .then((value) => sendResponse({ status: FULFILLED, value }))
                    .catch((reason) => sendResponse({ status: REJECTED, reason: reasonToString(reason) }))
                    .finally(() => console.timeEnd(signature))
                console.debug('Received valid message:', JSON.stringify(message, null, 2))
                return true
            } catch (validationError) {
                console.debug('Received invalid message:', validationError)
                return false
            }
        })
    }
}

export class Client {
    serverId = ''

    constructor(serverId, ...handlerNames) {
        if (typeof serverId !== 'string' || serverId.length === 0) {
            throw new TypeError(`Expected a non-empty string for serverId. Got ${serverId} (${typeof serverId})`)
        }
        this.serverId = serverId

        if (handlerNames.length === 0) {
            throw new RangeError(`Expected at least one handler name. Got ${handlerNames.length}`)
        }
        for (const handlerName of handlerNames) {
            if (typeof handlerName !== 'string' || handlerName.length === 0) {
                throw new TypeError(`Expected a non-string handler name. Got ${handlerName} (${typeof handlerName})`)
            }
            this[handlerName] = async (...params) => {
                return await this._invoke(handlerName, ...params)
            }
        }
    }

    async _invoke(handlerName, ...params) {
        if (typeof handlerName !== 'string' || handlerName.length === 0) {
            throw new TypeError(
                `Expected a non-empty string for handlerName. Got ${handlerName} (${typeof handlerName})`,
            )
        }
        const signature = createSignature(this.constructor.name, this.serverId, handlerName, ...params)
        console.debug(`Invoking ${signature}`)

        console.time(signature)
        const result = await chrome.runtime.sendMessage({
            [RPC_FLAG]: RPC_FLAG_VAL,
            serverId: this.serverId,
            handlerName,
            params,
        })
        console.timeEnd(signature)

        if (!result || typeof result !== 'object') {
            new TypeError(`Expected an object for result of ${signature}. Got ${result} (${typeof result})`)
        }

        const { status } = result

        switch (status) {
            case FULFILLED:
                return result.value
            case REJECTED:
                throw new Error(result.reason)
            default:
                throw new TypeError(`Unknown status for ${signature}: ${status}`)
        }
    }
}

async function callFn(fn, params) {
    return await fn(...params)
}

function createSignature(prefix, serverId, handlerName, ...params) {
    return `${prefix} -- ${serverId}::${handlerName}(${params.map((p) => typeof p).join(', ')})`
}

function reasonToString(reason) {
    if (typeof reason === 'object' && reason instanceof Error) {
        return reason.toString()
    }
    return String(reason)
}
