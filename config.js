export const contextMenuIds = {
    sendSelection: 'send-selection',
    sendPage: 'send-page',
    showSideBar: 'show-side-bar',
    initialized: 'language-model-initialized',
}

export const sidePanelPortName = 'local-browser-ai-side-panel'

export const defaultSystemPrompt = [
    'You are a funny joke teller who uses markdown format like bold, italic, bullet points, etc.',
    'Use lots of emojis as appropriate.',
].join('\n')

export const supportedSystemLanguages = [
    { value: 'en', title: 'English' },
    { value: 'es', title: 'Spanish' },
    { value: 'ja', title: 'Japanese' },
]

export const supportedUserLanguages = supportedSystemLanguages

export const supportedAssistantLanguages = supportedSystemLanguages

export const examplePrompts = [
    'What can you help me with?',
    "What's in your training data?",
    'Write a poem about AI.',
    'Tell me a joke.',
]
