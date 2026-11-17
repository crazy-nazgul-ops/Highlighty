import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { findCommentAnchors } from '../editor/comments'
import { formatWhen } from '../model/document'
import type { Comment } from '../model/types'

type Props = {
  editor: Editor | null
  comments: Comment[]
  visible: boolean
  activeId: string | null
  freshId: string | null
  revision: number
  onActivate: (id: string) => void
  onChange: (id: string, text: string) => void
  onDelete: (id: string) => void
  onReveal: (id: string) => void
  onFreshHandled: () => void
}

function sameTops(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => Math.round(left[key] ?? 0) === Math.round(right[key] ?? 0))
}

export function CommentMargin({
  editor,
  comments,
  visible,
  activeId,
  freshId,
  revision,
  onActivate,
  onChange,
  onDelete,
  onReveal,
  onFreshHandled,
}: Props) {
  const gutterRef = useRef<HTMLElement>(null)
  const bubbleRefs = useRef(new Map<string, HTMLDivElement>())
  const [tops, setTops] = useState<Record<string, number>>({})

  useLayoutEffect(() => {
    if (!editor || !visible) return
    const gutter = gutterRef.current
    if (!gutter) return

    const measure = () => {
      const gutterTop = gutter.getBoundingClientRect().top
      const anchors = findCommentAnchors(editor.state.doc)
      const raw = anchors
        .filter((anchor) => comments.some((comment) => comment.id === anchor.id))
        .map((anchor) => {
          try {
            const pos = Math.max(0, Math.min(anchor.pos, editor.state.doc.content.size))
            const coords = editor.view.coordsAtPos(pos)
            return { id: anchor.id, ideal: coords.top - gutterTop }
          } catch {
            return { id: anchor.id, ideal: 0 }
          }
        })
        .sort((left, right) => left.ideal - right.ideal)

      let cursor = 0
      const next: Record<string, number> = {}
      for (const item of raw) {
        const height = bubbleRefs.current.get(item.id)?.offsetHeight ?? 140
        const top = Math.max(0, item.ideal, cursor)
        next[item.id] = top
        cursor = top + height + 10
      }
      setTops((current) => (sameTops(current, next) ? current : next))
    }

    measure()
    const frame = window.requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    if (gutter.parentElement) observer.observe(gutter.parentElement)
    const scroll = gutter.closest('.scroll')
    window.addEventListener('resize', measure)
    window.addEventListener('beforeprint', measure)
    scroll?.addEventListener('scroll', measure)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('beforeprint', measure)
      scroll?.removeEventListener('scroll', measure)
    }
  }, [comments, editor, revision, visible, activeId])

  const ordered = [...comments].sort((left, right) => (tops[left.id] ?? 0) - (tops[right.id] ?? 0))

  return (
    <aside ref={gutterRef} className={visible ? 'gutter' : 'gutter is-collapsed'} aria-label="Comments">
      {visible
        ? ordered.map((comment) => (
            <CommentBubble
              key={comment.id}
              comment={comment}
              top={tops[comment.id] ?? 0}
              active={comment.id === activeId}
              fresh={comment.id === freshId}
              onActivate={onActivate}
              onChange={onChange}
              onDelete={onDelete}
              onReveal={onReveal}
              onFreshHandled={onFreshHandled}
              bubbleRef={(node) => {
                if (node) bubbleRefs.current.set(comment.id, node)
                else bubbleRefs.current.delete(comment.id)
              }}
            />
          ))
        : null}
    </aside>
  )
}

function CommentBubble({
  comment,
  top,
  active,
  fresh,
  onActivate,
  onChange,
  onDelete,
  onReveal,
  onFreshHandled,
  bubbleRef,
}: {
  comment: Comment
  top: number
  active: boolean
  fresh: boolean
  onActivate: (id: string) => void
  onChange: (id: string, text: string) => void
  onDelete: (id: string) => void
  onReveal: (id: string) => void
  onFreshHandled: () => void
  bubbleRef: (node: HTMLDivElement | null) => void
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const freshHandledRef = useRef(onFreshHandled)
  freshHandledRef.current = onFreshHandled

  useEffect(() => {
    if (!fresh) return
    areaRef.current?.focus()
    freshHandledRef.current()
  }, [fresh])

  return (
    <div
      ref={bubbleRef}
      className={active ? 'bubble is-active' : 'bubble'}
      style={{ top }}
      data-bubble={comment.id}
      onMouseDown={(event) => {
        onActivate(comment.id)
        const target = event.target as HTMLElement
        if (target.closest('button')) return
        onReveal(comment.id)
        if (!target.closest('textarea')) areaRef.current?.focus()
      }}
    >
      <header>
        <strong>{comment.author}</strong>
        <time dateTime={comment.createdAt}>{formatWhen(comment.createdAt)}</time>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(comment.id)
          }}
        >
          Delete
        </button>
      </header>
      <textarea
        ref={areaRef}
        aria-label={`Comment by ${comment.author}`}
        placeholder="Write a note..."
        value={comment.text}
        onChange={(event) => onChange(comment.id, event.target.value)}
        onFocus={() => onActivate(comment.id)}
      />
    </div>
  )
}
