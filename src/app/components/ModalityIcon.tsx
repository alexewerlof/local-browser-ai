import { AudioLines, Image as ImageIcon, SquareLetterT, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModelModality } from '../../core/types'

/**
 * One glyph per modality. Settings → Providers and the model picker both show a model's
 * modalities, and a word would not fit either surface, so the glyph and its name live here
 * once rather than twice.
 */
export const MODALITY_ICONS: Record<ModelModality, { icon: LucideIcon; label: string }> = {
	text: { icon: SquareLetterT, label: 'text' },
	image: { icon: ImageIcon, label: 'image' },
	audio: { icon: AudioLines, label: 'audio' },
	video: { icon: Video, label: 'video' },
}

/**
 * One modality as its glyph. `labelled` names it in the tooltip and the accessibility tree;
 * a caller that groups several glyphs under one label (the picker) turns it off, so the
 * glyphs stay decorative and the group speaks for them.
 */
export function ModalityIcon({
	modality,
	size = 14,
	className,
	labelled = true,
}: {
	modality: ModelModality
	size?: number
	className?: string
	labelled?: boolean
}) {
	const { icon: Icon, label } = MODALITY_ICONS[modality]

	if (!labelled) {
		return (
			<span className={className} aria-hidden="true">
				<Icon size={size} />
			</span>
		)
	}

	return (
		<span className={className} role="img" aria-label={label} title={label}>
			<Icon size={size} />
		</span>
	)
}
