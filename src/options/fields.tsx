import type { ReactNode } from 'react'

export function Field({
	label,
	hint,
	children,
	stacked,
}: {
	label: string
	hint?: ReactNode
	children: ReactNode
	stacked?: boolean
}) {
	return (
		<label className={`field${stacked ? ' field--stacked' : ''}`}>
			<span className="field__text">
				<span className="field__label">{label}</span>
				{hint && <span className="field__hint">{hint}</span>}
			</span>
			{children}
		</label>
	)
}

export function TextField({
	label,
	value,
	onChange,
	placeholder,
	hint,
	type = 'text',
}: {
	label: string
	value: string
	onChange: (value: string) => void
	placeholder?: string
	hint?: ReactNode
	type?: 'text' | 'password' | 'url'
}) {
	return (
		<Field label={label} hint={hint}>
			<input
				className="input"
				type={type}
				value={value}
				placeholder={placeholder}
				onChange={(event) => onChange(event.target.value)}
				spellCheck={false}
				autoComplete="off"
			/>
		</Field>
	)
}

export function TextAreaField({
	label,
	value,
	onChange,
	rows = 6,
	hint,
	placeholder,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	rows?: number
	hint?: ReactNode
	placeholder?: string
}) {
	return (
		<Field label={label} hint={hint} stacked>
			<textarea
				className="textarea"
				rows={rows}
				value={value}
				placeholder={placeholder}
				onChange={(event) => onChange(event.target.value)}
				spellCheck={false}
			/>
		</Field>
	)
}

export function SelectField<T extends string>({
	label,
	value,
	options,
	onChange,
	hint,
}: {
	label: string
	value: T
	options: Array<{ value: T; label: string }>
	onChange: (value: T) => void
	hint?: ReactNode
}) {
	return (
		<Field label={label} hint={hint}>
			<select className="select" value={value} onChange={(event) => onChange(event.target.value as T)}>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</Field>
	)
}

export function RangeField({
	label,
	value,
	min,
	max,
	step,
	format,
	onChange,
	hint,
}: {
	label: string
	value: number
	min: number
	max: number
	step: number
	format?: (value: number) => string
	onChange: (value: number) => void
	hint?: ReactNode
}) {
	return (
		<Field label={label} hint={hint}>
			<div className="range">
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					onChange={(event) => onChange(Number(event.target.value))}
				/>
				<span className="range__value">{format ? format(value) : String(value)}</span>
			</div>
		</Field>
	)
}

export function Switch({
	label,
	checked,
	disabled,
	onChange,
}: {
	label: string
	checked: boolean
	disabled?: boolean
	onChange: (checked: boolean) => void
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			className="switch"
			disabled={disabled}
			onClick={() => onChange(!checked)}
		>
			<span className="switch__knob" />
		</button>
	)
}
