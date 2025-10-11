import { Wrapper, on, query } from './util/dom.js'
import { Estimator } from './util/estimator.js'
import { debounce } from './util/debounce.js'
import { formatDuration } from './util/format.js'
import { Message } from './util/Message.js'
import * as msg from './util/msg.js'

const apiStatus = new Wrapper('api-status')
const btnInit = new Wrapper('init-button')
const btnInitStop = new Wrapper('init-stop-button')
const btnClose = new Wrapper('close-button')
const btnReload = new Wrapper('reload-button')
const btnStopPrompt = new Wrapper('stop-prompt-button')
const btnSubmitPrompt = new Wrapper('submit-prompt-button')
const downloadEta = new Wrapper('download-eta')
const downloadProgress = new Wrapper('download-progress')
const initLoadingAnimation = new Wrapper('init-loading-animation')
const chatLoadingAnimation = new Wrapper('chat-loading-animation')
const optLang = new Wrapper('option-language')
const optStreaming = new Wrapper('option-streaming')
const optSysPrompt = new Wrapper('option-system-prompt')
const optTemp = new Wrapper('option-temperature')
const optTopK = new Wrapper('option-top-k')
const pastChats = new Wrapper('chat-history')
const promptApiInit = new Wrapper('prompt-api-init')
const promptApiUi = new Wrapper('prompt-api-ui')
const promptTokens = new Wrapper('prompt-tokens')
const inputUsageStatus = new Wrapper('input-usage')
const inputQuotaStatus = new Wrapper('input-quota')
const promptInput = new Wrapper('prompt-input')
const tokenPerSecondStatus = new Wrapper('token-per-second')
const durationStatus = new Wrapper('duration')
const statsTimeToFirstToken = new Wrapper('time-to-first-token')
const usageRatio = new Wrapper('usage-ratio')
const sessionEstablished = new Wrapper('session-established')
const chatPlaceholder = new Wrapper('chat-placeholder')
const version = new Wrapper('version')
const downloadStatus = new Wrapper('download-status')

let session
let estimator
let initController
let submitController

function getModelOptions() {
    const language = optLang.val
    return {
        initialPrompts: [msg.system(optSysPrompt.val)],
        temperature: optTemp.val,
        topK: optTopK.val,
        expectedInputs: [{
            type: "text",
            languages: [language, language]
        }],
        expectedOutputs: [{
            type: "text",
            languages: [language]
        }],
    }
}

function monitor(m) {
    on(m, 'downloadprogress', (e) => {
        console.debug('Download Progress', Date.now(), e)
        downloadProgress.val = e.loaded

        if (e.loaded === 1) {
            downloadEta.txt = 'Done!'
            return
        }

        estimator.report(e.loaded)
        try {
            const remainingMs = estimator.remaining
            const remainingStr = formatDuration(remainingMs, optLang.val)
            downloadEta.txt = `ETA: ${remainingStr}`
        } catch (err) {
            downloadEta.txt = String(err)
        }
    })
}

function updateSessionTokens() {
    if (!session) {
        return
    }
    const { inputQuota, inputUsage } = session
    inputUsageStatus.txt = inputUsage
    inputQuotaStatus.txt = inputQuota
    usageRatio.val = inputUsage / inputQuota
}

async function countPromptTokens() {
    if (!session) {
        return
    }
    try {
        const userPrompt = promptInput.val
        console.debug('Counting prompt tokens')
        const promptTokenCount = await session.measureInputUsage(userPrompt, { /* accepts a signal too */ })
        console.debug('Prompt token count:', promptTokenCount)
        promptTokens.txt = promptTokenCount
    } catch (e) {
        console.error('Failed to count prompt tokens:', e)
    }
}

const debouncedCountPromptTokens = debounce(countPromptTokens, 300)

btnInit.click(async () => {
    // Note: no async call can happen in this function until LanguageModel.create() is called or it'll throw!
    if (!navigator.userActivation.isActive) {
        console.log('Not active')
        return
    }

    try {
        const modelOptions = getModelOptions()
        console.log('Initializing session...')
        downloadProgress.val = 0
        downloadEta.txt = 'Initializing...'
        estimator = new Estimator()
        console.debug('Creating session... (may require download)')
        promptApiInit.hide()
        downloadStatus.show()
        initController = new AbortController()
        session = await LanguageModel.create({
            ...modelOptions,
            signal: initController.signal,
            monitor,
        })
        console.debug('Session initialized.')
        initController = null
        on(session, 'quotaoverflow', () => {
            console.warn('Quota overflow')
        })
        updateSessionTokens()
        downloadStatus.hide()
        sessionEstablished.show()
        promptInput.enable().focus()
        debouncedCountPromptTokens()
    } catch (e) {
        console.error('Could not initialize session', e)
        promptApiInit.show()
        downloadStatus.hide()
        sessionEstablished.hide()
        session = null
    }
})

btnInitStop.click(() => {
    if (initController) {
        console.log('Stopping init')
        initController.abort('User stopped init')
    }
    initController = null
})

btnSubmitPrompt.click(async () => {
    console.log('Submitting prompt...')
    try {
        if (!session) {
            throw new Error('No session')
        }
        const userPrompt = promptInput.val
        if (!userPrompt) {
            return
        }
        chatPlaceholder.hide()
        chatLoadingAnimation.show()
        debouncedCountPromptTokens()

        promptInput.val = ''
        promptInput.disable()

        console.debug('Sending prompt')
        const userMessage = new Message('user', userPrompt)
        pastChats.el.appendChild(userMessage.el)

        downloadProgress.val = 0
        downloadEta.txt = ''
        estimator = new Estimator() // This is for download monitoring, which prompt() also supports
        
        submitController = new AbortController()
        btnStopPrompt.show()
        btnSubmitPrompt.hide()
        
        const assistantMessage = new Message('assistant')
        
        pastChats.el.appendChild(assistantMessage.el)
        
        const inputUsageBefore = session.inputUsage
        const startTimestamp = Date.now()
        let firstTokenTimestamp

        if (optStreaming.el.checked) {
            const stream = session.promptStreaming(userPrompt, {
                signal: submitController.signal,
                monitor,
            })
            chatLoadingAnimation.hide()
            for await (const chunk of stream) {
                // console.debug(chunk)
                if (!firstTokenTimestamp) {
                    firstTokenTimestamp = Date.now()
                }
                assistantMessage.content += chunk
            }
        } else {
            assistantMessage.content = await session.prompt(userPrompt, {
                signal: submitController.signal,
                monitor,
            })
            firstTokenTimestamp = Date.now()
        }

        const duration = Date.now() - startTimestamp
        const inputUsageDelta = session.inputUsage - inputUsageBefore
        console.debug('duration', duration, 'inputUsage Delta', inputUsageDelta)
        durationStatus.txt = duration
        
        const timeToFirstToken = firstTokenTimestamp - startTimestamp
        console.debug('timeToFirstToken', timeToFirstToken)
        statsTimeToFirstToken.txt = timeToFirstToken

        const tokenPerSecond = Math.round(1000 * inputUsageDelta / (duration - timeToFirstToken))
        console.debug('tokenPerSecond', tokenPerSecond)
        tokenPerSecondStatus.txt = tokenPerSecond

        updateSessionTokens()
        console.debug('Received response', assistantMessage)
    } catch (e) {
        console.error('Prompt failed:', e)
    }
    submitController = null
    btnStopPrompt.hide()
    btnSubmitPrompt.show()
    chatLoadingAnimation.hide()
    promptInput.focus().enable()
    debouncedCountPromptTokens()
})

btnStopPrompt.click(() => {
    if (submitController) {
        console.debug('Stopping prompt')
        submitController.abort('User stopped prompt')
        submitController = null
    } else {
        console.debug('No abort signal exists')
    }
})

promptInput.on('input', debouncedCountPromptTokens)

on(window, 'error', (e) => {
    console.error('window.error', e)
})

on(window, 'unhandledrejection', (e) => {
    console.error('unhandledrejection', e)
})

btnReload.click(() => {
    console.debug('Reloading...')
    location.reload()
})

btnClose.click(() => {
    window.close()
})

promptInput.on('keydown', (e) => {
    // Submit on Enter, allow newline with Ctrl/Cmd+Enter
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        btnSubmitPrompt.el.click()
    }
})

optSysPrompt.on('keydown', (e) => {
    // Submit on Enter, allow newline with Ctrl/Cmd+Enter
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        btnInit.el.click()
    }
})

query('.chat-placeholder__prompt-suggestions button').forEach((btn) => {
    btn.click(() => {
        promptInput.val = btn.textContent
        promptInput.focus()
    })
})

async function main() {
    const manifestJson = chrome.runtime.getManifest()
    version.txt = manifestJson.version + (manifestJson.update_url ? '' : '*')

    const modelOptions = getModelOptions()
    const availability = await LanguageModel?.availability(modelOptions)
    console.debug('Availability:', availability)

    if (!availability) {
        throw new Error('LanguageModel is not available in your browser.')
    }

    apiStatus.txt = ''

    // Can be "available", "unavailable", "downloadable", "downloading"
    if (availability === 'unavailable') {
        throw new Error('The selection options are not available')
    }

    promptApiUi.show()
    optSysPrompt.focus()

    const params = await LanguageModel.params()
    // maxTemperature
    optTemp.setAttr('max', params.maxTemperature)
    // defaultTemperature
    optTemp.val = params.defaultTemperature
    console.debug(`LanguageModel temperature default: ${params.defaultTemperature}, Max: ${params.maxTemperature}`)
    // maxTopK
    optTopK.setAttr('max', params.maxTopK)
    // defaultTopK
    optTopK.val = params.defaultTopK
    console.debug(`LanguageModel topK default: ${params.defaultTopK}, Max: ${params.maxTopK}`)
}

// Scripts with `type="module"` are deferred by default, so we don't need to
// wait for DOMContentLoaded. The script will execute after the DOM is parsed.
try {
    await main()
} catch (e) {
    apiStatus.txt = String(e)
}