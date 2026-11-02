import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { AppSettings, Skill } from '../core/types'
import { builtInSkills } from '../core/settings'
import { createId } from '../core/util'
import { updateSettings } from '../state/settings'
import { TextAreaField, TextField } from './fields'
import { SettingsCard } from './SettingsCard'

export function SkillsSection({ settings }: { settings: AppSettings }) {
	const [adding, setAdding] = useState(false)
	const [draft, setDraft] = useState<Skill>({ id: '', name: '', description: '', prompt: '' })

	const updateSkill = (skill: Skill) =>
		updateSettings((current) => ({
			...current,
			skills: current.skills.map((entry) => (entry.id === skill.id ? skill : entry)),
		}))

	const removeSkill = (id: string) =>
		updateSettings((current) => ({
			...current,
			skills: current.skills.filter((entry) => entry.id !== id),
		}))

	return (
		<div className="section">
			<p className="section__intro">
				Skills are prompt templates. They appear in the composer under Skills and in the{' '}
				<code className="inline-code">/</code> menu. A skill fills the message box; the model sees the skill
				name attached to your message.
			</p>

			<SettingsCard title="Skills">
				<div className="rows">
					{settings.skills.map((skill) => {
						const original = builtInSkills.find((entry) => entry.id === skill.id)
						return (
							<div key={skill.id} className="row-item">
								<div className="row-item__text">
									<div className="row-item__title">
										{skill.name}
										{skill.builtIn && <span className="badge">built-in</span>}
									</div>
									<TextAreaField
										label="Prompt"
										value={skill.prompt}
										rows={3}
										onChange={(prompt) => updateSkill({ ...skill, prompt })}
									/>
								</div>
								<div className="stack" style={{ gap: 'var(--space-2)' }}>
									{original && skill.prompt !== original.prompt && (
										<button
											type="button"
											className="button button--ghost button--sm"
											onClick={() => updateSkill({ ...skill, prompt: original.prompt })}
										>
											Reset
										</button>
									)}
									{!skill.builtIn && (
										<button
											type="button"
											className="button button--ghost button--icon button--sm"
											onClick={() => removeSkill(skill.id)}
											title="Delete skill"
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
				<SettingsCard title="New skill">
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
									skills: [...current.skills, { ...draft, id: createId('skill') }],
								}))
								setDraft({ id: '', name: '', description: '', prompt: '' })
								setAdding(false)
							}}
						>
							Add skill
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
						Add skill
					</button>
				</div>
			)}
		</div>
	)
}
