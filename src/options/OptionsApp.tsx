import { useState } from 'react'
import { Brain, Globe, Settings, Sparkles, Wrench, type LucideIcon } from 'lucide-react'
import { settingsStatusStore, settingsStore } from '../state/settings'
import { useStore } from '../app/useStore'
import { ProvidersSection } from './ProvidersSection'
import { ModelsSection } from './ModelsSection'
import { SkillsSection } from './SkillsSection'
import { ToolsSection } from './ToolsSection'
import { ContextSection } from './ContextSection'
import { GeneralSection } from './GeneralSection'

type SectionId = 'providers' | 'models' | 'skills' | 'tools' | 'context' | 'general'

const SECTIONS: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
	{ id: 'providers', label: 'Providers', icon: Globe },
	{ id: 'models', label: 'Models', icon: Sparkles },
	{ id: 'skills', label: 'Skills', icon: Sparkles },
	{ id: 'tools', label: 'Tools', icon: Wrench },
	{ id: 'context', label: 'Context', icon: Brain },
	{ id: 'general', label: 'General', icon: Settings },
]

export function OptionsApp() {
	const status = useStore(settingsStatusStore)
	const settings = useStore(settingsStore)
	const [section, setSection] = useState<SectionId>('providers')

	if (status !== 'ready') return <div className="boot">Loading settings…</div>

	return (
		<div className="options">
			<nav className="options__nav" aria-label="Settings sections">
				<div className="options__brand">
					<Settings size={20} />
					<span className="options__brand-label">Settings</span>
				</div>
				{SECTIONS.map((entry) => (
					<button
						key={entry.id}
						type="button"
						className={`options__nav-item${section === entry.id ? ' options__nav-item--active' : ''}`}
						aria-current={section === entry.id ? 'page' : undefined}
						title={entry.label}
						onClick={() => setSection(entry.id)}
					>
						<entry.icon size={20} />
						<span className="options__nav-label">{entry.label}</span>
					</button>
				))}
			</nav>

			<main className="options__content">
				<div className="options__column">
					{section === 'providers' && <ProvidersSection settings={settings} />}
					{section === 'models' && <ModelsSection settings={settings} />}
					{section === 'skills' && <SkillsSection settings={settings} />}
					{section === 'tools' && <ToolsSection settings={settings} />}
					{section === 'context' && <ContextSection settings={settings} />}
					{section === 'general' && <GeneralSection settings={settings} />}
				</div>
			</main>
		</div>
	)
}
