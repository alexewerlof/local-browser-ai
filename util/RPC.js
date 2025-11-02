const FULFILLED = 'fulfilled'
const REJECTED = 'rejected'
const RPC_FLAG = '__rpc__'
const RPC_FLAG_VAL = 'com.alexewerlof.rpc'

function createSignature(prefix, targetId, handlerName, ...params) {
    return `${prefix} -- ${targetId}::${handlerName}(${params.map((p) => typeof p).join(', ')})`
}

class Client {
    _targetId

    constructor(targetId, ...remoteFunctionNames) {
        if (typeof targetId !== 'string' || targetId.length === 0) {
            throw new TypeError(`Invalid targetId: ${targetId} (${typeof targetId})`)
        }
        this._targetId = targetId

        if (remoteFunctionNames.length === 0) {
            throw new RangeError(`Expected at least one remote function name. Got ${remoteFunctionNames.length}`)
        }

        for (const remoteFunction of remoteFunctionNames) {
            this.addRemoteFunction(remoteFunction)
        }
    }

    addRemoteFunction(remoteFunctionName) {
        if (typeof remoteFunctionName !== 'string' || remoteFunctionName.length === 0) {
            throw new TypeError(`Invalid handler name: ${remoteFunctionName} (${typeof remoteFunctionName})`)
        }
        if (this.hasRemoteFunction(remoteFunctionName)) {
            throw new Error(`Handler ${remoteFunctionName} already exists`)
        }
        this[remoteFunctionName] = async (...params) => {
            return await this._invoke(remoteFunctionName, ...params)
        }
    }

    get targetId() {
        return this._targetId
    }

    hasRemoteFunction(remoteFunctionName) {
        return typeof this[remoteFunctionName] === 'function'
    }

    createCallMessage(handlerName, params = [], uuid = crypto.randomUUID()) {
        return {
            [RPC_FLAG]: RPC_FLAG_VAL,
            targetId: this.targetId,
            uuid,
            handlerName,
            params,
        }
    }
}

class Server {
    _handlers = Object.create(null)
    id = ''

    constructor(id, handlers = {}) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new TypeError(`Expected a non-empty string for id. Got ${id} (${typeof id})`)
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
    }

    getHandlerNames() {
        return Object.keys(this._handlers)
    }

    async _callHandlerAsynchronously(handlerName, params = []) {
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
            const reason = typeof error === 'object' && error instanceof Error ? error.toString() : String(error)
            return {
                status: REJECTED,
                reason,
            }
        }
    }

    parseCallMessage(message) {
        if (!message || typeof message !== 'object') {
            throw new TypeError(`Non-object message: ${message} (${typeof message})`)
        }
        const { [RPC_FLAG]: rpcFlagValue, uuid, targetId, handlerName, params = [] } = message
        if (targetId !== this.id) {
            throw new Error(`Not intended for this id: ${this.id}. Got: ${targetId}`)
        }
        if (rpcFlagValue !== RPC_FLAG_VAL) {
            throw new Error(`Invalid RPC flag: ${rpcFlagValue}`)
        }
        if (typeof uuid !== 'string' || uuid.length === 0) {
            throw new TypeError(`Expected a non-empty string for uuid. Got ${uuid} (${typeof uuid})`)
        }
        if (typeof handlerName !== 'string' || handlerName.length === 0) {
            throw new TypeError(
                `Expected a non-empty string for handlerName, got ${handlerName} (${typeof handlerName})`,
            )
        }
        if (!Array.isArray(params)) {
            throw new TypeError(`Expected an array of parameters. Got ${params} (${typeof params})`)
        }
        return { handlerName, params }
    }
}

export class MessageClient extends Client {
    constructor(targetId, ...handlerNames) {
        super(targetId, ...handlerNames)
    }

    async _invoke(handlerName, ...params) {
        const signature = createSignature(this.constructor.name, this.targetId, handlerName, ...params)
        console.debug(`Invoking ${signature}`)

        console.time(signature)
        const result = await chrome.runtime.sendMessage(this.createCallMessage(handlerName, params))
        console.timeEnd(signature)

        if (!result || typeof result !== 'object') {
            throw new TypeError(`Expected an object for result of ${signature}. Got ${result} (${typeof result})`)
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

export class MessageServer extends Server {
    ports = new Set()

    constructor(id, handlers = {}) {
        super(id, handlers)
        this.listen()
    }

    listen() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // Note: no async calls before this point, or the return true will not work
            try {
                if (sender?.id !== chrome.runtime.id) {
                    throw new Error(`Unknown sender: ${sender.id}`)
                }
                const { handlerName, params } = this.parseCallMessage(message)
                console.debug('Received valid message:', JSON.stringify(message, null, 2))
                this._callHandlerAsynchronously(handlerName, params).then(sendResponse)
                return true
            } catch (error) {
                console.debug('Ignoring message', error) // We can't send a response if we can't parse the message to get the UUID.
                // But if it was an RPC message, it was malformed.
                if (message?.[RPC_FLAG] === RPC_FLAG_VAL) {
                    sendResponse({ status: REJECTED, reason: `Malformed RPC message: ${error}` })
                    return true
                }
                return false // Not an RPC message for us
            }
        })
    }
}

export class PortClient extends Client {
    _port = null
    _pendingPromises = new Map()
    _timeoutMs = 30000 // 30 seconds

    constructor(targetId, ...handlerNames) {
        super(targetId, ...handlerNames)
    }

    async connect() {
        if (this._port) {
            throw new Error('Already connected')
        }

        this._port = await chrome.runtime.connect({ name: this.targetId })
        this._port.onMessage.addListener((msg) => {
            this._onMessageListener(msg)
        })
    }

    disconnect() {
        if (this._port) {
            this._port.disconnect()
            this._port = null
            this._pendingPromises.forEach(({ reject }) => reject(new Error('Client disconnected')))
            this._pendingPromises.clear()
        }
    }

    _invoke(handlerName, ...params) {
        if (!this._port) {
            throw new Error('Not connected')
        }
        const callMessage = this.createCallMessage(handlerName, params)
        const { uuid } = callMessage
        const promise = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this._pendingPromises.delete(uuid)
                reject(new Error(`RPC call '${handlerName}' timed out after ${this._timeoutMs}ms`))
            }, this._timeoutMs)

            this._pendingPromises.set(uuid, {
                resolve: (value) => {
                    clearTimeout(timeoutId)
                    resolve(value)
                },
                reject: (reason) => {
                    clearTimeout(timeoutId)
                    reject(reason)
                },
            })
        })
        this._port.postMessage(callMessage)
        return promise
    }

    _onMessageListener(msg) {
        try {
            const { uuid, result } = msg
            const re = this._pendingPromises.get(uuid)
            if (!re) {
                throw new RangeError(`Unknown uuid: ${uuid}`)
            }
            const { resolve, reject } = re
            this._pendingPromises.delete(uuid)

            switch (result.status) {
                case FULFILLED:
                    return resolve(result.value)
                case REJECTED:
                    return reject(new Error(result.reason))
                default:
                    throw new TypeError(`Unknown status: ${result.status} (${typeof result.status})`)
            }
        } catch (error) {
            if (msg?.uuid && this._pendingPromises.has(msg.uuid)) {
                this._pendingPromises.get(msg.uuid).reject(error)
                this._pendingPromises.delete(msg.uuid)
            }
            console.error(`Failed to process received message ${JSON.stringify(msg)}: ${error}`)
        }
    }
}

export class PortServer extends Server {
    ports = new Set()

    constructor(id, handlers = {}) {
        super(id, handlers)
        this.listen()
    }

    listen() {
        chrome.runtime.onConnect.addListener((port) => {
            if (port.name !== this.id) {
                port.disconnect()
                return
            }
            port.onDisconnect.addListener((port) => {
                this.ports.delete(port)
            })
            this.ports.add(port)
            port.onMessage.addListener((message, port) => {
                const { uuid, handlerName, params } = this.parseCallMessage(message)
                console.debug('Received valid message:', JSON.stringify(message, null, 2))
                this._callHandlerAsynchronously(handlerName, params).then((result) => {
                    const response = this._createResponseMessage(result, uuid)
                    try {
                        port.postMessage(response)
                    } catch (error) {
                        console.error(`Could not send response to message ${JSON.stringify(response)}: ${error}`)
                    }
                })
                try {
                    const { uuid, handlerName, params } = this.parseCallMessage(message)
                    console.debug('Received valid message:', JSON.stringify(message, null, 2))
                    this._callHandlerAsynchronously(handlerName, params).then((result) => {
                        const response = this._createResponseMessage(result, uuid)
                        try {
                            port.postMessage(response)
                        } catch (error) {
                            console.error(`Could not send response to message ${JSON.stringify(response)}: ${error}`)
                        }
                    })
                } catch (error) {
                    console.error(`Failed to process received message ${JSON.stringify(message)}: ${error}`)
                    // Cannot send a response if we can't parse the message to get the UUID.
                }
            })
        })
    }

    _createResponseMessage(result, uuid) {
        return {
            [RPC_FLAG]: RPC_FLAG_VAL,
            uuid,
            result,
        }
    }
}
