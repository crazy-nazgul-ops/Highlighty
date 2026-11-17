type Props = {
  title: string
  authorName: string
  dirty: boolean
  onTitle: (title: string) => void
  onAuthor: (name: string) => void
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onExport: () => void
}

export function TopBar({ title, authorName, dirty, onTitle, onAuthor, onNew, onOpen, onSave, onExport }: Props) {
  return (
    <header className="topbar">
      <div className="brand">Highlighty</div>
      <input
        className="doc-title"
        aria-label="Document title"
        value={title}
        onChange={(event) => onTitle(event.target.value)}
      />
      <label className="author-field">
        <span>Your name</span>
        <input
          aria-label="Your name"
          placeholder="Your name"
          value={authorName}
          onChange={(event) => onAuthor(event.target.value)}
        />
      </label>
      <div className="top-actions">
        {dirty ? <span className="unsaved">Unsaved</span> : null}
        <button type="button" onClick={onNew}>
          New
        </button>
        <button type="button" onClick={onOpen}>
          Open
        </button>
        <button type="button" onClick={onSave}>
          Save
        </button>
        <button type="button" className="primary" onClick={onExport} title="Opens the print dialog. Choose Save as PDF.">
          Export PDF
        </button>
      </div>
    </header>
  )
}
