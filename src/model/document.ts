import type { JSONContent } from '@tiptap/core'
import { clampOpacity } from './color'
import type { Comment, Layer, ManuscriptFile } from './types'

const COMMENT_ID = /^[A-Za-z0-9_-]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function collectCommentIds(node: unknown, ids: Set<string>) {
  if (!isRecord(node)) return
  if (node.type === 'commentAnchor' && isRecord(node.attrs) && typeof node.attrs.commentId === 'string') {
    ids.add(node.attrs.commentId)
  }
  if (Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (!isRecord(mark) || mark.type !== 'commentRange' || !isRecord(mark.attrs)) continue
      const raw = mark.attrs.commentIds
      if (typeof raw !== 'string') continue
      for (const id of raw.split(/\s+/)) if (id) ids.add(id)
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectCommentIds(child, ids)
  }
}

function parseLayer(value: unknown): Layer | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  return {
    id: value.id,
    name: value.name.trim() || 'Layer',
    color: typeof value.color === 'string' && value.color.trim() ? value.color : '#e2b340',
    opacity: clampOpacity(typeof value.opacity === 'number' ? value.opacity : 0.4),
    visible: value.visible !== false,
  }
}

function parseComment(value: unknown): Comment | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !COMMENT_ID.test(value.id)) return null
  return {
    id: value.id,
    author: typeof value.author === 'string' && value.author.trim() ? value.author.trim() : 'Anonymous',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    text: typeof value.text === 'string' ? value.text : '',
  }
}

export function parseManuscriptFile(raw: string): ManuscriptFile | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.doc) || data.doc.type !== 'doc') return null
  const layers = Array.isArray(data.layers) ? data.layers.map(parseLayer).filter((layer): layer is Layer => Boolean(layer)) : []
  const parsedComments = Array.isArray(data.comments)
    ? data.comments.map(parseComment).filter((comment): comment is Comment => Boolean(comment))
    : []
  const anchorIds = new Set<string>()
  collectCommentIds(data.doc, anchorIds)
  const comments = parsedComments.filter((comment) => anchorIds.has(comment.id))
  for (const id of anchorIds) {
    if (!comments.some((comment) => comment.id === id)) {
      comments.push({ id, author: 'Anonymous', createdAt: new Date().toISOString(), text: '' })
    }
  }
  return {
    version: 1,
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Untitled',
    doc: data.doc as JSONContent,
    layers,
    comments,
    commentsVisible: data.commentsVisible !== false,
  }
}

export function makeFile(
  title: string,
  doc: JSONContent,
  layers: Layer[],
  comments: Comment[],
  commentsVisible: boolean,
): ManuscriptFile {
  return {
    version: 1,
    title: title.trim() || 'Untitled',
    doc,
    layers,
    comments,
    commentsVisible,
  }
}

export function fileSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'manuscript'
}

export function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
