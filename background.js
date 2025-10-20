const extensionName = chrome.runtime.getManifest().name

const contextMenuIds = {
    sendSelection: 'send-selection',
    sendPage: 'send-page',
    showSideBar: 'show-side-bar',
    initialized: 'language-model-initialized',
}

let sidePanelPort = null

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: contextMenuIds.showSideBar,
        title: `Show ${extensionName}`,
        contexts: ['all'],
        visible: true,
    })
    chrome.contextMenus.create({
        id: contextMenuIds.sendSelection,
        title: `Append selection to chat: %s`,
        contexts: ['selection'],
        visible: false,
    })
    chrome.contextMenus.create({
        id: contextMenuIds.sendPage,
        title: `Append page to chat`,
        contexts: ['page'],
        visible: false,
    })
    chrome.contextMenus.create({
        id: 'sep1',
        type: 'separator',
    })
    chrome.contextMenus.create({
        id: contextMenuIds.initialized,
        title: 'Ready',
        contexts: ['all'],
        enabled: false,
        type: 'checkbox',
        checked: false,
    })
})

async function canSend(isPortInitiated) {
    if (typeof isPortInitiated !== 'boolean') {
        throw new TypeError(`isPortInitiated must be a boolean. Got ${isPortInitiated} (${typeof isPortInitiated})`)
    }
    const promises = []
    console.debug('isPortInitiated', isPortInitiated)
    return await Promise.allSettled([
        chrome.contextMenus.update(contextMenuIds.sendSelection, { visible: isPortInitiated }),
        chrome.contextMenus.update(contextMenuIds.sendPage, { visible: isPortInitiated }),
        chrome.contextMenus.update(contextMenuIds.showSideBar, { visible: !isPortInitiated }),
        chrome.contextMenus.update(contextMenuIds.initialized, { checked: isPortInitiated }),
    ])
}

/**
 * @param {number} tabId The ID of the tab to inject the script into.
 */
export async function scrapePageHtml(tabId) {
    try {
        const fnReturns = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => document.body.innerHTML,
        })
        console.log(`Scraped ${fnReturns.length} frames.`)
        return fnReturns
    } catch (error) {
        console.error('Script injection failed:', error)
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        switch (info.menuItemId) {
            case contextMenuIds.showSideBar:
                chrome.sidePanel.open({ windowId: tab.windowId })
                break
            case contextMenuIds.sendSelection:
                console.log('Selected text:', info.selectionText)
                if (!sidePanelPort) {
                    throw new Error('Please initialize the side panel first.')
                }
                sidePanelPort.postMessage({
                    command: 'add',
                    format: 'text',
                    payload: info.selectionText,
                })
                break
            case contextMenuIds.sendPage:
                console.log(`Selected page URL:`, info.pageUrl)
                if (!sidePanelPort) {
                    throw new Error('Please initialize the side panel first.')
                }
                const fnReturns = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => document.body.innerHTML,
                })
                console.log(`Scraped ${fnReturns.length} frames.`)
                for (const { result } of fnReturns) {
                    sidePanelPort.postMessage({
                        command: 'add',
                        format: 'html',
                        payload: result,
                    })
                }
                break
            default:
                throw new RangeError(`Unrecognized context menu id: ${info.menuItemId}`)
        }
    } catch (error) {
        console.error('Error sending to side panel:', error)
    }
})

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'side-panel') {
        sidePanelPort = port
        console.log('Side panel has connected.')

        sidePanelPort.onMessage.addListener(async (msg) => {
            if (msg.type === 'side-panel-ready') {
                await canSend(true)
                console.log('Side panel is ready. Context menu enabled.')
            }
        })

        sidePanelPort.onDisconnect.addListener(async () => {
            sidePanelPort = null
            await canSend(false)
            console.log('Side panel has disconnected. Context menu disabled.')
        })
    } else {
        console.log('Unknown port:', port.name)
    }
})

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error))
