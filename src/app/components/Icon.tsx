import type { SVGProps } from 'react'

export type IconName =
	| 'plus'
	| 'history'
	| 'settings'
	| 'send'
	| 'stop'
	| 'close'
	| 'chevron-down'
	| 'chevron-right'
	| 'copy'
	| 'check'
	| 'external'
	| 'sparkle'
	| 'alert'
	| 'refresh'
	| 'trash'
	| 'download'
	| 'page'
	| 'search'
	| 'tool'
	| 'globe'
	| 'brain'
	| 'stop-circle'

const PATHS: Record<IconName, string[]> = {
	plus: ['M12 5v14', 'M5 12h14'],
	history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 3v5h5', 'M12 7v5l3 2'],
	settings: [
		'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
		'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z',
	],
	send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
	stop: ['M6 6h12v12H6z'],
	close: ['M18 6 6 18', 'M6 6l12 12'],
	'chevron-down': ['m6 9 6 6 6-6'],
	'chevron-right': ['m9 18 6-6-6-6'],
	copy: [
		'M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z',
		'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
	],
	check: ['m20 6-11 11-5-5'],
	external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3'],
	sparkle: [
		'M12 3v4',
		'M12 17v4',
		'M3 12h4',
		'M17 12h4',
		'm5.6 5.6 2.8 2.8',
		'm15.6 15.6 2.8 2.8',
		'm18.4 5.6-2.8 2.8',
		'm8.4 15.6-2.8 2.8',
	],
	alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
	refresh: ['M21 12a9 9 0 1 1-3-6.7', 'M21 3v6h-6'],
	trash: ['M3 6h18', 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
	download: ['M12 3v12', 'm7 11 5 5 5-5', 'M4 21h16'],
	page: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
	search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.3-4.3'],
	tool: ['M14.7 6.3a4 4 0 0 0 5 5L21 21H3l9.3-9.3a4 4 0 0 0 5-5z'],
	globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3 12h18', 'M12 3a15 15 0 0 1 0 18', 'M12 3a15 15 0 0 0 0 18'],
	brain: [
		'M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5.8V15a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z',
		'M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5.8V15a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z',
	],
	'stop-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9 9h6v6H9z'],
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
	name: IconName
	size?: number
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...rest}
		>
			{PATHS[name].map((path) => (
				<path key={path} d={path} />
			))}
		</svg>
	)
}
