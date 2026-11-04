import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tailwind first: its theme layer defines the same `--radius-*` / `--text-*` properties
// as tokens.css, and the unlayered tokens must win (see tailwind.css).
import './tailwind.css'
import '../styles/tokens.css'
import '../styles/base.css'
import './app.css'
import { App } from './App'
import { bootstrap } from '../state/bootstrap'

const container = document.getElementById('root')
if (container) {
	createRoot(container).render(
		<StrictMode>
			<App />
		</StrictMode>,
	)
}

void bootstrap()
