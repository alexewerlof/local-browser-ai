import assert from 'node:assert/strict'
import { deskExtraction, deskTab, exampleTab, localSettings, openPagesMenu, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '35-pages-menu'

/**
 * The chat's pages are the first menu of the composer's menu bar, not a band above the prompt.
 *
 * The bar states how many there are whether the menu is open or closed, the menu holds the
 * rows themselves with a search box and a “+” where the other menus keep their gear, and an
 * add opens the menu by itself. A row a turn has not carried yet is dimmed and can be removed;
 * the count pulses only while a capture runs.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Both', ' are', ' listed', '.'] })
	try {
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx
		const trigger = page.locator('.pages-menu__trigger')

		// The capture opens the menu by itself, so the new row is on screen without a click.
		await waitForPageCount(page, 1)
		assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
		assert.equal(await page.locator('.pages-menu__list > li').count(), 1)
		assert.equal(await page.locator('.pages-menu__item--pending').count(), 1)
		assert.equal(await page.locator('.pages-menu__remove').count(), 1)
		// A capture of a single page is over by now: waiting for a turn is not work in progress.
		assert.equal(await page.locator('.pages-menu__trigger .menu-item__count--busy').count(), 0)

		// The trigger names the menu, and the count is in a pill beside it.
		assert.equal(await trigger.locator('.menu-item__label').textContent(), 'Pages')
		assert.equal(await trigger.locator('.menu-item__count').textContent(), '1')
		// It is the first item of the bar, because it is where a chat's own material lives.
		assert.equal(
			await page.locator('.composer__menubar .menu-item').first().locator('.menu-item__label').textContent(),
			'Pages',
		)

		// The band is gone: nothing between the resize line and the prompt wraps the rows.
		assert.equal(await page.locator('.composer .page-list').count(), 0)
		assert.equal(await page.locator('.composer__box .page-list').count(), 0)

		// A menu bar, not a row of buttons: the panel is the body of the item it belongs to.
		// It sits on the item's own top edge with no gap, its bottom corners are square where
		// the two meet, and the open item is square and joins it — one surface, one highlight.
		const seam = await page.evaluate(() => {
			const panel = document.querySelector('.popover')
			const item = document.querySelector('.pages-menu__trigger')
			if (!panel || !item) throw new Error('the menu must be open for this check')
			const panelBox = panel.getBoundingClientRect()
			const itemBox = item.getBoundingClientRect()
			const panelStyle = getComputedStyle(panel)
			const itemStyle = getComputedStyle(item)
			return {
				gap: panelBox.bottom - itemBox.top,
				aligned: Math.abs(panelBox.left - itemBox.left),
				radius: panelStyle.borderBottomLeftRadius,
				edge: panelStyle.borderBottomWidth,
				itemRadius: itemStyle.borderTopLeftRadius,
				// The panel and the highlighted item must be the same surface, or the seam shows.
				itemSurface: itemStyle.backgroundColor,
				panelSurface: panelStyle.backgroundColor,
			}
		})
		assert.ok(Math.abs(seam.gap) <= 1, `the panel is ${seam.gap}px off the item's edge`)
		assert.ok(seam.aligned <= 1, 'the panel starts on the item’s own left edge')
		assert.equal(seam.radius, '0px', 'no rounding where the panel meets the bar')
		assert.equal(seam.edge, '0px', 'and no line between them')
		assert.equal(seam.itemRadius, '0px', 'the open item drops the rounded corners')
		assert.equal(seam.itemSurface, seam.panelSurface, 'the item is the top of the panel')

		// Hovering another item hands the menu over, the way a window menu bar does.
		await page.locator('.tools-menu__trigger').hover()
		await page.waitForFunction(
			() =>
				document.querySelector('.tools-menu__trigger')?.getAttribute('aria-expanded') === 'true' &&
				document.querySelector('.pages-menu__trigger')?.getAttribute('aria-expanded') === 'false',
		)
		assert.equal(await page.locator('.pages-menu__list').count(), 0, 'the pages menu gave way')
		// And with nothing open the bar stays inert: sweeping across it leaves no panel behind.
		await page.keyboard.press('Escape')
		await page.locator('.model-menu__trigger').hover()
		assert.equal(await page.locator('.popover').count(), 0, 'a hover alone opens nothing')

		// Back to the menu this scenario is about.
		await openPagesMenu(page)

		// The trigger closes the menu, and the count stays on the bar while it is shut.
		await trigger.click()
		assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
		assert.equal(await page.locator('.pages-menu__list').count(), 0)
		assert.equal(await trigger.locator('.menu-item__count').textContent(), '1')

		// Opening it again shows the same rows, and a second page arrives while it is shut.
		await openPagesMenu(page)
		assert.equal(await page.locator('.pages-menu__list > li').count(), 1)
		await trigger.click()
		await page.evaluate(
			([nextTab, nextExtraction]) => window.__LB_AI_TEST__.addPage(nextTab, nextExtraction),
			[deskTab, deskExtraction],
		)
		await waitForPageCount(page, 2)
		assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'an add opens the menu')

		// The list holds them in the order they were added.
		assert.equal(await page.locator('.pages-menu__list > li').count(), 2)
		assert.deepEqual(await page.locator('.page-chip__title').allTextContents(), [
			'Example Pricing',
			'Standing desk — Garden',
		])
		assert.equal(await page.locator('.pages-menu__item--pending').count(), 2)
		assert.deepEqual(await page.locator('.page-chip__host').allTextContents(), ['example.com', 'garden.example'])

		// Each row carries when its page was captured, after the icon and title. Both were
		// added just now, so the row shows the clock time to the second and no date; the
		// exact instant travels in the `<time>` element, with the full version as its tooltip.
		const stamps = await page.locator('.page-chip__stamp').allTextContents()
		assert.equal(stamps.length, 2)
		for (const stamp of stamps) {
			assert.match(stamp, /\d{1,2}[:.]\d{2}[:.]\d{2}/, `expected a clock time with seconds, got “${stamp}”`)
			assert.doesNotMatch(stamp, /,/, 'today carries no date')
			// Never relative, so a list left open cannot start lying.
			assert.doesNotMatch(stamp, /ago|now/i)
		}
		const instants = await page
			.locator('time.page-chip__stamp')
			.evaluateAll((nodes) =>
				nodes.map((node) => ({ dateTime: node.getAttribute('datetime'), title: node.getAttribute('title') })),
			)
		for (const instant of instants) {
			assert.match(instant.dateTime ?? '', /^\d{4}-\d{2}-\d{2}T/)
			// The tooltip is the same moment, spelled out in the user's locale.
			assert.ok((instant.title ?? '').length > instant.dateTime.length, `tooltip: ${instant.title}`)
			assert.notEqual(instant.title, instant.dateTime)
		}

		// The stamp comes after the title, and the host still closes the row.
		const order = await page
			.locator('.page-chip--list')
			.first()
			.evaluate((row) => [...row.children].map((node) => node.className || node.tagName.toLowerCase()))
		assert.deepEqual(order.slice(1), ['page-chip__title', 'page-chip__stamp', 'page-chip__host'])

		// The search narrows the rows to what the user typed, by title or by host.
		const search = page.locator('.popover .popover__header .input')
		await search.fill('desk')
		assert.equal(await page.locator('.pages-menu__list > li').count(), 1)
		assert.match(await page.locator('.page-chip__title').textContent(), /Standing desk/)
		await search.fill('nothing at all')
		assert.equal(await page.locator('.popover__empty').textContent(), 'No pages match.')
		assert.equal(await page.locator('.pages-menu__list').count(), 0)
		await search.fill('')
		assert.equal(await page.locator('.pages-menu__list > li').count(), 2)

		// A row still brings its page back, and closing the menu is the trigger's job.
		await page.locator('.page-chip').nth(1).click()
		const focused = await page.evaluate(() => window.__LB_AI_TEST__.focusedPages)
		assert.deepEqual(
			focused.map((entry) => entry.url),
			['https://garden.example/desk'],
		)
		assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'opening a page closes the menu')

		// A turn carries both pages, so neither row is pending any more.
		await page.locator('.composer__input').fill('Are both listed?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('Both are listed.'))
		await openPagesMenu(page)
		assert.equal(await page.locator('.pages-menu__item--pending').count(), 0)
		assert.equal(await page.locator('.pages-menu__remove').count(), 0, 'no trash once a turn carries it')

		// The surface is full-bleed: no border or radius around the composer, the prompt band
		// a shade darker than the panel, and the resize line flush with the menu bar.
		await page.keyboard.press('Escape')
		const surface = await page.evaluate(() => {
			const composer = document.querySelector('.composer')
			const menubar = document.querySelector('.composer__menubar')
			const box = document.querySelector('.composer__box')
			const resizer = document.querySelector('.composer__resizer')
			const panel = document.querySelector('.app')
			const probe = document.createElement('span')
			probe.style.background = 'var(--bg-sunken)'
			panel.append(probe)
			const sunken = getComputedStyle(probe).backgroundColor
			probe.style.background = 'var(--bg)'
			const canvas = getComputedStyle(probe).backgroundColor
			probe.remove()
			const style = getComputedStyle(composer)
			const bandStyle = getComputedStyle(box)
			return {
				padding: style.paddingTop,
				border: style.borderTopWidth,
				composerLeft: composer.getBoundingClientRect().left,
				panelLeft: panel.getBoundingClientRect().left,
				menubarTop: menubar.getBoundingClientRect().top,
				resizerTop: resizer.getBoundingClientRect().top,
				band: bandStyle.backgroundColor,
				sunken,
				canvas,
			}
		})
		assert.equal(surface.padding, '0px', 'the composer owns no gutter')
		assert.equal(surface.border, '0px', 'and no frame')
		assert.ok(
			Math.abs(surface.composerLeft - surface.panelLeft) <= 1,
			'the composer is the full width of the panel',
		)
		// The grab strip overhangs the rule by 4px, so the line itself starts where the bar does.
		assert.ok(
			Math.abs(surface.menubarTop - surface.resizerTop) <= 5,
			`the menu bar is flush with the resize line (${surface.menubarTop} vs ${surface.resizerTop})`,
		)
		assert.notEqual(surface.band, surface.canvas, 'the prompt band is a shade darker than the panel')
		assert.equal(surface.band, surface.sunken, 'and that shade is the sunken surface token')

		// The ring is the prompt's, and only the prompt's: the menu bar and the actions under
		// it are outside the band, so focusing them cannot light it. Both readings wait for the
		// fade, which is what the transition makes of an instantaneous state change.
		const ring = () =>
			page.evaluate(() => {
				const overlay = getComputedStyle(document.querySelector('.composer__box'), '::after')
				return { opacity: overlay.opacity, top: overlay.top, left: overlay.left }
			})

		await trigger.focus()
		await page.waitForFunction(
			() => getComputedStyle(document.querySelector('.composer__box'), '::after').opacity === '0',
		)
		const barFocused = await ring()
		assert.equal(barFocused.opacity, '0', 'a menu must not claim the prompt is focused')

		await page.locator('.composer__input').focus()
		await page.waitForFunction(
			() => getComputedStyle(document.querySelector('.composer__box'), '::after').opacity === '1',
		)
		const promptFocused = await ring()
		assert.equal(promptFocused.opacity, '1', 'the prompt draws the ring')
		// The ring wraps the band it belongs to, with no offset of its own.
		assert.equal(promptFocused.top, '0px', 'the ring hugs the band')
		assert.equal(promptFocused.left, '0px', 'and its full width')

		// A button under the prompt is outside that band: focusing it must not draw the ring.
		await page.locator('.composer__input').fill('draft')
		await page.locator('[aria-label="Submit"]').focus()
		await page.waitForFunction(
			() => getComputedStyle(document.querySelector('.composer__box'), '::after').opacity === '0',
		)
	} finally {
		await server.close()
	}
}
