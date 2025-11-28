import { Wrapper, on } from './util/Wrapper.js'
import * as RPC from './util/RPC.js'
import { Estimator } from './util/estimator.js'
import { debounce } from './util/debounce.js'
import * as format from './util/format.js'
import * as msg from './util/msg.js'
import {
    defaultSystemPrompt,
    examplePrompts,
    supportedAssistantLanguages,
    supportedSystemLanguages,
    supportedUserLanguages,
    sidePanelStatus,
} from './config.js'
import { ChatMessage } from './components/chat-message.js'
import { ImportedPage } from './components/imported-page.js'
import './components/chat-thread.js'

const backgroundRpc = new RPC.MessageClient('background', 'updateStatus')

const apiStatus = Wrapper.byId('api-status').setText('Loading...')
const systemRequirements = Wrapper.byId('system-requirements')
const btnClone = Wrapper.byId('new-session-button')
const btnInit = Wrapper.byId('init-button')
const btnInitStop = Wrapper.byId('init-stop-button')
const btnReload = Wrapper.byId('reset-button')
const btnStopPrompt = Wrapper.byId('stop-prompt-button')
const btnSubmitPrompt = Wrapper.byId('submit-prompt-button')
const downloadEta = Wrapper.byId('download-eta')
const downloadProgress = Wrapper.byId('download-progress')
const chatLoadingAnimation = Wrapper.byId('chat-loading-animation')
const optSystemLang = Wrapper.byId('option-sys-lang')
const optUserLang = Wrapper.byId('option-user-lang')
const optAssistantLang = Wrapper.byId('option-assistant-lang')
const optStreaming = Wrapper.byId('option-streaming')
const optSysPrompt = Wrapper.byId('option-system-prompt')
const optTemp = Wrapper.byId('option-temperature')
const optTopK = Wrapper.byId('option-top-k')
await customElements.whenDefined('chat-thread')
const chatThread = Wrapper.byId('chat-thread')
const promptApiInit = Wrapper.byId('prompt-api-init')
const promptApiUi = Wrapper.byId('prompt-api-ui')
const promptTokens = Wrapper.byId('prompt-tokens')
const promptInput = Wrapper.byId('prompt-input')
const tokenPerSecondStatus = Wrapper.byId('token-per-second')
const durationStatus = Wrapper.byId('duration')
const promptStats = Wrapper.byId('prompt-stats')
const statsTimeToFirstToken = Wrapper.byId('time-to-first-token')
const statsInferenceDuration = Wrapper.byId('inference-duration')
const usageRatio = Wrapper.byId('usage-ratio')
const sessionEstablished = Wrapper.byId('session-established')
const chatPlaceholder = Wrapper.byId('chat-placeholder')
const version = Wrapper.byId('version')
const downloadStatus = Wrapper.byId('download-status')
const optTempVal = Wrapper.byId('option-temperature-value')
const optTopKVal = Wrapper.byId('option-top-k-value')
const examplePromptsContainer = Wrapper.byId('example-prompts')
const addContextReminder = Wrapper.byId('add-context-reminder')
const addContextWarning = Wrapper.byId('add-context-warning')

optSystemLang.mapAppend(supportedSystemLanguages, ({ value, title }) => {
    return new Wrapper('option').setValue(value).setText(title)
})

optUserLang.mapAppend(supportedUserLanguages, ({ value, title }) => {
    return new Wrapper('option').setValue(value).setText(title)
})

optAssistantLang.mapAppend(supportedAssistantLanguages, ({ value, title }) => {
    return new Wrapper('option').setValue(value).setText(title)
})

examplePromptsContainer.mapAppend(examplePrompts, (prompt) => {
    const newButton = new Wrapper('button').setText(prompt)
    newButton.onClick(() => {
        promptInput.setValue(prompt).focus()
        btnSubmitPrompt.enable()
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
        Wrapper.query('#if-download-is-stuck').hide()
        Wrapper.query('#download-stop-warning').show()
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
                const remainingStr = format.dur(remainingMs)
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
            /* When using schemas, we can pass responseConstraint */
        })
        console.timeEnd('Counting prompt tokens')
        console.debug('Prompt token count:', promptTokenCount)
        promptTokens.setText(format.num(promptTokenCount))
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
        btnReload.show()
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
        await backgroundRpc.updateStatus(sidePanelStatus.INITIALIZED)
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
        chatPlaceholder.hide()
        chatLoadingAnimation.show()
        debouncedCountPromptTokens()

        promptInput.setValue('').disable()
        btnSubmitPrompt.disable()

        console.debug('Sending prompt...')
        const userMessage = new ChatMessage()
        userMessage.role = 'user'
        userMessage.content = userPrompt

        const promptToSend = await chatThread.el.addContext(userPrompt)
        console.log('promptToSend', promptToSend)

        userMessage.tokenCount = await session.measureInputUsage(userPrompt)
        chatThread.el.appendChatMessage(userMessage)

        // TODO: we are not in that view anymore
        downloadProgress.setValue(0)
        downloadEta.setText('')
        estimator = new Estimator() // This is for download monitoring, which prompt() also supports

        submitController = new AbortController()
        btnStopPrompt.show()
        btnSubmitPrompt.hide()

        const assistantMessage = new ChatMessage()
        assistantMessage.role = 'assistant'

        chatThread.el.appendChatMessage(assistantMessage)

        const inputUsageBefore = session.inputUsage
        let firstTokenTimestamp

        const isStreaming = optStreaming.el.checked
        console.debug('Streaming:', isStreaming)

        promptStats.hide()
        const startTimestamp = Date.now()
        if (isStreaming) {
            const stream = session.promptStreaming(promptToSend, {
                signal: submitController.signal,
                monitor,
            })
            for await (const chunk of stream) {
                // console.debug(chunk)
                if (!firstTokenTimestamp) {
                    firstTokenTimestamp = Date.now()
                }
                assistantMessage.content += chunk
                assistantMessage.scrollIntoView({ behavior: 'instant' })
            }
        } else {
            assistantMessage.content = await session.prompt(promptToSend, {
                signal: submitController.signal,
                monitor,
            })
        }
        const endTimestamp = Date.now()

        userMessage.scrollIntoView({ block: 'start' })

        const inputUsageDelta = session.inputUsage - inputUsageBefore
        assistantMessage.tokenCount = inputUsageDelta

        const totDuration = endTimestamp - startTimestamp
        durationStatus.setText(format.num(totDuration))

        const timeToFirstToken = isStreaming ? firstTokenTimestamp - startTimestamp : totDuration
        console.debug('timeToFirstToken', timeToFirstToken)
        statsTimeToFirstToken.setText(format.num(timeToFirstToken))

        const inferenceDuration = isStreaming ? endTimestamp - firstTokenTimestamp : totDuration
        console.debug('Inference Duration', inferenceDuration)
        statsInferenceDuration.setText(format.num(inferenceDuration))

        const tokenPerSecond = Math.round((1000 * inputUsageDelta) / inferenceDuration)
        console.debug('tokenPerSecond', tokenPerSecond)
        tokenPerSecondStatus.setText(format.num(tokenPerSecond))
        promptStats.show()

        updateSessionTokens()
        console.debug('Received response', assistantMessage.toJSON())
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

new RPC.MessageServer('side-panel', {
    async addSelection(message) {
        if (!session) {
            throw new Error(`No session initialized to append: "${message}"`)
        }
        try {
            const { title, favIconUrl, url, selectionText } = message
            const chatMessage = new ChatMessage()
            chatMessage.role = 'user'
            chatMessage.content = `Selection from [${title}](${url})`
            chatMessage.context = selectionText
            chatMessage.favicon = favIconUrl

            const inputUsageBefore = session.inputUsage
            console.time('session.append()')
            await session.append([chatMessage.toJSON()])
            console.timeEnd('session.append()')
            chatMessage.tokenCount = session.inputUsage - inputUsageBefore
            chatThread.el.appendChatMessage(chatMessage)
            updateSessionTokens()
            console.log('Appended selection successfully')
            addContextReminder.hide()
            addContextWarning.show()
        } catch (error) {
            if (error instanceof QuotaExceededError) {
                alert('Too much text! Add smaller bits.')
            }
            console.log(error)
        }
    },

    async addPage(message) {
        if (!session) {
            throw new Error(`No session initialized to append page`)
        }
        try {
            const { html, url, title, favIconUrl } = message
            const importedPage = new ImportedPage()

            importedPage.url = url
            importedPage.title = title
            importedPage.favicon = favIconUrl
            importedPage.pageHtml = html

            await chatThread.el.appendImportedPage(importedPage)
            console.log(`Appended page successfully: ${url}`)
            addContextReminder.hide()
            addContextWarning.show()
        } catch (error) {
            console.error('Error appending page:', error)
        }
    },
})

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
    chatThread.empty()
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
    await backgroundRpc.updateStatus(sidePanelStatus.STARTED)
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

    apiStatus.setText('LanguageModel is supported in your browser.')

    console.debug('Availability:', availability)

    if (!availability) {
        throw new Error('LanguageModel is not supported in your browser.')
    }

    // Can be "available", "unavailable", "downloadable", "downloading"
    switch (availability) {
        case 'unavailable':
            throw new Error('The selected options are not supported')
        case 'downloadable':
            Wrapper.query('#init-download-warning').show()
            break
        case 'downloading':
            downloadStatus.show()
            break
        default:
            break
    }

    promptApiUi.show()
    await chatThread.el.initRAG()
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
    await backgroundRpc.updateStatus(sidePanelStatus.AWAITING_INIT)
}

// Scripts with `type="module"` are deferred by default, so we don't need to
// wait for DOMContentLoaded. The script will execute after the DOM is parsed.
try {
    await main()
    apiStatus.hide()
    systemRequirements.hide()
} catch (e) {
    apiStatus.show().setText(`Error: ${e}`)
    console.error(e)
    systemRequirements.show()
}
