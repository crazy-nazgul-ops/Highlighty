import type { FormatState } from '../model/useManuscript'

type Props = {
  format: FormatState
  commentsVisible: boolean
  commentCount: number
  onItalic: () => void
  onBold: () => void
  onHeading: (level: 1 | 2 | 3) => void
  onCenter: () => void
  onIndent: () => void
  onComment: () => void
  onToggleComments: () => void
}

export function FormatBar({
  format,
  commentsVisible,
  commentCount,
  onItalic,
  onBold,
  onHeading,
  onCenter,
  onIndent,
  onComment,
  onToggleComments,
}: Props) {
  return (
    <div className="format-bar">
      <div className="format-group">
        <button type="button" aria-pressed={format.italic} onClick={onItalic}>
          Italic
        </button>
        <button type="button" aria-pressed={format.bold} onClick={onBold}>
          Bold
        </button>
        <button type="button" aria-pressed={format.heading === 1} onClick={() => onHeading(1)} title="Chapter">
          H1
        </button>
        <button type="button" aria-pressed={format.heading === 2} onClick={() => onHeading(2)} title="Subchapter">
          H2
        </button>
        <button type="button" aria-pressed={format.heading === 3} onClick={() => onHeading(3)} title="Section">
          H3
        </button>
        <button type="button" aria-pressed={format.center} onClick={onCenter}>
          Center
        </button>
        <button type="button" aria-pressed={format.indent} onClick={onIndent}>
          Indent
        </button>
      </div>
      <div className="format-group">
        <button type="button" onClick={onComment}>
          Comment
        </button>
        <button type="button" aria-pressed={commentsVisible} onClick={onToggleComments}>
          {commentsVisible ? 'Hide comments' : 'Show comments'}
          {commentCount > 0 ? <span className="count">{commentCount}</span> : null}
        </button>
      </div>
    </div>
  )
}
