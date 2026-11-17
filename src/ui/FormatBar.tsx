import type { FormatState } from '../model/useManuscript'

type Props = {
  format: FormatState
  commentsVisible: boolean
  commentCount: number
  onItalic: () => void
  onBold: () => void
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
