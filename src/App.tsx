import { useRef } from 'react'
import { EditorContent } from '@tiptap/react'
import { useManuscript } from './model/useManuscript'
import { CommentMargin } from './ui/CommentMargin'
import { FormatBar } from './ui/FormatBar'
import { LayerPanel } from './ui/LayerPanel'
import { TopBar } from './ui/TopBar'

export default function App() {
  const manuscript = useManuscript()
  const fileRef = useRef<HTMLInputElement>(null)
  const editor = manuscript.editor

  return (
    <div className="app">
      <TopBar
        title={manuscript.title}
        authorName={manuscript.authorName}
        dirty={manuscript.dirty}
        onTitle={manuscript.setTitle}
        onAuthor={manuscript.setAuthorName}
        onNew={manuscript.newDocument}
        onOpen={() => {
          if (
            manuscript.dirty &&
            !window.confirm('Open a manuscript? This replaces the text, highlights, and comments on the page.')
          ) {
            return
          }
          fileRef.current?.click()
        }}
        onSave={manuscript.saveFile}
        onExport={manuscript.exportPdf}
      />
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          file.text().then((raw) => {
            if (!manuscript.openText(raw)) {
              window.alert('That file is not a manuscript this app can open.')
            }
          })
        }}
      />
      <div className="workspace">
        <div className="manuscript-column">
          <FormatBar
            format={manuscript.format}
            commentsVisible={manuscript.commentsVisible}
            commentCount={manuscript.comments.length}
            onItalic={() => manuscript.toggleMark('italic')}
            onBold={() => manuscript.toggleMark('bold')}
            onCenter={manuscript.toggleCenter}
            onIndent={manuscript.toggleIndent}
            onComment={manuscript.addComment}
            onToggleComments={() => manuscript.setCommentsVisible((visible) => !visible)}
          />
          <div className="scroll">
            <div className="sheet">
              <div
                className={manuscript.paintLayerId ? 'page is-painting' : 'page'}
                style={
                  manuscript.paintLayerId
                    ? {
                        boxShadow: `inset 0 0 0 3px ${
                          manuscript.layers.find((layer) => layer.id === manuscript.paintLayerId)?.color ?? '#e2b340'
                        }, 0 1px 1px rgba(40, 30, 20, 0.04), 0 18px 50px rgba(60, 40, 20, 0.12)`,
                      }
                    : undefined
                }
              >
                {editor?.isEmpty ? <div className="paste-hint">Paste your manuscript here.</div> : null}
                <EditorContent editor={editor} />
              </div>
              <CommentMargin
                editor={editor}
                comments={manuscript.comments}
                visible={manuscript.commentsVisible}
                activeId={manuscript.activeCommentId}
                freshId={manuscript.freshCommentId}
                revision={manuscript.revision}
                onActivate={manuscript.setActiveCommentId}
                onChange={manuscript.updateComment}
                onDelete={manuscript.deleteComment}
                onReveal={manuscript.revealComment}
                onFreshHandled={() => manuscript.setFreshCommentId(null)}
              />
            </div>
          </div>
        </div>
        <LayerPanel
          layers={manuscript.layers}
          activeId={manuscript.activeLayerId}
          paintId={manuscript.paintLayerId}
          exportNotice={manuscript.exportNotice}
          selectionEmpty={manuscript.format.empty}
          selectionCovered={manuscript.selectionCovered}
          onAdd={manuscript.addLayer}
          onSelect={manuscript.setActiveLayerId}
          onRename={manuscript.renameLayer}
          onColor={manuscript.recolorLayer}
          onOpacity={manuscript.setLayerOpacity}
          onToggleVisible={manuscript.toggleLayerVisible}
          onTogglePaint={manuscript.togglePaintLayer}
          onExport={manuscript.exportLayerExcerpts}
          onDelete={manuscript.deleteLayer}
          onReorder={manuscript.reorderLayers}
          onHighlight={manuscript.highlightSelection}
        />
      </div>
    </div>
  )
}
