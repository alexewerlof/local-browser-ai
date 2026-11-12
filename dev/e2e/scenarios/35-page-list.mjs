import assert from 'node:assert/strict'
import { deskExtraction, deskTab, exampleTab, localSettings, togglePageList, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '35-page-list'

/**
 * The page section is a header of the composer, not a card above it: one transparent row
 * with a chevron, the count and `Add page`, and the flat list under it, meeting the box
 * border. Adding a page opens that list by itself; a row a turn has not carried yet is
 * dimmed and can be removed; the count pulses only while a capture runs.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Both', ' are', ' listed', '.'] })
	try {
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx

		// A single page already uses the caption, and the add opens the list by itself.
		await waitForPageCount(page, 1)
		const header = page.locator('.page-list__toggle')
		assert.equal(await page.locator('.page-list__count').textContent(), '1')
		assert.equal(await page.locator('.page-list__label').textContent(), 'page')
		assert.equal(await header.getAttribute('aria-expanded'), 'true')
		assert.equal(await header.getAttribute('title'), 'Hide pages')
		// Open points down, closed points right: the chevron is the whole disclosure.
		assert.equal(await header.locator('.lucide-chevron-down').count(), 1)
		assert.equal(await header.locator('svg').count(), 1, 'no page icon in the header')
		// The section is not inside the box, so the box border only frames the editor.
		assert.equal(await page.locator('.composer__box .page-list').count(), 0)
		assert.equal(await page.locator('.composer__editor > .page-list').count(), 1)
		assert.equal(await page.locator('.page-list__add').count(), 1)
		assert.equal(await page.locator('.page-list__add').textContent(), 'Add page')
		assert.equal(await page.locator('.page-list__panel > li').count(), 1)
		assert.equal(await page.locator('.page-list__item--pending').count(), 1)
		assert.equal(await page.locator('.page-list__remove').count(), 1)

		// The header closes it, and opens it again on the same list.
		await togglePageList(page)
		assert.equal(await page.locator('.page-chip').count(), 0, 'closed')
		assert.equal(await header.getAttribute('aria-expanded'), 'false')
		assert.equal(await header.getAttribute('title'), 'Show pages')
		assert.equal(await header.locator('.lucide-chevron-right').count(), 1)
		// The caption stays: the header is one line whatever state the list is in.
		assert.equal(await page.locator('.page-list__count').textContent(), '1')
		await togglePageList(page)
		assert.equal(await page.locator('.page-list__panel > li').count(), 1)

		// Close it again, then let a second page arrive: the add reopens it by itself.
		await togglePageList(page)
		await page.evaluate(
			([nextTab, nextExtraction]) => window.__LB_AI_TEST__.addPage(nextTab, nextExtraction),
			[deskTab, deskExtraction],
		)
		await waitForPageCount(page, 2)
		assert.equal(await header.getAttribute('aria-expanded'), 'true')
		assert.equal(await header.getAttribute('title'), 'Hide pages')
		// Both captures have landed: waiting for a turn is not work in progress, so the
		// caption is still.
		assert.equal(await page.locator('.page-list__capturing').count(), 0)

		// The list holds them in the order they were added.
		assert.equal(await page.locator('.page-list__panel > li').count(), 2)
		assert.equal(await page.locator('.page-list__panel .page-chip__host').count(), 2)
		assert.deepEqual(await page.locator('.page-chip__title').allTextContents(), [
			'Example Pricing',
			'Standing desk — Garden',
		])
		assert.equal(await page.locator('.page-list__item--pending').count(), 2)

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

		// A row still brings its page back.
		await page.locator('.page-chip').nth(1).click()
		const focused = await page.evaluate(() => window.__LB_AI_TEST__.focusedPages)
		assert.deepEqual(
			focused.map((entry) => entry.url),
			['https://garden.example/desk'],
		)

		// The header closes the list again.
		await togglePageList(page)
		assert.equal(await page.locator('.page-chip').count(), 0)
		assert.equal(await header.getAttribute('aria-expanded'), 'false')

		// A turn carries both pages, so neither row is pending any more.
		await page.locator('.composer__input').fill('Are both listed?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('Both are listed.'))
		await togglePageList(page)
		assert.equal(await page.locator('.page-list__item--pending').count(), 0)
		assert.equal(await page.locator('.page-list__remove').count(), 0, 'no trash once a turn carries it')
		assert.equal(await page.locator('.page-list__capturing').count(), 0)

		// The header is the top band of the composer, never a box of its own. Focus is a tint
		// on the row: the global `:focus-visible` ring hugs the left half of the row and floats
		// above the prompt, which is what made the page list read as a separate composer.
		await page.locator('.composer__input').focus()
		// A Tab press is what puts the browser in keyboard modality, as a keyboard user has it.
		await page.keyboard.press('Tab')
		await page.locator('.page-list__toggle').focus()
		const focusedRow = await page.evaluate(() => {
			const toggle = document.querySelector('.page-list__toggle')
			return {
				focusVisible: toggle.matches(':focus-visible'),
				outline: getComputedStyle(toggle).outlineStyle,
				row: getComputedStyle(document.querySelector('.page-list__head')).backgroundColor,
			}
		})
		assert.equal(focusedRow.focusVisible, true, 'the check needs a keyboard focus to mean anything')
		assert.equal(focusedRow.outline, 'none', 'the header must not draw an outline box')
		assert.notEqual(focusedRow.row, 'rgba(0, 0, 0, 0)', 'the row is what shows the focus')

		// One surface, two bands: the page list and the prompt share a single border and
		// radius, and the editor band draws none of its own.
		const surface = await page.evaluate(() => {
			const editor = getComputedStyle(document.querySelector('.composer__editor'))
			const box = getComputedStyle(document.querySelector('.composer__box'))
			const band = getComputedStyle(document.querySelector('.page-list'))
			const head = getComputedStyle(document.querySelector('.page-list__head'))
			return {
				editor: { border: editor.borderTopWidth, radius: editor.borderTopLeftRadius },
				box: { border: box.borderTopWidth, radius: box.borderTopLeftRadius },
				bandBottom: band.borderBottomWidth,
				headTop: head.borderTopLeftRadius,
			}
		})
		assert.equal(surface.editor.border, '1px', 'the composer wraps both bands in one border')
		assert.notEqual(surface.editor.radius, '0px', 'that border is rounded')
		assert.equal(surface.box.border, '0px', 'the editor band draws no border of its own')
		assert.equal(surface.bandBottom, '1px', 'a hairline divides the page band from the prompt')
		assert.equal(surface.headTop, surface.editor.radius, 'the top band follows the surface corner')

		/** What the focus ring and the neutral edge look like right now. */
		const chrome = () =>
			page.evaluate(() => {
				const probe = document.createElement('span')
				probe.style.color = 'var(--accent)'
				document.body.append(probe)
				const accent = getComputedStyle(probe).color
				probe.remove()
				const ring = getComputedStyle(document.querySelector('.composer__box'), '::after')
				const editor = getComputedStyle(document.querySelector('.composer__editor'))
				return {
					ring: ring.opacity,
					ringSide: ring.borderTopColor === accent ? 'accent' : 'neutral',
					edge: editor.borderTopColor === accent ? 'accent' : 'neutral',
				}
			})

		// The ring is the prompt's, and only the prompt's. It listens to a keystroke the prompt
		// would actually receive: focusing the page band (whose rows never type) or a control in
		// the editor band must leave the composer looking the way it does when nothing is focused.
		await page.locator('.page-list__toggle').focus()
		await page.waitForFunction(
			() => getComputedStyle(document.querySelector('.composer__box'), '::after').opacity === '0',
		)
		const bandFocused = await chrome()
		assert.equal(bandFocused.ring, '0', 'a page row must not claim the prompt is focused')
		assert.equal(bandFocused.edge, 'neutral', 'and the edge stays the composer’s default')

		await page.locator('.composer__input').focus()
		await page.waitForFunction(
			() => getComputedStyle(document.querySelector('.composer__box'), '::after').opacity === '1',
		)
		const promptChrome = await chrome()
		assert.equal(promptChrome.ring, '1', 'the prompt draws the ring')
		assert.equal(promptChrome.ringSide, 'accent', 'the ring is accent')
		assert.equal(promptChrome.edge, 'neutral', 'the page band keeps the composer’s default border')

		// A toolbar chip is focusable without handing a keystroke to the prompt, so it must not
		// light the ring either — that is the "looks focused, typing does nothing" mismatch.
		await page.locator('.chip--model').click()
		await page.waitForSelector('.popover')
		await page.waitForFunction(
			() => getComputedStyle(document.querySelector('.composer__box'), '::after').opacity === '0',
		)
		assert.equal((await chrome()).ring, '0', 'a chip must not claim the prompt is focused')
		await page.keyboard.press('Escape')
		await page.waitForSelector('.popover', { state: 'detached' })

		assert.equal(
			await page.locator('.page-list__toggle').evaluate((node) => getComputedStyle(node).outlineStyle),
			'none',
			'focusing the prompt must not put a box round the header',
		)
	} finally {
		await server.close()
	}
}
