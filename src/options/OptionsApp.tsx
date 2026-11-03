import { useState } from 'react'
import {
	Brain,
	CpuAi,
	GraduationCap,
	MemoryStick,
	PocketKnife,
	Settings,
	Sparkles,
	Wrench,
	type LucideIcon,
} from 'lucide-react'
import { extensionUrl, getManifest } from '../platform/chrome'
import { settingsStatusStore, settingsStore } from '../state/settings'
import { useStore } from '../app/useStore'
import { ProvidersSection } from './ProvidersSection'
import { ModelsSection } from './ModelsSection'
import { SkillsSection } from './SkillsSection'
import { BuiltInToolsSection } from './BuiltInToolsSection'
import { McpSection } from './McpSection'
import { MemorySection } from './MemorySection'
import { ContextSection } from './ContextSection'
import { GeneralSection } from './GeneralSection'

type SectionId = 'providers' | 'models' | 'skills' | 'tools' | 'mcp' | 'memory' | 'context' | 'general'

const SECTIONS: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
	{ id: 'general', label: 'General', icon: Settings },
	{ id: 'providers', label: 'Providers', icon: CpuAi },
	{ id: 'models', label: 'Models', icon: Sparkles },
	{ id: 'skills', label: 'Skills', icon: GraduationCap },
	{ id: 'tools', label: 'Built-in Tools', icon: Wrench },
	{ id: 'mcp', label: 'MCP', icon: PocketKnife },
	{ id: 'memory', label: 'Memory', icon: MemoryStick },
	{ id: 'context', label: 'Context', icon: Brain },
]

export function OptionsApp() {
	const status = useStore(settingsStatusStore)
	const settings = useStore(settingsStore)
	const [section, setSection] = useState<SectionId>('general')
	const manifest = getManifest()

	if (status !== 'ready') return <div className="boot">Loading settings…</div>

	return (
		<div className="options">
			<nav className="options__nav" aria-label="Settings sections">
				<div className="options__brand">
					<img
						className="options__brand-icon"
						src={extensionUrl('images/icon-32.png')}
						alt=""
						width={24}
						height={24}
					/>
					<span className="options__brand-label">{manifest.name}</span>
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
					{section === 'general' && <GeneralSection settings={settings} />}
					{section === 'providers' && <ProvidersSection settings={settings} />}
					{section === 'models' && <ModelsSection settings={settings} />}
					{section === 'skills' && <SkillsSection settings={settings} />}
					{section === 'tools' && <BuiltInToolsSection settings={settings} />}
					{section === 'mcp' && <McpSection settings={settings} />}
					{section === 'memory' && <MemorySection settings={settings} />}
					{section === 'context' && <ContextSection settings={settings} />}
				</div>
			</main>
		</div>
	)
}
