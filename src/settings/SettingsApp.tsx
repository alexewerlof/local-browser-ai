import { useEffect, useState } from 'react'
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
import {
	SETTINGS_SECTIONS,
	parseSettingsHash,
	settingsSectionHash,
	type SettingsSectionId,
} from '../core/settings-routes'
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

/** Every section needs an icon; a missing entry is a type error rather than a blank rail. */
const SECTION_ICONS: Record<SettingsSectionId, LucideIcon> = {
	general: Settings,
	providers: CpuAi,
	models: Sparkles,
	skills: GraduationCap,
	tools: Wrench,
	mcp: PocketKnife,
	memory: MemoryStick,
	context: Brain,
}

export function SettingsApp() {
	const status = useStore(settingsStatusStore)
	const settings = useStore(settingsStore)
	const [section, setSection] = useState<SettingsSectionId>(() => parseSettingsHash(window.location.hash))
	const manifest = getManifest()

	useEffect(() => {
		// Rewrite a hand-typed or stale fragment so the URL always names the open section.
		// `replaceState` leaves no history entry, so Back still walks the sections the user
		// actually visited.
		const sync = () => {
			const next = parseSettingsHash(window.location.hash)
			const canonical = settingsSectionHash(next)
			if (window.location.hash !== canonical) window.history.replaceState(null, '', canonical)
			setSection(next)
		}
		sync()
		// `hashchange` covers an URL edited by hand; `popstate` covers Back and Forward.
		window.addEventListener('hashchange', sync)
		window.addEventListener('popstate', sync)
		return () => {
			window.removeEventListener('hashchange', sync)
			window.removeEventListener('popstate', sync)
		}
	}, [])

	const openSection = (id: SettingsSectionId) => {
		const hash = settingsSectionHash(id)
		if (window.location.hash !== hash) window.history.pushState(null, '', hash)
		setSection(id)
	}

	if (status !== 'ready') return <div className="boot">Loading settings…</div>

	return (
		<div className="settings">
			<nav className="settings__nav" aria-label="Settings sections">
				<div className="settings__brand">
					<img
						className="settings__brand-icon"
						src={extensionUrl('images/icon-32.png')}
						alt=""
						width={24}
						height={24}
					/>
					<span className="settings__brand-label">{manifest.name}</span>
				</div>
				{SETTINGS_SECTIONS.map((entry) => {
					const Icon = SECTION_ICONS[entry.id]
					return (
						<button
							key={entry.id}
							type="button"
							className={`settings__nav-item${section === entry.id ? ' settings__nav-item--active' : ''}`}
							aria-current={section === entry.id ? 'page' : undefined}
							title={entry.label}
							onClick={() => openSection(entry.id)}
						>
							<Icon size={20} />
							<span className="settings__nav-label">{entry.label}</span>
						</button>
					)
				})}
			</nav>

			<main className="settings__content">
				<div className="settings__column">
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
