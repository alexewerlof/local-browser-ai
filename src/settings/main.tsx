import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import '../styles/base.css'
import './settings.css'
import { SettingsApp } from './SettingsApp'
import { initSettings } from '../state/settings'
import { initMemory } from '../state/memory'

const container = document.getElementById('root')
if (container) {
	createRoot(container).render(
		<StrictMode>
			<SettingsApp />
		</StrictMode>,
	)
}

void initSettings()
void initMemory()
