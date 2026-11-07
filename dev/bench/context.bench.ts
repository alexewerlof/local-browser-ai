/**
 * $ npm run bench
 *
 * Measures how many tokens each page representation costs on the same page, and
 * whether it still contains the fact a user would ask about. Run it before and after
 * changing the extraction pipeline; the index rows are what the prompt actually gets.
 */
import { describe, it } from 'vitest'
import { freezePage, renderPageBlock } from '../../src/core/context/page-block'
import { renderPageIndex } from '../../src/core/context/page-index'
import { estimateTokens } from '../../src/core/context/tokens'
import { extractPageInPageContext } from '../../src/browser/extract/inject'
import { processExtraction } from '../../src/browser/extract/pipeline'
import { findInAttachment } from '../../src/browser/extract/sections'

interface Fixture {
	name: string
	/** What a user might ask about; a good representation must keep it. */
	marker: string
	html: () => string
}

const paragraph = (text: string) => `<p>${text}</p>`
const filler = (topic: string, count: number) =>
	Array.from({ length: count }, (_, index) =>
		paragraph(
			`${topic} detail ${index + 1}: this paragraph exists to give the page a realistic amount of prose so the token counts mean something. It repeats without saying anything new, which is exactly what most real pages do inside a section.`,
		),
	).join('')

const nav = (count: number) =>
	`<nav>${Array.from({ length: count }, (_, index) => `<a href="/docs/section-${index}">Section ${index}</a>`).join('')}</nav>`

const FIXTURES: Fixture[] = [
	{
		name: 'article',
		marker: 'Migration to Postgres 18 requires a logical replication slot',
		html: () =>
			[
				'<header><a href="/">Blog</a><a href="/about">About</a></header>',
				'<article>',
				'<h1>Migrating a busy Postgres cluster</h1>',
				'<p>We moved four terabytes of data with a few minutes of downtime.</p>',
				'<h2>Preparation</h2>',
				filler('Preparation', 20),
				'<h2>Cutover</h2>',
				`${paragraph('Migration to Postgres 18 requires a logical replication slot and a monitoring dashboard watching lag.')}${filler('Cutover', 20)}`,
				'<h2>Rollback</h2>',
				filler('Rollback', 20),
				'</article>',
				'<footer>Subscribe to the newsletter</footer>',
			].join(''),
	},
	{
		name: 'docs',
		marker: 'olshausen',
		html: () =>
			[
				nav(60),
				'<main>',
				'<h1>Transport reference</h1>',
				'<h2>Configuration</h2>',
				filler('Configuration', 12),
				'<pre><code class="language-json">{"host":"192.0.2.10","port":9443,"tls":true}</code></pre>',
				'<h2>Authentication</h2>',
				`${paragraph('The transport identity is derived from the olshausen key you register here.')}${filler('Authentication', 12)}`,
				'<table><thead><tr><th>Option</th><th>Default</th></tr></thead><tbody>',
				Array.from({ length: 12 }, (_, index) => `<tr><td>option${index}</td><td>value${index}</td></tr>`).join(
					'',
				),
				'</tbody></table>',
				'<h2>Errors</h2>',
				filler('Errors', 4),
				'</main>',
			].join(''),
	},
	{
		name: 'dashboard',
		marker: 'Invite member',
		html: () =>
			[
				'<header role="banner"><a href="/">Acme</a></header>',
				'<main>',
				'<h1>Workspace settings</h1>',
				'<label>Workspace name <input type="text" value="Acme"></label>',
				'<label><input type="checkbox" checked> Audit logging</label>',
				'<label><input type="checkbox"> Require two-factor authentication</label>',
				'<select aria-label="Region"><option>eu-west</option><option>us-east</option></select>',
				'<button>Save changes</button>',
				'<button>Invite member</button>',
				'<h2>Members</h2>',
				'<ul aria-label="Members"><li>Ada Lovelace (owner)</li><li>Grace Hopper (admin)</li><li>Alan Turing</li></ul>',
				'<h2>Billing</h2>',
				'<p>Your plan renews on 1 March.</p>',
				'<button>Manage billing</button>',
				'</main>',
				'<footer role="contentinfo">Acme Inc</footer>',
			].join(''),
	},
	{
		name: 'product',
		marker: 'EUR 1,299',
		html: () =>
			[
				nav(20),
				'<main>',
				'<h1>Standing desk</h1>',
				'<p>EUR 1,299 including delivery.</p>',
				'<button>Add to cart</button>',
				'<h2>Reviews</h2>',
				'<ul>',
				Array.from(
					{ length: 15 },
					(_, index) => `<li>Review ${index}: the frame is stable and the motor is quiet.</li>`,
				).join(''),
				'</ul>',
				'<h2>Related products</h2>',
				'<ul>',
				Array.from(
					{ length: 12 },
					(_, index) => `<li><a href="/p/${index}">Desk accessory ${index}</a></li>`,
				).join(''),
				'</ul>',
				'</main>',
			].join(''),
	},
]

interface Row {
	representation: string
	chars: number
	tokens: number
	marker: string
}

function row(representation: string, text: string, marker: string): Row {
	return {
		representation,
		chars: text.length,
		tokens: estimateTokens(text),
		marker: text.toLowerCase().includes(marker.toLowerCase()) ? 'yes' : 'NO',
	}
}

function measureFixture(fixture: Fixture): Row[] {
	const html = fixture.html()
	document.body.innerHTML = html

	const injection = extractPageInPageContext({ mode: 'page' })
	const attachment = processExtraction(injection)
	const block = renderPageBlock(freezePage(attachment, 'bench', 'p1'))
	const excerptHits = findInAttachment(attachment, fixture.marker, 2)

	return [
		row('raw html (source)', html, fixture.marker),
		row('cleaned html (clone)', injection.html, fixture.marker),
		// jsdom has no innerText, so this row is only meaningful in a real browser.
		row(`plain text (innerText${injection.text ? '' : ', jsdom n/a'})`, injection.text, fixture.marker),
		row(`aria skeleton (${injection.controls} controls)`, injection.aria, fixture.marker),
		row(`chosen representation (${attachment.representation})`, attachment.markdown, fixture.marker),
		row('page block (what the prompt carries)', block, fixture.marker),
		row('index only', renderPageIndex(attachment, { query: fixture.marker }), fixture.marker),
		row(
			'index + 2 excerpts',
			[
				renderPageIndex(attachment, { query: fixture.marker }),
				...excerptHits.map((hit) => `### ${hit.heading}\n${hit.snippet}`),
			].join('\n\n'),
			fixture.marker,
		),
	]
}

describe('page representation benchmark', () => {
	it('prints tokens per representation', () => {
		const summary: Array<Row & { fixture: string }> = []
		for (const fixture of FIXTURES) {
			const rows = measureFixture(fixture)
			// stderr keeps the table visible regardless of the test reporter's log mode.
			console.error(`\n${fixture.name.toUpperCase()} (marker: "${fixture.marker}")`)
			console.table(rows)
			for (const entry of rows) summary.push({ fixture: fixture.name, ...entry })
		}
		console.table(
			summary.map((entry) => ({
				fixture: entry.fixture,
				representation: entry.representation,
				tokens: entry.tokens,
				marker: entry.marker,
			})),
			['fixture', 'representation', 'tokens', 'marker'],
		)
	})
})
