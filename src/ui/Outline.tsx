import type { OutlineEntry } from '../editor/outline'

type Props = {
  entries: OutlineEntry[]
  activePos: number | null
  onJump: (pos: number) => void
}

export function Outline({ entries, activePos, onJump }: Props) {
  return (
    <aside className="outline no-print">
      <div className="outline-head">
        <h2>Outline</h2>
        <p>Jump between chapters and the headings under them.</p>
      </div>
      {entries.length === 0 ? (
        <p className="outline-empty">Chapter headings you paste show up here.</p>
      ) : (
        <nav className="outline-list" aria-label="Outline">
          {entries.map((entry) => (
            <button
              key={entry.pos}
              type="button"
              className={entry.pos === activePos ? 'outline-item is-active' : 'outline-item'}
              style={{ paddingLeft: 10 + Math.max(0, entry.level - 1) * 12 }}
              title={entry.text}
              onClick={() => onJump(entry.pos)}
            >
              <span className="outline-level">H{entry.level}</span>
              <span className="outline-text">{entry.text}</span>
            </button>
          ))}
        </nav>
      )}
    </aside>
  )
}
