export const contextMenuIds = {
    sendSelection: 'send-selection',
    sendPage: 'send-page',
    showSideBar: 'show-side-bar',
    initialized: 'language-model-initialized',
}

export const sidePanelPortName = 'local-browser-ai-side-panel'

export const defaultSystemPrompt = [
    'You are a helpful chatbot that is embedded into the browser side bar.',
    'The user may paste snippets of text from various web sites and have a conversation about it.',
    'Use proper markdown format (headings, lists, bold, italic, links) and lots of emojis as appropriate.',
].join('\n')

export const examplePrompts = [
    'What is this page about?',
    'What is the key takeaways of this page?',
    'What is in your training data?',
    'What kind of tasks can you help me with?',
]

export const supportedSystemLanguages = [
    { value: 'en', title: 'English' },
    { value: 'es', title: 'Spanish' },
    { value: 'ja', title: 'Japanese' },
]

export const supportedUserLanguages = supportedSystemLanguages

export const supportedAssistantLanguages = supportedSystemLanguages
