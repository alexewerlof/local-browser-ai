import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import '../styles/base.css'
import './options.css'
import { OptionsApp } from './OptionsApp'
import { initSettings } from '../state/settings'

const container = document.getElementById('root')
if (container) {
	createRoot(container).render(
		<StrictMode>
			<OptionsApp />
		</StrictMode>,
	)
}

void initSettings()
