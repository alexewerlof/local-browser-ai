// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { AppSettings, ModelRef, ProviderSettings } from '../../core/types'
import { defaultSettings } from '../../core/settings'
import { ModelPicker } from './ModelPicker'

afterEach(cleanup)

function provider(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
	return {
		id: 'local',
		label: 'Fake local server',
		models: ['gemma-4-12B-it'],
		...overrides,
	}
}

function openPicker(providers: ProviderSettings[], current: ModelRef | null = null) {
	const settings: AppSettings = { ...defaultSettings(), providers }
	const onSelect = vi.fn()
	const view = render(<ModelPicker settings={settings} current={current} onSelect={onSelect} />)
	fireEvent.click(view.container.querySelector('.chip--model') as HTMLElement)
	return { ...view, onSelect }
}

function rows(container: HTMLElement): HTMLElement[] {
	return [...container.querySelectorAll<HTMLElement>('.popover__item--model')]
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
		const { container } = openPicker([provider({ models: ['Qwen3.6-27B-MTP'] })])

		const [row] = rows(container)
		expect(row?.querySelector('.popover__item-reasoning')?.textContent).toBe('Reasoning')
	})

	it('marks the current model and closes on a pick', () => {
		const ref = { providerId: 'local', modelId: 'gemma-4-12B-it' }
		const { container, onSelect } = openPicker([provider()], ref)

		const [row] = rows(container)
		expect(row?.className).toMatch(/popover__item--selected/)
		// The tick sits on the first line, beside the figures.
		expect(row?.querySelector('.popover__item-row > svg')).not.toBeNull()

		fireEvent.click(row as HTMLElement)
		expect(onSelect).toHaveBeenCalledWith(ref)
		expect(container.querySelector('.popover')).toBeNull()
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
})
