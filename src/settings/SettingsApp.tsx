import { useEffect, useState } from 'react'
import {
	CpuAi,
	GraduationCap,
	MemoryStick,
	Notebook,
	Palette,
	PocketKnife,
	Puzzle,
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
import { extensionUrl, getManifest, openPlatformSettings, platformSettingsUrl } from '../platform/chrome'
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
import { AppearanceSection } from './AppearanceSection'

/** Every section needs an icon; a missing entry is a type error rather than a blank rail. */
const SECTION_ICONS: Record<SettingsSectionId, LucideIcon> = {
	general: Settings,
	appearance: Palette,
	providers: CpuAi,
	models: Sparkles,
	skills: GraduationCap,
	tools: Wrench,
	mcp: PocketKnife,
	memory: MemoryStick,
	context: Notebook,
}

/* The rail footer points at Chrome's own page for this extension: shortcuts, site access and
 * updates live there and cannot be reproduced here. It is not a section — no hash, no
 * `SETTINGS_SECTIONS` entry — so it is labelled and rendered on its own. */
const PLATFORM_SETTINGS_LABEL = 'Platform Settings…'
const PLATFORM_SETTINGS_HINT = 'Keyboard shortcuts, site access and updates live in Chrome.'
const PLATFORM_SETTINGS_UNAVAILABLE = 'Available in the installed extension.'

/**
 * The canonical URL of a section: the bare page for General, `#<id>` for anything else.
 *
 * Built through `URL` because assigning an empty string to `hash` *removes* the fragment,
 * whereas `history.replaceState(null, '', '')` would resolve to the page root and lose the
 * whole file name.
 */
function sectionUrl(section: SettingsSectionId): string {
	const url = new URL(window.location.href)
	url.hash = settingsSectionHash(section)
	return url.href
}

export function SettingsApp() {
	const status = useStore(settingsStatusStore)
	const settings = useStore(settingsStore)
	const [section, setSection] = useState<SettingsSectionId>(() => parseSettingsHash(window.location.hash))
	const manifest = getManifest()
	// `null` on the plain-web dev page, which has no extension id to open.
	const platformSettings = platformSettingsUrl()

	useEffect(() => {
		// Rewrite a hand-typed or stale fragment so the URL always names the open section.
		// `replaceState` leaves no history entry, so Back still walks the sections the user
		// actually visited.
		const sync = () => {
			const next = parseSettingsHash(window.location.hash)
			const canonical = sectionUrl(next)
			if (window.location.href !== canonical) window.history.replaceState(null, '', canonical)
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
		const url = sectionUrl(id)
		if (window.location.href !== url) window.history.pushState(null, '', url)
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
				<div className="settings__footer">
					<button
						type="button"
						className="settings__nav-action"
						title={platformSettings === null ? PLATFORM_SETTINGS_UNAVAILABLE : PLATFORM_SETTINGS_LABEL}
						aria-label={PLATFORM_SETTINGS_LABEL}
						disabled={platformSettings === null}
						onClick={() => void openPlatformSettings()}
					>
						<Puzzle size={20} />
						<span className="settings__nav-label">{PLATFORM_SETTINGS_LABEL}</span>
					</button>
					<p className="settings__footer-hint">
						{platformSettings === null ? PLATFORM_SETTINGS_UNAVAILABLE : PLATFORM_SETTINGS_HINT}
					</p>
				</div>
			</nav>

			<main className="settings__content">
				<div className="settings__column">
					{section === 'general' && <GeneralSection settings={settings} />}
					{section === 'appearance' && <AppearanceSection settings={settings} />}
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
