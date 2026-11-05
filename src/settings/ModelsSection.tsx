import type { AppSettings } from '../core/types'
import { getModelInfo, normalizeThinking, thinkingOptions } from '../providers/catalog'
import { updateSettings } from '../state/settings'
import { Field, RangeField, SelectField } from './fields'
import { SettingsCard } from './SettingsCard'

export function ModelsSection({ settings }: { settings: AppSettings }) {
	const provider = settings.providers.find((entry) => entry.id === settings.defaultModel?.providerId)
	const modelId = settings.defaultModel?.modelId ?? ''
	const info = provider ? getModelInfo(provider.kind, modelId) : null
	const options = info && provider ? thinkingOptions(provider.kind, info) : [{ value: 'off' as const, label: 'Off' }]
	const thinking =
		info && provider
			? normalizeThinking(settings.modelDefaults.thinking, provider.kind, info)
			: { level: 'off' as const }

	const updateModel = (providerId: string, nextModelId: string) =>
		updateSettings((current) => ({ ...current, defaultModel: { providerId, modelId: nextModelId } }))

	return (
		<div className="section">
			<p className="section__intro">
				The default model is used for new chats. You can switch models per chat from the composer. Temperature
				and reasoning settings apply to every model unless you change them here.
			</p>

			<SettingsCard title="Default model">
				<div className="grid-2">
					<SelectField
						label="Provider"
						value={provider?.id ?? ''}
						options={settings.providers.map((entry) => ({ value: entry.id, label: entry.label }))}
						onChange={(providerId) => {
							const next = settings.providers.find((entry) => entry.id === providerId)
							updateModel(providerId, next?.models[0] ?? '')
						}}
					/>
					<SelectField
						label="Model"
						value={modelId}
						options={
							provider?.models.length
								? provider.models.map((id) => ({ value: id, label: id }))
								: [{ value: '', label: 'No models — add some under Providers' }]
						}
						onChange={(nextModelId) => provider && updateModel(provider.id, nextModelId)}
					/>
				</div>
				{info && (
					<div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
						<span className="badge">
							context{' '}
							{new Intl.NumberFormat().format(provider?.contextWindowOverride ?? info.contextWindow)}
						</span>
						<span className="badge">
							max out{' '}
							{new Intl.NumberFormat().format(provider?.maxOutputTokensOverride ?? info.maxOutputTokens)}
						</span>
						<span className="badge">{info.capabilities.tools ? 'tools' : 'no tools'}</span>
						<span className="badge">{info.capabilities.reasoning ? 'reasoning' : 'no reasoning'}</span>
					</div>
				)}
			</SettingsCard>

			<SettingsCard title="Generation">
				<RangeField
					label="Temperature"
					min={0}
					max={2}
					step={0.05}
					value={settings.modelDefaults.temperature}
					format={(value) => value.toFixed(2)}
					onChange={(temperature) =>
						updateSettings((current) => ({
							...current,
							modelDefaults: { ...current.modelDefaults, temperature },
						}))
					}
				/>
				<Field label="Max output tokens" hint="Leave empty to let the provider decide.">
					<input
						className="input"
						type="number"
						min={256}
						value={settings.modelDefaults.maxOutputTokens ?? ''}
						placeholder="auto"
						onChange={(event) =>
							updateSettings((current) => ({
								...current,
								modelDefaults: {
									...current.modelDefaults,
									maxOutputTokens: event.target.value ? Number(event.target.value) : undefined,
								},
							}))
						}
					/>
				</Field>
				<SelectField
					label="Reasoning effort"
					value={thinking.level}
					options={options.map((option) => ({ value: option.value, label: option.label }))}
					onChange={(level) =>
						updateSettings((current) => ({
							...current,
							modelDefaults: { ...current.modelDefaults, thinking: { level } },
						}))
					}
					hint={
						info?.capabilities.reasoning
							? 'Anthropic maps these to thinking budgets; OpenAI-style models map them to reasoning effort.'
							: 'This model does not expose a reasoning control.'
					}
				/>
			</SettingsCard>
		</div>
	)
}
