import { useEffect, useState } from 'react'
import {
	BookMarked,
	CpuAi,
	MemoryStick,
	Notebook,
	Palette,
	Puzzle,
	Settings,
	Shield,
	SquareArrowOutUpRight,
	Wrench,
	type LucideIcon,
} from 'lucide-react'
import {
	SETTINGS_SECTIONS,
	parseSettingsHash,
	settingsSectionHash,
	type SettingsSectionId,
} from '../core/settings-routes'
import {
	extensionSiteDetailsUrl,
	extensionUrl,
	getManifest,
	openExtensionSiteDetails,
	openPlatformSettings,
	platformSettingsUrl,
} from '../platform/chrome'
import { settingsStatusStore, settingsStore } from '../state/settings'
import { useStore } from '../app/useStore'
import { ProvidersSection } from './ProvidersSection'
import { PromptTemplatesSection } from './PromptTemplatesSection'
import { ToolsSection } from './ToolsSection'
import { MemorySection } from './MemorySection'
import { ContextSection } from './ContextSection'
import { GeneralSection } from './GeneralSection'
import { AppearanceSection } from './AppearanceSection'

/** Every section needs an icon; a missing entry is a type error rather than a blank rail. */
const SECTION_ICONS: Record<SettingsSectionId, LucideIcon> = {
	general: Settings,
	appearance: Palette,
	providers: CpuAi,
	'prompt-templates': BookMarked,
	tools: Wrench,
	memory: MemoryStick,
	context: Notebook,
}

/* Two rail rows leave Settings for Chrome's own pages: shortcuts, updates and site access live
 * there and cannot be reproduced here. Neither is a section — no hash, no `SETTINGS_SECTIONS`
 * entry — so they are labelled and rendered after the divider, as the last rows of the menu. */
const RAIL_LINK_UNAVAILABLE = 'Available in the installed extension.'

interface RailLink {
	label: string
	/** The row's own icon, leading it like a section row's icon and never replaced. */
	icon: LucideIcon
	/** `null` on the plain-web dev page, which has no extension id to name. */
	url: string | null
	open: () => Promise<void>
}

function railLinks(): RailLink[] {
	return [
		{
			label: 'Platform Settings…',
			icon: Puzzle,
			url: platformSettingsUrl(),
			open: openPlatformSettings,
		},
		{
			label: 'Privacy and security…',
			icon: Shield,
			url: extensionSiteDetailsUrl(),
			open: openExtensionSiteDetails,
		},
	]
}

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
				<hr className="settings__divider" />
				{railLinks().map((link) => {
					const Icon = link.icon
					// A row with no URL has no id to name, so it stays visible but inert.
					const available = link.url !== null
					return (
						<button
							key={link.label}
							type="button"
							className="settings__nav-action"
							title={available ? link.label : RAIL_LINK_UNAVAILABLE}
							aria-label={link.label}
							disabled={!available}
							onClick={() => void link.open()}
						>
							<Icon size={20} />
							<span className="settings__nav-label">{link.label}</span>
							{/* Leaving Settings for a Chrome page is said by a trailing external-link glyph,
							 * the way Chrome marks its own Extensions row. It goes with the label when the
							 * rail collapses to icons. */}
							<SquareArrowOutUpRight size={16} className="settings__nav-icon--trailing" />
						</button>
					)
				})}
			</nav>

			<main className="settings__content">
				<div className="settings__column">
					{section === 'general' && <GeneralSection settings={settings} />}
					{section === 'appearance' && <AppearanceSection settings={settings} />}
					{section === 'providers' && <ProvidersSection settings={settings} />}
					{section === 'prompt-templates' && <PromptTemplatesSection settings={settings} />}
					{section === 'tools' && <ToolsSection settings={settings} />}
					{section === 'memory' && <MemorySection settings={settings} />}
					{section === 'context' && <ContextSection settings={settings} />}
				</div>
			</main>
		</div>
	)
}
