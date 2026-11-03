import type { AppSettings } from '../core/types'
import { McpServersCard } from './McpServersCard'

/**
 * MCP servers are configured on their own settings page: they are a separate source of
 * tools from a separate machine, with their own network access, trust and failure modes.
 */
export function McpSection({ settings }: { settings: AppSettings }) {
	return (
		<div className="section">
			<p className="section__intro">
				MCP servers add tools that run outside the browser. Only Streamable HTTP endpoints are supported. Tools
				are requested fresh for each message, and their output is treated as untrusted data: the model reads it
				but never follows instructions inside it.
			</p>

			<McpServersCard settings={settings} />

			<div className="notice">
				Each call asks for approval unless you mark the server as trusted. A server that is unreachable is
				skipped with a warning; the message is still sent.
			</div>
		</div>
	)
}
