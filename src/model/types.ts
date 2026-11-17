import type { JSONContent } from '@tiptap/core'

export type Layer = {
  id: string
  name: string
  color: string
  opacity: number
  visible: boolean
}

export type Comment = {
  id: string
  author: string
  createdAt: string
  text: string
}

export type ManuscriptFile = {
  version: 1
  title: string
  doc: JSONContent
  layers: Layer[]
  comments: Comment[]
  commentsVisible: boolean
}

export const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

export const LAYER_PALETTE = ['#e2b340', '#7eb6d6', '#e08aa6', '#8fbe86', '#c7a6e0', '#e0a36a']
