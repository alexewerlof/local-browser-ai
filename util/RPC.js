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
            if (sender?.id !== chrome.runtime.id) {
                console.debug(`Ignoring message from unknown sender: ${sender.id}`)
                return false
            }
            if (!message || typeof message !== 'object') {
                console.debug(`Ignoring non-object message: ${message} (${typeof message})`)
                return false
            }
            const { serverId, handlerName, params, [RPC_FLAG]: rpcFlagValue } = message
            if (serverId !== this.id) {
                console.debug(`Ignoring message not intended for this serverId: ${this.id}. Got: ${serverId}`)
                return false
            }
            if (rpcFlagValue !== RPC_FLAG_VAL) {
                console.debug(`Ignoring message with invalid RPC flag: ${rpcFlagValue}`)
                return false
            }
            console.debug('Received valid message:', JSON.stringify(message, null, 2))
            this.callHandlerAsynchronously(handlerName, params).then(sendResponse)
            return true
        })
    }

    async callHandlerAsynchronously(handlerName, params = []) {
        const signature = createSignature(this.constructor.name, this.id, handlerName, ...params)
        console.time(signature)
        try {
            if (typeof handlerName !== 'string' || handlerName.length === 0) {
                throw new TypeError(
                    `Expected a non-empty string for handlerName, got ${handlerName} (${typeof handlerName})`,
                )
            }

            const handlerFn = this._handlers[handlerName]
            if (typeof handlerFn !== 'function') {
                throw new TypeError(`Invalid handler function ${handlerName} (${typeof handlerFn})`)
            }

            if (!Array.isArray(params)) {
                throw new TypeError(`Expected an array of parameters. Got ${params} (${typeof params})`)
            }

            const value = await handlerFn(...params)
            console.timeEnd(signature)

            return {
                status: FULFILLED,
                value,
            }
        } catch (error) {
            console.timeEnd(signature)

            return {
                status: REJECTED,
                reason: typeof error === 'object' && error instanceof Error ? error.toString() : String(error),
            }
        }
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
                throw new TypeError(
                    `Expected a non-empty string handler name. Got ${handlerName} (${typeof handlerName})`,
                )
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

function createSignature(prefix, serverId, handlerName, ...params) {
    return `${prefix} -- ${serverId}::${handlerName}(${params.map((p) => typeof p).join(', ')})`
}
