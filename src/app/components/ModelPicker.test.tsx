// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { AppSettings, ModelRef, ProviderSettings } from '../../core/types'
import { insecureEndpoint } from '../../core/endpoint'
import { defaultSettings } from '../../core/settings'
import { ModelPicker } from './ModelPicker'

afterEach(cleanup)

/** The sentence a mark carries; `endpoint.test.ts` is what pins its exact wording. */
const SECURITY_WARNING = insecureEndpoint('http://mac-mini.localdomain:8080/v1')?.summary

function provider(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
	return {
		id: 'local',
		label: 'Fake local server',
		models: ['gemma-4-12B-it'],
		...overrides,
	}
}

function openPicker(
	providers: ProviderSettings[],
	current: ModelRef | null = null,
	defaultModel: ModelRef | null = null,
) {
	const settings: AppSettings = { ...defaultSettings(), providers, defaultModel }
	const onSelect = vi.fn()
	const onDefaultChange = vi.fn()
	const view = render(
		<ModelPicker settings={settings} current={current} onSelect={onSelect} onDefaultChange={onDefaultChange} />,
	)
	fireEvent.click(view.container.querySelector('.chip--model') as HTMLElement)
	return { ...view, onSelect, onDefaultChange }
}

/** The row wrappers, which carry the hover and the selected tint. */
function rows(container: HTMLElement): HTMLElement[] {
	return [...container.querySelectorAll<HTMLElement>('.popover__model')]
}

describe('ModelPicker', () => {
	it('shows the figures the server reported, without an estimate mark', () => {
		const { container } = openPicker([
			provider({
				modelDetails: [
					{
						id: 'gemma-4-12B-it',
						contextWindow: 65_536,
						maxOutputTokens: 4096,
						inputModalities: ['text', 'image'],
						outputModalities: ['text'],
					},
				],
			}),
		])

		const [row] = rows(container)
		expect(row?.querySelector('.popover__item-token')?.textContent).toBe('66k / 4.1k')
		expect(row?.querySelector('.popover__item-token')?.getAttribute('title')).toBe('Context 66k · Max output 4.1k')
		expect(row?.querySelector('.popover__item-modalities')?.getAttribute('aria-label')).toBe(
			'Input: text, image · Output: text',
		)
		expect(row?.querySelectorAll('.popover__item-modality')).toHaveLength(3)
		// gemma is not a reasoning model, so the row offers no chip.
		expect(row?.querySelector('.popover__item-reasoning')).toBeNull()
	})

	it('marks catalog estimates and says so in the tooltip', () => {
		const { container } = openPicker([provider({ models: ['mystery-llm'] })])

		const [row] = rows(container)
		expect(row?.querySelector('.popover__item-token')?.textContent).toBe('~8.2k / ~2k')
		expect(row?.querySelector('.popover__item-token')?.getAttribute('title')).toMatch(
			/^Context ~8\.2k · Max output ~2k\. Estimated from the model catalog\./,
		)
		// Nothing was reported about the modalities, so the row shows Settings' dash.
		expect(row?.querySelector('.popover__item-muted')?.textContent).toBe('—')
		expect(row?.querySelector('.popover__item-modalities')).toBeNull()
	})

	it('names the reasoning capability only for a model that has one', () => {
		const { container } = openPicker([
			provider({
				models: ['Qwen3.6-27B-MTP'],
				modelDetails: [{ id: 'Qwen3.6-27B-MTP', inputModalities: ['text'], outputModalities: ['text'] }],
			}),
		])

		const [row] = rows(container)
		const reasoning = row?.querySelector('.popover__item-reasoning')
		// A glyph like the modality ones, so the name lives in the accessibility tree only.
		expect(reasoning?.textContent).toBe('')
		expect(reasoning?.getAttribute('aria-label')).toBe('Reasoning')
		// It trails the output modalities, on the facts line under the model's name.
		expect(reasoning?.parentElement?.className).toMatch(/popover__item-facts/)
		expect(reasoning?.previousElementSibling?.className).toMatch(/popover__item-modalities/)
	})

	it('puts the figures and the glyphs on one line under the name', () => {
		const { container } = openPicker([
			provider({
				models: ['Qwen3.6-27B-MTP'],
				modelDetails: [{ id: 'Qwen3.6-27B-MTP', inputModalities: ['text'], outputModalities: ['text'] }],
			}),
		])

		const [row] = rows(container)
		const facts = row?.querySelector('.popover__item-facts')
		// The name stands alone on the first line, with no figures or glyphs beside it.
		expect(row?.querySelector('.popover__item-row')?.querySelector('.popover__item-token')).toBeNull()
		expect(facts?.querySelector('.popover__item-token')?.textContent).toBe('~33k / ~4.1k')
		expect(facts?.querySelector('.popover__item-modalities')).not.toBeNull()
	})

	it('marks the current model and closes on a pick', () => {
		const ref = { providerId: 'local', modelId: 'gemma-4-12B-it' }
		const { container, onSelect } = openPicker([provider()], ref)

		const [row] = rows(container)
		expect(row?.className).toMatch(/popover__model--selected/)
		// The row's own tint is the only "in use" mark: no tick competes with the state icons.
		expect(row?.querySelector('.popover__item-row > svg')).toBeNull()

		fireEvent.click(row?.querySelector('.popover__item--model') as HTMLElement)
		expect(onSelect).toHaveBeenCalledWith(ref)
		expect(container.querySelector('.popover')).toBeNull()
	})

	it('marks a model the server has loaded', () => {
		const { container } = openPicker([
			provider({
				models: ['gemma-4-12B-it', 'Qwen3.6-27B-MTP'],
				modelDetails: [
					{ id: 'gemma-4-12B-it', state: 'loaded' },
					{ id: 'Qwen3.6-27B-MTP', state: 'unloaded' },
				],
			}),
		])

		const [loaded, unloaded] = rows(container)
		const mark = loaded?.querySelector('.popover__item-loaded')
		expect(mark?.getAttribute('aria-label')).toBe('Loaded in the server')
		expect(unloaded?.querySelector('.popover__item-loaded')).toBeNull()
	})

	it('offers an empty star on every row that is not the default', () => {
		const { container } = openPicker([provider({ models: ['gemma-4-12B-it', 'Qwen3.6-27B-MTP'] })], null, {
			providerId: 'local',
			modelId: 'Qwen3.6-27B-MTP',
		})

		const [gemma, qwen] = rows(container)
		const offered = gemma?.querySelector('button.popover__item-star')
		expect(offered?.getAttribute('aria-label')).toBe('Make gemma-4-12B-it the default model')
		expect(offered?.getAttribute('title')).toBe('Make default')
		// The default itself is the filled, read-only star Settings shows.
		expect(qwen?.querySelector('button.popover__item-star')).toBeNull()
		expect(qwen?.querySelector('.popover__item-star--on')?.getAttribute('aria-label')).toBe('Default model')
	})

	it('sets the default with one click, without picking the model or closing the menu', () => {
		const ref = { providerId: 'local', modelId: 'gemma-4-12B-it' }
		const { container, onDefaultChange, onSelect } = openPicker([provider()])

		fireEvent.click(container.querySelector('button.popover__item-star') as HTMLElement)
		expect(onDefaultChange).toHaveBeenCalledWith(ref)
		// A default is about future chats; it does not move this chat or dismiss the menu.
		expect(onSelect).not.toHaveBeenCalled()
		expect(container.querySelector('.popover')).not.toBeNull()
	})

	it('shows no loaded mark when the server said nothing about the model', () => {
		const { container } = openPicker([provider({ models: ['mystery-llm'] })])

		const [row] = rows(container)
		expect(row?.querySelector('.popover__item-loaded')).toBeNull()
	})

	it('keeps the search filter over the richer rows', () => {
		const { container } = openPicker([provider({ models: ['gemma-4-12B-it', 'Qwen3.6-27B-MTP'] })])

		fireEvent.change(container.querySelector('.popover__header input') as HTMLElement, {
			target: { value: 'qwen' },
		})
		expect(rows(container).map((row) => row.querySelector('.popover__item-main')?.textContent)).toEqual([
			'Qwen3.6-27B-MTP',
		])
	})

	it('marks a provider reached over plain HTTP, and only the one off this machine', () => {
		const { container } = openPicker([
			provider({ id: 'lan', label: 'Mac mini server', baseURL: 'http://mac-mini.localdomain:8080/v1' }),
			provider({ id: 'local', label: 'This machine', baseURL: 'http://127.0.0.1:9931/v1' }),
		])

		const labels = [...container.querySelectorAll<HTMLElement>('.popover__group-label')]
		// The glyph is not text, so the heading still reads as the server's name.
		expect(labels.map((label) => label.textContent)).toEqual(['Mac mini server', 'This machine'])

		const warnings = container.querySelectorAll('.popover__group-warning')
		expect(warnings).toHaveLength(1)
		expect(warnings[0]?.getAttribute('aria-label')).toBe(SECURITY_WARNING)
		expect(warnings[0]?.getAttribute('title')).toBe(SECURITY_WARNING)
		expect(labels[0]?.contains(warnings[0] as Node)).toBe(true)

		// The heading says it once for the whole group: a mark on every row would repeat it.
		expect(container.querySelector('.popover__item-warning')).toBeNull()
	})
})
