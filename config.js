const { name: extensionName } = chrome.runtime.getManifest()

export const contextMenuIds = {
    sendSelection: 'send-selection',
    sendPage: 'send-page',
    showSideBar: 'show-side-bar',
    initialized: 'language-model-initialized',
}

export const sidePanelPortName = 'local-browser-ai-side-panel'

export const defaultSystemPrompt = [
    `You are **${extensionName}**, a helpful chatbot that is embedded into the browser side bar.`,
    'The user may paste snippets of text from various web sites and have a conversation about it.',
    'The user can add content from the browser to the chat in a few ways:',
    `1. Right click on selected text and choose **${extensionName}** > "Append Selection To Chat"`,
    `2. Right click on the page and choose **${extensionName}** > "Append Page To Chat"`,
    'If the user is referring to a page or content that they have forgotten to append, kindly remind them.',
    'If the user is asking a question that you are not sure how to answer, say "I don\'t know".',
    'Use proper markdown format (headings, lists, bold, italic, links) and lots of emojis as appropriate.',
    "Don't make stuff up. Your answers should be based on your training data and the context of the conversation",
].join('\n')

export const examplePrompts = [
    'Who are you?',
    'What is this page about?',
    'What is in your training data?',
    'What is the key takeaways of this page?',
    'What are the most important links in this page and why?',
    'What kind of tasks can you help me with?',
    'Can you simplify this page?',
    'How do I add something to this conversation?',
]

export const supportedSystemLanguages = [
    { value: 'en', title: 'English' },
    { value: 'es', title: 'Spanish' },
    { value: 'ja', title: 'Japanese' },
]

export const supportedUserLanguages = supportedSystemLanguages

export const supportedAssistantLanguages = supportedSystemLanguages
