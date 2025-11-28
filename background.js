import { contextMenuIds, sidePanelStatus } from './config.js'
import { scrapePageHtml } from './util/scrape.js'
import * as RPC from './util/RPC.js'

new RPC.MessageServer('background', {
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

const sidePanelRpc = new RPC.MessageClient('side-panel', 'addSelection', 'addPage')

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
            id: contextMenuIds.simplify,
            title: `Simplify Page`,
            contexts: ['page'],
            visible: true,
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
        const { title, favIconUrl, url: tagUrlStr } = tab
        switch (info.menuItemId) {
            case contextMenuIds.simplify:
                const scrapeReturns = await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: scrapePageHtml,
                })
                const simplifiedPageUrl = new URL(chrome.runtime.getURL('simplified.html'))
                const result = scrapeReturns[0].result
                simplifiedPageUrl.searchParams.set('html', result.html)
                simplifiedPageUrl.searchParams.set('base', result.base)
                simplifiedPageUrl.searchParams.set('title', tab.title)
                simplifiedPageUrl.searchParams.set('source', tab.url)

                chrome.tabs.create({
                    url: simplifiedPageUrl.toString(),
                    index: tab.index + 1,
                })
                break
            case contextMenuIds.showSideBar:
                chrome.sidePanel.open({ windowId: tab.windowId })
                break
            case contextMenuIds.sendSelection:
                const { selectionText } = info

                console.log('Selected text:', selectionText)
                const selectionUrl = new URL(tagUrlStr)
                // @see https://web.dev/articles/text-fragments
                if (!selectionUrl.hash) {
                    selectionUrl.hash = ':~:text=' + encodeURIComponent(selectionText)
                }
                await sidePanelRpc.addSelection({
                    selectionText,
                    title,
                    favIconUrl,
                    url: selectionUrl.toString(),
                })
                break
            case contextMenuIds.sendPage:
                console.log(`Selected page URL:`, info.pageUrl)
                const fnReturns = await chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: scrapePageHtml,
                })
                let added = 0
                for (const fnReturn of fnReturns) {
                    const { result } = fnReturn
                    const pageUrlStr = result.base || tagUrlStr

                    if (result) {
                        await sidePanelRpc.addPage({
                            html: result.html,
                            title,
                            favIconUrl,
                            url: pageUrlStr,
                        })
                        added++
                    }
                }
                console.log(`Scraped ${fnReturns.length} frames and sent ${added} messages.`)
                break
            default:
                throw new RangeError(`Unrecognized context menu id: ${info.menuItemId}`)
        }
    } catch (error) {
        console.error('Context menu click listener failed.', error)
    }
})

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error))
