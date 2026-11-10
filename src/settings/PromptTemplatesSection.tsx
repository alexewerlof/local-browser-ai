import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { AppSettings, PromptTemplate } from '../core/types'
import { builtInPromptTemplates } from '../core/settings'
import { createId } from '../core/util'
import { updateSettings } from '../state/settings'
import { TextAreaField, TextField } from './fields'
import { SettingsCard } from './SettingsCard'

export function PromptTemplatesSection({ settings }: { settings: AppSettings }) {
	const [adding, setAdding] = useState(false)
	const [draft, setDraft] = useState<PromptTemplate>({ id: '', name: '', description: '', prompt: '' })

	const updateTemplate = (template: PromptTemplate) =>
		updateSettings((current) => ({
			...current,
			promptTemplates: current.promptTemplates.map((entry) => (entry.id === template.id ? template : entry)),
		}))

	const removeTemplate = (id: string) =>
		updateSettings((current) => ({
			...current,
			promptTemplates: current.promptTemplates.filter((entry) => entry.id !== id),
		}))

	return (
		<div className="section">
			<p className="section__intro">
				Prompt templates are saved prompts. They appear in the composer under Templates and in the{' '}
				<code className="inline-code">/</code> menu. Picking one fills the message box so you can add details
				before sending; the model receives that text, and the template's name marks the message in this chat.
			</p>

			<SettingsCard title="Prompt templates">
				<div className="rows">
					{settings.promptTemplates.map((template) => {
						const original = builtInPromptTemplates.find((entry) => entry.id === template.id)
						return (
							<div key={template.id} className="row-item">
								<div className="row-item__text">
									<div className="row-item__title">
										{template.name}
										{template.builtIn && <span className="badge">built-in</span>}
									</div>
									<TextAreaField
										label="Prompt"
										value={template.prompt}
										rows={3}
										onChange={(prompt) => updateTemplate({ ...template, prompt })}
									/>
								</div>
								<div className="stack" style={{ gap: 'var(--space-2)' }}>
									{original && template.prompt !== original.prompt && (
										<button
											type="button"
											className="button button--ghost button--sm"
											onClick={() => updateTemplate({ ...template, prompt: original.prompt })}
										>
											Reset
										</button>
									)}
									{!template.builtIn && (
										<button
											type="button"
											className="button button--ghost button--icon button--sm"
											onClick={() => removeTemplate(template.id)}
											title="Delete template"
										>
											<Trash2 size={13} />
										</button>
									)}
								</div>
							</div>
						)
					})}
				</div>
			</SettingsCard>

			{adding ? (
				<SettingsCard title="New prompt template">
					<TextField label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
					<TextField
						label="Description"
						value={draft.description ?? ''}
						onChange={(description) => setDraft({ ...draft, description })}
					/>
					<TextAreaField
						label="Prompt"
						value={draft.prompt}
						rows={4}
						onChange={(prompt) => setDraft({ ...draft, prompt })}
						hint="The prompt is inserted into the composer so you can add details before sending."
					/>
					<div className="row" style={{ gap: 'var(--space-3)' }}>
						<button
							type="button"
							className="button button--primary"
							disabled={!draft.name.trim() || !draft.prompt.trim()}
							onClick={() => {
								updateSettings((current) => ({
									...current,
									promptTemplates: [
										...current.promptTemplates,
										{ ...draft, id: createId('template') },
									],
								}))
								setDraft({ id: '', name: '', description: '', prompt: '' })
								setAdding(false)
							}}
						>
							Add template
						</button>
						<button type="button" className="button button--ghost" onClick={() => setAdding(false)}>
							Cancel
						</button>
					</div>
				</SettingsCard>
			) : (
				<div className="section__action">
					<button type="button" className="button" onClick={() => setAdding(true)}>
						<Plus size={18} />
						Add template
					</button>
				</div>
			)}
		</div>
	)
}
