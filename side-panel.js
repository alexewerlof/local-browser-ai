import * as $ from './util/dom.js'
import { Estimator } from './util/estimator.js'
import { debounce } from './util/debounce.js'
import { formatDuration } from './util/format.js'
import { Message } from './util/Message.js'
import * as msg from './util/msg.js'

// Cache DOM elements for quick and organized access using `el` (elements).
// This is more efficient than repeatedly querying the DOM.
const el = {
    apiStatus: $.id('api-status'),
    btnInit: $.id('init-button'),
    btnInitStop: $.id('init-stop-button'),
    btnClose: $.id('close-button'),
    btnReload: $.id('reload-button'),
    btnStopPrompt: $.id('stop-prompt-button'),
    btnSubmitPrompt: $.id('submit-prompt-button'),
    downloadEta: $.id('download-eta'),
    downloadProgress: $.id('download-progress'),
    initLoadingAnimation: $.id('init-loading-animation'),
    chatLoadingAnimation: $.id('chat-loading-animation'),
    optLang: $.id('option-language'),
    optStreaming: $.id('option-streaming'),
    optSysPrompt: $.id('option-system-prompt'),
    optTemp: $.id('option-temperature'),
    optTopK: $.id('option-top-k'),
    pastChats: $.id('chat-history'),
    promptApiInit: $.id('prompt-api-init'),
    promptApiUi: $.id('prompt-api-ui'),
    promptInput: $.id('prompt-input'),
    quotaProgress: $.id('quota-usage-progress'),
    quotaText: $.id('quota-usage-text'),
    sessionEstablished: $.id('session-established'),
    usageStats: $.id('usage-stats'),
};

// --- State ---

let session
let estimator
let initController
let submitController

function getModelOptions() {
    const language = el.optLang.value;
    return {
        initialPrompts: [msg.system(el.optSysPrompt.value)],
        temperature: el.optTemp.value,
        topK: el.optTopK.value,
        expectedInputs: [{
            type: "text",
            languages: [language, language]
        }],
        expectedOutputs: [{
            type: "text",
            languages: [language]
        }],
    };
}

function monitor(m) {
    $.on(m, 'downloadprogress', (e) => {
        console.debug('Download Progress', Date.now(), e)
        el.downloadProgress.value = e.loaded

        if (e.loaded === 1) {
            el.downloadEta.textContent = 'Done!'
            return
        }

        estimator.report(e.loaded)
        try {
            const remainingMs = estimator.remaining
            const remainingStr = formatDuration(remainingMs, el.optLang.value)
            el.downloadEta.textContent = `ETA: ${remainingStr}`
        } catch (err) {
            el.downloadEta.textContent = String(err)
        }
    })
}

function updateSessionTokens() {
    if (!session) {
        return;
    }
    const { inputQuota, inputUsage } = session
    el.quotaProgress.max = inputQuota
    el.quotaProgress.value = inputUsage
    const remainingPercentage = ((inputQuota - inputUsage) / inputQuota) * 100
    el.quotaText.innerText = `${inputUsage} of ${inputQuota} (${remainingPercentage.toFixed(2)}% remaining)`
}

async function countPromptTokens() {
    if (!session) {
        return;
    }
    try {
        const userPrompt = el.promptInput.value;
        console.debug('Counting prompt tokens')
        const promptTokenCount = await session.measureInputUsage(userPrompt, { /* accepts a signal too */ })
        console.debug('Prompt token count:', promptTokenCount)
        el.usageStats.innerText = `${promptTokenCount} Tokens`
    } catch (e) {
        console.error('Failed to count prompt tokens:', e);
    }
}

const debouncedCountPromptTokens = debounce(countPromptTokens, 300);

$.click(el.btnInit, async () => {
    if (!navigator.userActivation.isActive) {
        console.log('Not active')
        return
    }

    try {
        el.promptApiInit.disabled = true
        const modelOptions = getModelOptions()
        el.downloadEta.textContent = 'Checking availability'
        const availability = await LanguageModel?.availability(modelOptions)
        // Can be "available", "unavailable", "downloadable", "downloading"
        el.downloadEta.textContent = `Model availability: ${availability}`
        console.log("Availability check result:", availability)
        if (availability === 'unavailable') {
            return
        }
        
        console.log('Initializing session...')
        el.downloadProgress.value = 0
        el.downloadEta.textContent = 'Initializing...'
        estimator = new Estimator()
        initController = new AbortController()
        el.initLoadingAnimation.hidden = false
        el.btnInit.hidden = true
        el.btnInitStop.hidden = false
        console.debug('Creating session...')
        session = await LanguageModel.create({
            ...modelOptions,
            // It's better to keep the initializer stop signal separate from prompt() signal
            signal: initController.signal,
            monitor,
        })
        console.debug('Session initialized.')
        el.promptApiInit.hidden = true
        updateSessionTokens()
        el.sessionEstablished.hidden = false
        el.promptInput.focus()
        debouncedCountPromptTokens();
        session.addEventListener('quotaoverflow', () => {
            console.warn('Quota overflow')
        })
    } catch (e) {
        console.error('Could not initialize session', e)
    }
    initController = null
    el.initLoadingAnimation.hidden = true
    el.btnInit.hidden = false
    el.btnInitStop.hidden = true
})

$.click(el.btnInitStop, () => {
    if (initController) {
        console.debug('Stopping init')
        initController.abort('User stopped init');
    }
    initController = null;
})

$.click(el.btnSubmitPrompt, async () => {
    console.log('Submitting prompt...')
    try {
        if (!session) {
            throw new Error('No session')
        }
        const userPrompt = el.promptInput.value
        if (!userPrompt) {
            return
        }
        el.chatLoadingAnimation.hidden = false
        debouncedCountPromptTokens();

        el.promptInput.value = ''
        el.promptInput.disabled = true

        console.debug('Sending prompt')
        const userMessage = new Message('user', userPrompt)
        el.pastChats.appendChild(userMessage.el)

        el.downloadProgress.value = 0
        el.downloadEta.textContent = ''
        estimator = new Estimator() // This is for download monitoring, which prompt() also supports
        
        submitController = new AbortController()
        el.btnStopPrompt.hidden = false
        el.btnSubmitPrompt.hidden = true
        
        const assistantMessage = new Message('assistant')
        
        el.pastChats.appendChild(assistantMessage.el)
        
        if (el.optStreaming.checked) {
            const stream = session.promptStreaming(userPrompt, {
                signal: submitController.signal,
                monitor,
            })
            for await (const chunk of stream) {
                // console.debug(chunk)
                assistantMessage.content += chunk
            }
        } else {
            assistantMessage.content = await session.prompt(userPrompt, {
                signal: submitController.signal,
                monitor,
            })
        }
        updateSessionTokens();
        console.debug('Received response', assistantMessage)
    } catch (e) {
        console.error('Prompt failed:', e);
    }
    el.btnStopPrompt.hidden = true
    el.btnSubmitPrompt.hidden = false
    el.chatLoadingAnimation.hidden = true
    submitController = null;
    el.promptInput.disabled = false
    el.promptInput.focus()
});

$.click(el.btnStopPrompt, () => {
    if (submitController) {
        console.debug('Stopping prompt')
        submitController.abort('User stopped prompt');
        submitController = null;
    } else {
        console.debug('No abort signal exists')
    }
});

$.on(el.promptInput, 'input', debouncedCountPromptTokens);

$.on(window, 'error', (e) => {
    console.error('window.error', e);
});

$.on(window, 'unhandledrejection', (e) => {
    console.error('unhandledrejection', e);
});

$.click(el.btnReload, () => {
    console.debug('Reloading...')
    location.reload();
})

$.click(el.btnClose, () => {
    window.close();
});

$.on(el.promptInput, 'keydown', (e) => {
    // Submit on Enter, allow newline with Ctrl/Cmd+Enter
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        el.btnSubmitPrompt.click();
    }
});

async function main() {
    const modelOptions = getModelOptions();
    const availability = await LanguageModel?.availability(modelOptions);
    console.debug('Availability:', availability)

    if (!availability) {
        throw new Error('LanguageModel is not available in your browser.')
    }

    el.apiStatus.textContent = ''

    // Can be "available", "unavailable", "downloadable", "downloading"
    if (availability === 'unavailable') {
        throw new Error('The selection options are not available')
    }

    el.promptApiUi.hidden = false;
    el.optSysPrompt.focus()

    const params = await LanguageModel.params()
    // maxTemperature
    el.optTemp.max = params.maxTemperature
    // defaultTemperature
    el.optTemp.value = params.defaultTemperature
    // maxTopK
    el.optTopK.max = params.maxTopK
    // defaultTopK
    el.optTopK.value = params.defaultTopK
    console.debug('Params analyzed');
}

// Scripts with `type="module"` are deferred by default, so we don't need to
// wait for DOMContentLoaded. The script will execute after the DOM is parsed.
try {
    await main();
} catch (e) {
    el.apiStatus.textContent = String(e)
}