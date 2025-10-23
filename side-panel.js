import { Wrapper, createWrapperByTag, on } from './util/dom.js'
import { Estimator } from './util/estimator.js'
import { debounce } from './util/debounce.js'
import { formatDuration } from './util/format.js'
import * as msg from './util/msg.js'
import { Message } from './util/Message.js'
import { ImportedContent } from './util/ImportedContent.js'
import {
    defaultSystemPrompt,
    examplePrompts,
    sidePanelPortName,
    supportedAssistantLanguages,
    supportedSystemLanguages,
    supportedUserLanguages,
} from './config.js'

const apiStatus = new Wrapper('api-status')
const btnClone = new Wrapper('new-session-button')
const btnInit = new Wrapper('init-button')
const btnInitStop = new Wrapper('init-stop-button')
const btnClose = new Wrapper('close-button')
const btnReload = new Wrapper('reload-button')
const btnStopPrompt = new Wrapper('stop-prompt-button')
const btnSubmitPrompt = new Wrapper('submit-prompt-button')
const downloadEta = new Wrapper('download-eta')
const downloadProgress = new Wrapper('download-progress')
const chatLoadingAnimation = new Wrapper('chat-loading-animation')
const optSystemLang = new Wrapper('option-sys-lang')
const optUserLang = new Wrapper('option-user-lang')
const optAssistantLang = new Wrapper('option-assistant-lang')
const optStreaming = new Wrapper('option-streaming')
const optSysPrompt = new Wrapper('option-system-prompt')
const optTemp = new Wrapper('option-temperature')
const optTopK = new Wrapper('option-top-k')
const pastChats = new Wrapper('chat-history')
const promptApiInit = new Wrapper('prompt-api-init')
const promptApiUi = new Wrapper('prompt-api-ui')
const promptTokens = new Wrapper('prompt-tokens')
const promptInput = new Wrapper('prompt-input')
const tokenPerSecondStatus = new Wrapper('token-per-second')
const durationStatus = new Wrapper('duration')
const promptStats = new Wrapper('prompt-stats')
const statsTimeToFirstToken = new Wrapper('time-to-first-token')
const statsInferenceDuration = new Wrapper('inference-duration')
const usageRatio = new Wrapper('usage-ratio')
const sessionEstablished = new Wrapper('session-established')
const chatPlaceholder = new Wrapper('chat-placeholder')
const version = new Wrapper('version')
const downloadStatus = new Wrapper('download-status')
const optTempVal = new Wrapper('option-temperature-value')
const optTopKVal = new Wrapper('option-top-k-value')
const examplePromptsContainer = new Wrapper('example-prompts')

optSystemLang.mapAppend(supportedSystemLanguages, ({ value, title }) => {
    return createWrapperByTag('option').setValue(value).setText(title)
})

optUserLang.mapAppend(supportedUserLanguages, ({ value, title }) => {
    return createWrapperByTag('option').setValue(value).setText(title)
})

optAssistantLang.mapAppend(supportedAssistantLanguages, ({ value, title }) => {
    return createWrapperByTag('option').setValue(value).setText(title)
})

examplePromptsContainer.mapAppend(examplePrompts, (prompt) => {
    const newButton = createWrapperByTag('button').setText(prompt)
    newButton.onClick(() => {
        promptInput.setValue(prompt).focus()
        debouncedCountPromptTokens()
    })
    return newButton
})

function updateTempSlider() {
    optTempVal.setText(optTemp.getValue())
}
function updateTopKSlider() {
    optTopKVal.setText(optTopK.getValue())
}
optTemp.on('input', updateTempSlider)
optTopK.on('input', updateTopKSlider)

optSysPrompt.setValue(defaultSystemPrompt)
promptInput.setValue(examplePrompts[0])

let session
let estimator
let initController
let submitController

function getModelOptions() {
    return {
        initialPrompts: [msg.system(optSysPrompt.getValue())],
        temperature: optTemp.getValue(),
        topK: optTopK.getValue(),
        expectedInputs: [
            {
                type: 'text',
                languages: [optSystemLang.getValue(), optUserLang.getValue()],
            },
        ],
        expectedOutputs: [
            {
                type: 'text',
                languages: [optAssistantLang.getValue()],
            },
        ],
    }
}

function monitor(m) {
    on(m, 'downloadprogress', (e) => {
        console.debug('Download Progress', Date.now(), e)
        downloadProgress.setValue(e.loaded)

        if (e.loaded === 1) {
            downloadEta.setText('Done!')
            return
        }

        estimator.report(e.loaded)
        if (estimator.isReady) {
            try {
                const remainingMs = estimator.remaining
                const remainingStr = formatDuration(remainingMs, optSystemLang.getValue())
                downloadEta.setText(`ETA: ${remainingStr}`)
            } catch (err) {
                downloadEta.setText(String(err))
            }
        }
    })
}

function updateSessionTokens() {
    if (!session) {
        return
    }
    const { inputQuota, inputUsage } = session
    usageRatio.setValue(inputUsage / inputQuota)
    const remainingPercent = Math.round((100 * (inputQuota - inputUsage)) / inputQuota)
    usageRatio.setAttr('title', `Used: ${inputUsage} of ${inputQuota} tokens. Remaining: ${remainingPercent}%`)
}

async function countPromptTokens() {
    if (!session) {
        return
    }
    try {
        const userPrompt = promptInput.getValue()
        console.time('Counting prompt tokens')
        const promptTokenCount = await session.measureInputUsage(userPrompt, {
            /* accepts a signal too */
        })
        console.timeEnd('Counting prompt tokens')
        console.debug('Prompt token count:', promptTokenCount)
        promptTokens.setText(promptTokenCount)
    } catch (e) {
        console.error('Failed to count prompt tokens:', e)
    }
}

const debouncedCountPromptTokens = debounce(countPromptTokens, 300)

btnInit.onClick(async () => {
    // Note: no async call can happen in this function until LanguageModel.create() is called or it'll throw!
    if (!navigator.userActivation.isActive) {
        console.log('Not active')
        return
    }

    try {
        const modelOptions = getModelOptions()
        console.log('Initializing session...')
        downloadProgress.setValue(0)
        downloadEta.setText('Initializing...')
        estimator = new Estimator()
        console.debug('Creating session... (may require download)')
        promptApiInit.hide()
        downloadStatus.show()
        initController = new AbortController()
        console.time('LanguageModel.create()')
        session = await LanguageModel.create({
            ...modelOptions,
            signal: initController.signal,
            monitor,
        })
        console.timeEnd('LanguageModel.create()')
        console.debug('Session initialized.')
        initController = null
        on(session, 'quotaoverflow', () => {
            console.warn('Quota overflow')
        })
        const port = chrome.runtime.connect({ name: sidePanelPortName })
        console.debug('Established communication port')
        // Notify the background script that the side panel is ready.
        port.postMessage({ command: 'side-panel-ready' })
        port.onMessage.addListener(onPortMessage)

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

btnInitStop.onClick(() => {
    if (initController) {
        console.log('Stopping init')
        initController.abort('User stopped init')
    }
    initController = null
})

btnSubmitPrompt.onClick(async () => {
    try {
        if (!session) {
            throw new Error('No session')
        }
        const userPrompt = promptInput.getValue()
        if (!userPrompt.trim()) {
            return
        }
        console.log('Submitting prompt...')
        chatPlaceholder.hide()
        chatLoadingAnimation.show()
        debouncedCountPromptTokens()

        promptInput.setValue('').disable()
        btnSubmitPrompt.disable()

        console.debug('Sending prompt')
        const userMessage = new Message('user', userPrompt)
        pastChats.append(userMessage)
        userMessage.el.scrollIntoView()

        downloadProgress.setValue(0)
        downloadEta.setText('')
        estimator = new Estimator() // This is for download monitoring, which prompt() also supports

        submitController = new AbortController()
        btnStopPrompt.show()
        btnSubmitPrompt.hide()

        const assistantMessage = new Message('assistant')

        pastChats.append(assistantMessage)

        const inputUsageBefore = session.inputUsage
        let firstTokenTimestamp

        const isStreaming = optStreaming.el.checked
        console.debug('Streaming:', isStreaming)

        promptStats.hide()
        const startTimestamp = Date.now()
        if (isStreaming) {
            const stream = session.promptStreaming(userPrompt, {
                signal: submitController.signal,
                monitor,
            })
            for await (const chunk of stream) {
                // console.debug(chunk)
                if (!firstTokenTimestamp) {
                    firstTokenTimestamp = Date.now()
                }
                assistantMessage.content += chunk
                assistantMessage.el.scrollIntoView({ behavior: 'instant' })
            }
        } else {
            assistantMessage.content = await session.prompt(userPrompt, {
                signal: submitController.signal,
                monitor,
            })
        }
        const endTimestamp = Date.now()

        userMessage.el.scrollIntoView({ block: 'start' })

        const inputUsageDelta = session.inputUsage - inputUsageBefore

        const totDuration = endTimestamp - startTimestamp
        durationStatus.setText(totDuration)

        const timeToFirstToken = isStreaming ? firstTokenTimestamp - startTimestamp : totDuration
        console.debug('timeToFirstToken', timeToFirstToken)
        statsTimeToFirstToken.setText(timeToFirstToken)

        const inferenceDuration = isStreaming ? endTimestamp - firstTokenTimestamp : totDuration
        console.debug('Inference Duration', inferenceDuration)
        statsInferenceDuration.setText(inferenceDuration)

        const tokenPerSecond = Math.round((1000 * inputUsageDelta) / inferenceDuration)
        console.debug('tokenPerSecond', tokenPerSecond)
        tokenPerSecondStatus.setText(tokenPerSecond)
        promptStats.show()

        updateSessionTokens()
        console.debug('Received response', assistantMessage)
        btnClone.show()
    } catch (e) {
        console.error('Prompt failed:', e)
    }
    submitController = null
    btnStopPrompt.hide()
    btnSubmitPrompt.show()
    chatLoadingAnimation.hide()
    promptInput.enable().focus()
    debouncedCountPromptTokens()
})

async function onPortMessage(message) {
    console.debug('Received message from port:', JSON.stringify(message, null, 2))
    if (message.command !== 'add') {
        console.log('Unknown command:', message.command)
        return
    }
    if (!session) {
        console.log(`No session to append: "${message}"`)
        return
    }
    try {
        const importedContent = new ImportedContent(message)
        const inputUsageBefore = session.inputUsage
        console.time('session.append()')
        await session.append([importedContent.toJSON()])
        console.timeEnd('session.append()')
        importedContent.tokenCount = session.inputUsage - inputUsageBefore
        pastChats.append(importedContent)
        importedContent.el.scrollIntoView()
        updateSessionTokens()
        console.log('Appended message successfully')
    } catch (error) {
        if (error instanceof QuotaExceededError) {
            alert('Too much text! Add smaller bits.')
        }
        console.log(error)
    }
}

btnStopPrompt.onClick(() => {
    if (submitController) {
        console.debug('Stopping prompt')
        submitController.abort('User stopped prompt')
        submitController = null
        btnClone.show()
    } else {
        console.debug('No abort signal exists')
    }
})

btnClone.onClick(async () => {
    console.debug('New session')
    btnClone.disable()
    console.time('Session Clone')
    session = await session.clone()
    console.timeEnd('Session Clone')
    btnClone.hide()
    promptStats.hide()
    pastChats.empty()
    updateSessionTokens()
    promptInput.focus().setValue('')
    debouncedCountPromptTokens()
    chatPlaceholder.show()
    btnClone.enable()
})

promptInput.on('input', () => {
    if (promptInput.getValue().trim()) {
        btnSubmitPrompt.enable()
    } else {
        btnSubmitPrompt.disable()
    }
    debouncedCountPromptTokens()
})

on(window, 'error', (e) => {
    console.error('window.error', e)
})

on(window, 'unhandledrejection', (e) => {
    console.error('unhandledrejection', e)
})

btnReload.onClick(() => {
    console.debug('Reloading...')
    location.reload()
})

btnClose.onClick(() => {
    window.close()
})

promptInput.on('keydown', (e) => {
    // Submit on Enter, allow newline with Ctrl/Cmd+Enter
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        btnSubmitPrompt.click()
    }
})

optSysPrompt.on('keydown', (e) => {
    // Submit on Enter, allow newline with Ctrl/Cmd+Enter
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        btnInit.click()
    }
})

async function main() {
    const manifestJson = chrome.runtime.getManifest()
    const localIndicator = 'update_url' in manifestJson ? '' : '*'
    version.setText(manifestJson.version + localIndicator)

    if (typeof globalThis.LanguageModel !== 'function') {
        return `LanguageModel is not supported in this environment.`
    }

    const modelOptions = getModelOptions()
    console.time('LanguageModel.availability()')
    const availability = await LanguageModel?.availability(modelOptions)
    console.timeEnd('LanguageModel.availability()')
    console.debug('Availability:', availability)

    if (!availability) {
        throw new Error('LanguageModel is not supported in your browser.')
    }

    apiStatus.hide().setText('LanguageModel is supported in your browser.')

    // Can be "available", "unavailable", "downloadable", "downloading"
    if (availability === 'unavailable') {
        throw new Error('The selected options are not supported')
    }

    promptApiUi.show()
    optSysPrompt.focus()

    const params = await LanguageModel.params()
    console.debug(`\tTemperature: default = ${params.defaultTemperature}, max = ${params.maxTemperature}`)
    console.debug(`\tTopK: default = ${params.defaultTopK}, max = ${params.maxTopK}`)

    // maxTemperature
    optTemp.setAttr('max', params.maxTemperature)
    // defaultTemperature
    optTemp.setValue(params.defaultTemperature)
    updateTempSlider()
    // maxTopK
    optTopK.setAttr('max', params.maxTopK)
    // defaultTopK
    optTopK.setValue(params.defaultTopK)
    updateTopKSlider()
    return ''
}

// Scripts with `type="module"` are deferred by default, so we don't need to
// wait for DOMContentLoaded. The script will execute after the DOM is parsed.
try {
    apiStatus.setText(await main())
} catch (e) {
    apiStatus.show().setText(`Error: ${e}`)
    console.error(e)
}
