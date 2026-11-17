import { Mark, Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { readIds } from './markIds'

export const CommentRange = Mark.create({
  name: 'commentRange',
  inclusive: false,
  excludes: 'commentRange',
  addAttributes() {
    return {
      commentIds: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-comment-ids') || '',
        renderHTML: (attributes) => {
          if (!attributes.commentIds) return {}
          return { 'data-comment-ids': attributes.commentIds }
        },
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-comment-ids]',
        getAttrs: (element) => {
          const ids = (element as HTMLElement).getAttribute('data-comment-ids')?.trim()
          if (!ids) return false
          return { commentIds: ids }
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

export const CommentAnchor = Node.create({
  name: 'commentAnchor',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment-anchor'),
        renderHTML: (attributes) => {
          if (!attributes.commentId) return {}
          return { 'data-comment-anchor': attributes.commentId }
        },
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-anchor]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-anchor' })]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'comment-anchor'
      dom.setAttribute('data-comment-anchor', node.attrs.commentId)
      dom.setAttribute('contenteditable', 'false')
      return { dom }
    }
  },
})

export type CommentAnchorPoint = { id: string; pos: number }

export function findCommentAnchors(doc: PMNode): CommentAnchorPoint[] {
  const first = new Map<string, number>()
  const remember = (id: string, pos: number) => {
    if (id && !first.has(id)) first.set(id, pos)
  }
  doc.descendants((node, pos) => {
    if (node.type.name === 'commentAnchor') remember(String(node.attrs.commentId || ''), pos)
    for (const id of readIds(node, 'commentRange', 'commentIds')) remember(id, pos)
  })
  return [...first.entries()].map(([id, pos]) => ({ id, pos }))
}

export function commentIdsInDoc(doc: PMNode): Set<string> {
  return new Set(findCommentAnchors(doc).map((anchor) => anchor.id))
}

export function commentIdsAt(doc: PMNode, pos: number): string[] {
  const direct = doc.nodeAt(pos)
  if (direct?.type.name === 'commentAnchor' && direct.attrs.commentId) {
    return [String(direct.attrs.commentId)]
  }
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(clamped)
  const anchorNode = [$pos.nodeAfter, $pos.nodeBefore].find((node) => node?.type.name === 'commentAnchor')
  if (anchorNode?.attrs.commentId) return [String(anchorNode.attrs.commentId)]
  const mark = $pos.marks().find((item) => item.type.name === 'commentRange')
  if (!mark) return []
  return String(mark.attrs.commentIds || '')
    .split(/\s+/)
    .filter(Boolean)
}

function selectionHasText(doc: PMNode, from: number, to: number): boolean {
  let hasText = false
  doc.nodesBetween(from, to, (node) => {
    if (node.isText && node.text) hasText = true
  })
  return hasText
}

export function addCommentToDocument(editor: Editor, commentId: string) {
  const { from, to, empty } = editor.state.selection
  if (empty || !selectionHasText(editor.state.doc, from, to)) {
    editor.chain().focus().insertContent({ type: 'commentAnchor', attrs: { commentId } }).run()
    return
  }
  const type = editor.state.schema.marks.commentRange
  if (!type) return
  let tr = editor.state.tr
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    if (start >= end) return
    const current = readIds(node, 'commentRange', 'commentIds')
    const next = current.includes(commentId) ? current : [...current, commentId]
    tr = tr.removeMark(start, end, type)
    tr = tr.addMark(start, end, type.create({ commentIds: next.join(' ') }))
  })
  if (tr.docChanged) editor.view.dispatch(tr)
  editor.commands.focus()
}

export function deleteCommentFromDoc(editor: Editor, commentId: string) {
  const type = editor.state.schema.marks.commentRange
  let tr = editor.state.tr
  const deletions: { from: number; to: number }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'commentAnchor' && node.attrs.commentId === commentId) {
      deletions.push({ from: pos, to: pos + node.nodeSize })
    }
    if (!node.isText || !type) return
    const current = readIds(node, 'commentRange', 'commentIds')
    if (!current.includes(commentId)) return
    const next = current.filter((id) => id !== commentId)
    tr = tr.removeMark(pos, pos + node.nodeSize, type)
    if (next.length > 0) tr = tr.addMark(pos, pos + node.nodeSize, type.create({ commentIds: next.join(' ') }))
  })
  for (const deletion of deletions.sort((a, b) => b.from - a.from)) {
    tr = tr.delete(deletion.from, deletion.to)
  }
  if (tr.docChanged) editor.view.dispatch(tr)
}
