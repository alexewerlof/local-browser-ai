import { contextMenuIds, sidePanelStatus } from './config.js'
import * as RPC from './util/RPC.js'

new RPC.Server('background', {
    async updateStatus(status) {
        console.log('Side Panel Status:', status)
        if (typeof status !== 'string') {
            throw new TypeError(`isPortInitiated must be a boolean. Got ${isPortInitiated} (${typeof isPortInitiated})`)
        }
        const isPortInitiated = status === sidePanelStatus.INITIALIZED
        console.debug('isPortInitiated', isPortInitiated)
        return await Promise.allSettled([
            chrome.contextMenus.update(contextMenuIds.sendSelection, { visible: isPortInitiated }),
            chrome.contextMenus.update(contextMenuIds.sendPage, { visible: isPortInitiated }),
            chrome.contextMenus.update(contextMenuIds.showSideBar, { visible: !isPortInitiated }),
            chrome.contextMenus.update(contextMenuIds.initialized, { checked: isPortInitiated, title: status }),
        ])
    },
})

const sidePanelRpc = new RPC.Client('side-panel', 'add')

chrome.runtime.onInstalled.addListener(async () => {
    try {
        console.log('Creating context menus...')
        await chrome.contextMenus.removeAll()
        chrome.contextMenus.create({
            id: contextMenuIds.showSideBar,
            title: `Show chat`,
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
    } catch (error) {
        console.error('Error creating context menu:', error)
    }
})

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
                const url = new URL(tab.url)
                if (!url.hash) {
                    url.hash = ':~:text=' + encodeURIComponent(info.selectionText)
                }
                await sidePanelRpc.add({
                    format: 'text',
                    payload: info.selectionText,
                    title: tab.title || 'Selection',
                    faviconUrl: tab.favIconUrl,
                    url: url.toString(),
                })
                break
            case contextMenuIds.sendPage:
                console.log(`Selected page URL:`, info.pageUrl)
                const fnReturns = await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: () => document.body.innerHTML,
                })
                console.log(`Scraped ${fnReturns.length} frames.`)
                await Promise.all(
                    fnReturns.map(({ result }) =>
                        sidePanelRpc.add({
                            format: 'html',
                            payload: result,
                            title: tab.title || 'Page',
                            faviconUrl: tab.favIconUrl,
                            url: tab.url,
                        }),
                    ),
                )
                break
            default:
                throw new RangeError(`Unrecognized context menu id: ${info.menuItemId}`)
        }
    } catch (error) {
        console.error('Context menu click listener failed.', error)
    }
})

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error))
