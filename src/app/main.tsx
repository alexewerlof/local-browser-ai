import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
