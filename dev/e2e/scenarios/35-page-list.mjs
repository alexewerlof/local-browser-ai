import assert from 'node:assert/strict'
import { deskExtraction, deskTab, exampleTab, localSettings, togglePageList, waitForPageCount } from '../fixtures.mjs'
import { startFakeModelServer } from '../fake-server.mjs'

export const name = '35-page-list'

/**
 * The page strip has two states: the empty hint, and — from the first page on — one page
 * icon and count that opens the list of pages above the box. Adding a page opens that list
 * by itself; a row a turn has not carried yet is dimmed and can be removed; the count
 * pulses only while a capture runs.
 */
export async function run(ctx) {
	const server = await startFakeModelServer({ chunks: ['Both', ' are', ' listed', '.'] })
	try {
		await ctx.open({ settings: localSettings(server.endpoint), tab: exampleTab })
		const { page } = ctx

		// A single page already uses the count, and the add opens the list by itself.
		await waitForPageCount(page, 1)
		const badge = page.locator('.page-list__toggle')
		assert.equal(await badge.textContent(), '1')
		assert.equal(await badge.getAttribute('aria-expanded'), 'true')
		assert.equal(await badge.getAttribute('title'), 'Hide pages')
		assert.equal(await page.locator('.page-list__hint').count(), 0, 'no hint once a page is in')
		assert.equal(await page.locator('.page-list__panel > li').count(), 1)
		assert.equal(await page.locator('.page-list__item--pending').count(), 1)
		assert.equal(await page.locator('.page-list__remove').count(), 1)

		// The count closes it, and opens it again on the same list.
		await togglePageList(page)
		assert.equal(await page.locator('.page-chip').count(), 0, 'closed')
		assert.equal(await badge.getAttribute('aria-expanded'), 'false')
		assert.equal(await badge.getAttribute('title'), 'Show pages')
		await togglePageList(page)
		assert.equal(await page.locator('.page-list__panel > li').count(), 1)

		// Close it again, then let a second page arrive: the add reopens it by itself.
		await togglePageList(page)
		await page.evaluate(
			([nextTab, nextExtraction]) => window.__LB_AI_TEST__.addPage(nextTab, nextExtraction),
			[deskTab, deskExtraction],
		)
		await waitForPageCount(page, 2)
		assert.equal(await badge.getAttribute('aria-expanded'), 'true')
		assert.equal(await badge.getAttribute('title'), 'Hide pages')
		// Both captures have landed: waiting for a turn is not work in progress, so the
		// page icon is still.
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

		// The count closes the list again.
		await togglePageList(page)
		assert.equal(await page.locator('.page-chip').count(), 0)
		assert.equal(await badge.getAttribute('aria-expanded'), 'false')

		// A turn carries both pages, so neither row is pending any more.
		await page.locator('.composer__input').fill('Are both listed?')
		await page.locator('[aria-label="Submit"]').click()
		await page.waitForFunction(() => document.body.innerText.includes('Both are listed.'))
		await togglePageList(page)
		assert.equal(await page.locator('.page-list__item--pending').count(), 0)
		assert.equal(await page.locator('.page-list__remove').count(), 0, 'no trash once a turn carries it')
		assert.equal(await page.locator('.page-list__capturing').count(), 0)
	} finally {
		await server.close()
	}
}
