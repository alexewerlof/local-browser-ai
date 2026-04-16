import { JJHE, JJET, JJD } from './vendor/jj.js'
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
const h = JJHE.tree
const jjDoc = JJD.from(document)

const jjApiStatus = jjDoc.find('#api-status', true).setText('Loading...')
const jjSystemRequirements = jjDoc.find('#system-requirements', true)
const jjBtnClone = jjDoc.find('#new-session-button', true)
const jjBtnInit = jjDoc.find('#init-button', true)
const jjBtnInitStop = jjDoc.find('#init-stop-button', true)
const jjBtnReload = jjDoc.find('#reset-button', true)
const jjBtnStopPrompt = jjDoc.find('#stop-prompt-button', true)
const jjBtnSubmitPrompt = jjDoc.find('#submit-prompt-button', true)
const jjDownloadEta = jjDoc.find('#download-eta', true)
const jjDownloadProgress = jjDoc.find('#download-progress', true)
const jjChatLoadingAnimation = jjDoc.find('#chat-loading-animation', true)
const jjOptSystemLang = jjDoc.find('#option-sys-lang', true)
const jjOptUserLang = jjDoc.find('#option-user-lang', true)
const jjOptAssistantLang = jjDoc.find('#option-assistant-lang', true)
const jjOptStreaming = jjDoc.find('#option-streaming', true)
const jjOptSysPrompt = jjDoc.find('#option-system-prompt', true)
const jjOptTemp = jjDoc.find('#option-temperature', true)
const jjOptTopK = jjDoc.find('#option-top-k', true)
await customElements.whenDefined('chat-thread')
const jjChatThread = jjDoc.find('#chat-thread', true)
const jjPromptApiInit = jjDoc.find('#prompt-api-init', true)
const jjPromptTokens = jjDoc.find('#prompt-tokens', true)
const jjPromptInput = jjDoc.find('#prompt-input', true)
const jjTokenPerSecondStatus = jjDoc.find('#token-per-second', true)
const jjDurationStatus = jjDoc.find('#duration', true)
const jjPromptStats = jjDoc.find('#prompt-stats', true)
const jjStatsTimeToFirstToken = jjDoc.find('#time-to-first-token', true)
const jjStatsInferenceDuration = jjDoc.find('#inference-duration', true)
const jjUsageRatio = jjDoc.find('#usage-ratio', true)
const jjSessionEstablished = jjDoc.find('#session-established', true)
const jjChatPlaceholder = jjDoc.find('#chat-placeholder', true)
const jjVersion = jjDoc.find('#version', true)
const jjDownloadStatus = jjDoc.find('#download-status', true)
const jjOptTempVal = jjDoc.find('#option-temperature-value', true)
const jjOptTopKVal = jjDoc.find('#option-top-k-value', true)
const jjExamplePromptsContainer = jjDoc.find('#example-prompts', true)
const jjAddContextReminder = jjDoc.find('#add-context-reminder', true)
const jjAddContextWarning = jjDoc.find('#add-context-warning', true)

jjOptSystemLang.addChildMap(supportedSystemLanguages, ({ value, title }) => h('option', { value }, title))

jjOptUserLang.addChildMap(supportedUserLanguages, ({ value, title }) => h('option', { value }, title))

jjOptAssistantLang.addChildMap(supportedAssistantLanguages, ({ value, title }) => h('option', { value }, title))

jjExamplePromptsContainer.addChildMap(
    examplePrompts,
    (prompt) => h('button', null, prompt).on('click', () => {
        jjPromptInput.setValue(prompt).focus()
        jjBtnSubmitPrompt.enable()
        debouncedCountPromptTokens()
    })
)

function updateTempSlider() {
    jjOptTempVal.setText(jjOptTemp.getValue())
}
function updateTopKSlider() {
    jjOptTopKVal.setText(jjOptTopK.getValue())
}
jjOptTemp.on('input', updateTempSlider)
jjOptTopK.on('input', updateTopKSlider)

jjOptSysPrompt.setValue(defaultSystemPrompt)

let session
let estimator
let initController
let submitController

function getModelOptions() {
    return {
        initialPrompts: [msg.system(jjOptSysPrompt.getValue())],
        temperature: jjOptTemp.getValue(),
        topK: jjOptTopK.getValue(),
        expectedInputs: [
            {
                type: 'text',
                languages: [jjOptSystemLang.getValue(), jjOptUserLang.getValue()],
            },
        ],
        expectedOutputs: [
            {
                type: 'text',
                languages: [jjOptAssistantLang.getValue()],
            },
        ],
    }
}

function monitor(m) {
    JJET.from(m).on('downloadprogress', (e) => {
        jjDoc.find('#if-download-is-stuck', true).hide()
        jjDoc.find('#download-stop-warning', true).show()
        console.debug('Download Progress', Date.now(), e)
        jjDownloadProgress.setValue(e.loaded)

        if (e.loaded === 1) {
            jjDownloadEta.setText('Done!')
            return
        }

        estimator.report(e.loaded)
        if (estimator.isReady) {
            try {
                const remainingMs = estimator.remaining
                const remainingStr = format.dur(remainingMs)
                jjDownloadEta.setText(`ETA: ${remainingStr}`)
            } catch (err) {
                jjDownloadEta.setText(String(err))
            }
        }
    })
}

function updateSessionTokens() {
    if (!session) {
        return
    }
    const { inputQuota, inputUsage } = session
    jjUsageRatio.setValue(inputUsage / inputQuota)
    const remainingPercent = Math.round((100 * (inputQuota - inputUsage)) / inputQuota)
    jjUsageRatio.setAttr('title', `Used: ${inputUsage} of ${inputQuota} tokens. Remaining: ${remainingPercent}%`)
}

async function countPromptTokens() {
    if (!session) {
        return
    }
    try {
        const userPrompt = jjPromptInput.getValue()
        console.time('Counting prompt tokens')
        const promptTokenCount = await session.measureInputUsage(userPrompt, {
            /* accepts a signal too */
            /* When using schemas, we can pass responseConstraint */
        })
        console.timeEnd('Counting prompt tokens')
        console.debug('Prompt token count:', promptTokenCount)
        jjPromptTokens.setText(format.num(promptTokenCount))
    } catch (e) {
        console.error('Failed to count prompt tokens:', e)
    }
}

const debouncedCountPromptTokens = debounce(countPromptTokens, 300)

jjBtnInit.on('click', async () => {
    // Note: no async call can happen in this function until LanguageModel.create() is called or it'll throw!
    if (!navigator.userActivation.isActive) {
        console.log('Not active')
        return
    }

    try {
        jjBtnReload.show()
        const modelOptions = getModelOptions()
        console.log('Initializing session...')
        jjDownloadProgress.setValue(0)
        jjDownloadEta.setText('Initializing...')
        estimator = new Estimator()
        console.debug('Creating session... (may require download)')
        jjPromptApiInit.hide()
        jjDownloadStatus.show()
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
        JJET.from(session).on('quotaoverflow', () => {
            console.warn('Quota overflow')
        })
        await backgroundRpc.updateStatus(sidePanelStatus.INITIALIZED)
        updateSessionTokens()
        jjDownloadStatus.hide()
        jjSessionEstablished.show()
        jjPromptInput.enable().focus()
        debouncedCountPromptTokens()
    } catch (e) {
        console.error('Could not initialize session', e)
        jjPromptApiInit.show()
        jjDownloadStatus.hide()
        jjSessionEstablished.hide()
        session = null
    }
})

jjBtnInitStop.on('click', () => {
    if (initController) {
        console.log('Stopping init')
        initController.abort('User stopped init')
    }
    initController = null
})

jjBtnSubmitPrompt.on('click', async () => {
    try {
        if (!session) {
            throw new Error('No session')
        }
        const userPrompt = jjPromptInput.getValue()
        if (!userPrompt.trim()) {
            return
        }
        jjChatPlaceholder.hide()
        jjChatLoadingAnimation.show()
        debouncedCountPromptTokens()

        jjPromptInput.setValue('').disable()
        jjBtnSubmitPrompt.disable()

        console.debug('Sending prompt...')
        const userMessage = new ChatMessage()
        userMessage.role = 'user'
        userMessage.content = userPrompt

        const promptToSend = await jjChatThread.ref.addContext(userPrompt)
        console.log('promptToSend', promptToSend)

        userMessage.tokenCount = await session.measureInputUsage(userPrompt)
        jjChatThread.ref.appendChatMessage(userMessage)

        // TODO: we are not in that view anymore
        jjDownloadProgress.setValue(0)
        jjDownloadEta.setText('')
        estimator = new Estimator() // This is for download monitoring, which prompt() also supports

        submitController = new AbortController()
        jjBtnStopPrompt.show()
        jjBtnSubmitPrompt.hide()

        const assistantMessage = new ChatMessage()
        assistantMessage.role = 'assistant'

        jjChatThread.ref.appendChatMessage(assistantMessage)

        const inputUsageBefore = session.inputUsage
        let firstTokenTimestamp

        const isStreaming = jjOptStreaming.ref.checked
        console.debug('Streaming:', isStreaming)

        jjPromptStats.hide()
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
        jjDurationStatus.setText(format.num(totDuration))

        const timeToFirstToken = isStreaming ? firstTokenTimestamp - startTimestamp : totDuration
        console.debug('timeToFirstToken', timeToFirstToken)
        jjStatsTimeToFirstToken.setText(format.num(timeToFirstToken))

        const inferenceDuration = isStreaming ? endTimestamp - firstTokenTimestamp : totDuration
        console.debug('Inference Duration', inferenceDuration)
        jjStatsInferenceDuration.setText(format.num(inferenceDuration))

        const tokenPerSecond = Math.round((1000 * inputUsageDelta) / inferenceDuration)
        console.debug('tokenPerSecond', tokenPerSecond)
        jjTokenPerSecondStatus.setText(format.num(tokenPerSecond))
        jjPromptStats.show()

        updateSessionTokens()
        console.debug('Received response', assistantMessage.toJSON())
        jjBtnClone.show()
    } catch (e) {
        console.error('Prompt failed:', e)
    }
    submitController = null
    jjBtnStopPrompt.hide()
    jjBtnSubmitPrompt.show()
    jjChatLoadingAnimation.hide()
    jjPromptInput.enable().focus()
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
            jjChatThread.ref.appendChatMessage(chatMessage)
            updateSessionTokens()
            console.log('Appended selection successfully')
            jjAddContextReminder.hide()
            jjAddContextWarning.show()
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

            await jjChatThread.ref.appendImportedPage(importedPage)
            console.log(`Appended page successfully: ${url}`)
            jjAddContextReminder.hide()
            jjAddContextWarning.show()
        } catch (error) {
            console.error('Error appending page:', error)
        }
    },
})

jjBtnStopPrompt.on('click', () => {
    if (submitController) {
        console.debug('Stopping prompt')
        submitController.abort('User stopped prompt')
        submitController = null
        jjBtnClone.show()
    } else {
        console.debug('No abort signal exists')
    }
})

jjBtnClone.on('click', async () => {
    console.debug('New session')
    jjBtnClone.disable()
    console.time('Session Clone')
    session = await session.clone()
    console.timeEnd('Session Clone')
    jjBtnClone.hide()
    jjPromptStats.hide()
    jjChatThread.empty()
    updateSessionTokens()
    jjPromptInput.focus().setValue('')
    debouncedCountPromptTokens()
    jjChatPlaceholder.show()
    jjBtnClone.enable()
})

jjPromptInput.on('input', () => {
    if (jjPromptInput.getValue().trim()) {
        jjBtnSubmitPrompt.enable()
    } else {
        jjBtnSubmitPrompt.disable()
    }
    debouncedCountPromptTokens()
})

JJET.from(window).on('error', (e) => {
    console.error('window.error', e)
})

JJET.from(window).on('unhandledrejection', (e) => {
    console.error('unhandledrejection', e)
})

jjBtnReload.on('click', () => {
    console.debug('Reloading...')
    location.reload()
})

jjPromptInput.on('keydown', (e) => {
    // Submit on Enter, allow newline with Ctrl/Cmd+Enter
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        jjBtnSubmitPrompt.click()
    }
})

jjOptSysPrompt.on('keydown', (e) => {
    // Submit on Enter, allow newline with Ctrl/Cmd+Enter
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        jjBtnInit.click()
    }
})

function getVersionString() {
    const manifestJson = chrome.runtime.getManifest()
    if ('update_url' in manifestJson) {
        return manifestJson.version
    } else {
        return `${manifestJson.version}*`
    }
}

async function main() {
    await backgroundRpc.updateStatus(sidePanelStatus.STARTED)
    jjVersion.setText(getVersionString())

    if (typeof globalThis.LanguageModel !== 'function') {
        throw new Error('LanguageModel is not available in your browser.')
    }

    const modelOptions = getModelOptions()
    console.time('LanguageModel.availability()')
    const availability = await LanguageModel?.availability(modelOptions)
    console.timeEnd('LanguageModel.availability()')

    jjApiStatus.setText('LanguageModel is supported in your browser.')

    console.debug('Availability:', availability)

    if (!availability) {
        throw new Error('LanguageModel is not supported in your browser.')
    }

    // Can be "available", "unavailable", "downloadable", "downloading"
    switch (availability) {
        case 'unavailable':
            throw new Error('The selected options are not supported')
        case 'downloadable':
            jjDoc.find('#init-download-warning', true).show()
            break
        case 'downloading':
            jjDownloadStatus.show()
            break
        case 'available':
            jjPromptApiInit.show()
            await jjChatThread.ref.initRAG()
            jjOptSysPrompt.focus()
            const params = await LanguageModel.params()
            console.debug(`\tTemperature: default = ${params.defaultTemperature}, max = ${params.maxTemperature}`)
            console.debug(`\tTopK: default = ${params.defaultTopK}, max = ${params.maxTopK}`)

            // maxTemperature
            jjOptTemp.setAttr('max', params.maxTemperature)
            // defaultTemperature
            jjOptTemp.setValue(params.defaultTemperature)
            updateTempSlider()
            // maxTopK
            jjOptTopK.setAttr('max', params.maxTopK)
            // defaultTopK
            jjOptTopK.setValue(params.defaultTopK)
            updateTopKSlider()
            await backgroundRpc.updateStatus(sidePanelStatus.AWAITING_INIT)
            break
        default:
            throw new Error(`Unexpected availability: ${availability}`)
    }
}

// Scripts with `type="module"` are deferred by default, so we don't need to
// wait for DOMContentLoaded. The script will execute after the DOM is parsed.
try {
    await main()
    jjApiStatus.hide()
    jjSystemRequirements.hide()
} catch (e) {
    jjApiStatus.show().setText(`Error: ${e}`)
    console.error(e)
    jjSystemRequirements.show()
}
