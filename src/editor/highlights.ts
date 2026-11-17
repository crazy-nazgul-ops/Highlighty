import { Mark, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'
import { cssColor } from '../model/color'
import type { Layer } from '../model/types'
import { readIds } from './markIds'

export type PaintState = {
  layers: Layer[]
  commentsVisible: boolean
  activeCommentId: string | null
}

export const highlightPluginKey = new PluginKey<PaintState>('highlightPaint')

export const HighlightLayer = Mark.create({
  name: 'highlightLayer',
  inclusive: true,
  excludes: 'highlightLayer',
  addAttributes() {
    return {
      layerIds: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-layer-ids') || '',
        renderHTML: (attributes) => {
          if (!attributes.layerIds) return {}
          return { 'data-layer-ids': attributes.layerIds }
        },
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-layer-ids]',
        getAttrs: (element) => {
          const ids = (element as HTMLElement).getAttribute('data-layer-ids')?.trim()
          if (!ids) return false
          return { layerIds: ids }
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

function styleForNode(node: PMNode, paint: PaintState): string | null {
  const layerIds = readIds(node, 'highlightLayer', 'layerIds')
  const commentIds = paint.commentsVisible ? readIds(node, 'commentRange', 'commentIds') : []
  const order = new Map(paint.layers.map((layer, index) => [layer.id, index]))
  const visible = layerIds
    .map((id) => paint.layers.find((layer) => layer.id === id))
    .filter((layer): layer is Layer => Boolean(layer && layer.visible))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  const gradients = visible.map(
    (layer) => `linear-gradient(${cssColor(layer.color, layer.opacity)}, ${cssColor(layer.color, layer.opacity)})`,
  )
  if (commentIds.length > 0) {
    const active = commentIds.includes(paint.activeCommentId || '')
    const gray = active ? 'rgba(78, 74, 68, 0.34)' : 'rgba(78, 74, 68, 0.2)'
    gradients.push(`linear-gradient(${gray}, ${gray})`)
  }
  if (gradients.length === 0) return null
  return [
    `background-image: ${gradients.join(', ')}`,
    'box-decoration-break: clone',
    '-webkit-box-decoration-break: clone',
    'print-color-adjust: exact',
    '-webkit-print-color-adjust: exact',
  ].join('; ')
}

export function buildHighlightDecorations(doc: PMNode, paint: PaintState): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const style = styleForNode(node, paint)
    if (!style) return
    decorations.push(Decoration.inline(pos, pos + node.nodeSize, { style, class: 'hl-stack' }))
  })
  return DecorationSet.create(doc, decorations)
}

export function highlightPaintPlugin() {
  return new Plugin<PaintState>({
    key: highlightPluginKey,
    state: {
      init: () => ({ layers: [], commentsVisible: true, activeCommentId: null }),
      apply(tr, value) {
        const meta = tr.getMeta(highlightPluginKey) as Partial<PaintState> | undefined
        return meta ? { ...value, ...meta } : value
      },
    },
    props: {
      decorations(state) {
        const paint = highlightPluginKey.getState(state)
        if (!paint) return null
        return buildHighlightDecorations(state.doc, paint)
      },
    },
  })
}

export function selectionCoveredBy(
  editor: Editor,
  layerId: string,
  options?: { ignoreWhitespace?: boolean },
): boolean {
  const { from, to, empty } = editor.state.selection
  if (empty) return false
  let hasText = false
  let covered = true
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    const slice = node.text?.slice(start - pos, end - pos) ?? ''
    const meaningful = options?.ignoreWhitespace ? slice.replace(/\s+/g, '') : slice
    if (!meaningful) return
    hasText = true
    if (!readIds(node, 'highlightLayer', 'layerIds').includes(layerId)) covered = false
  })
  return hasText && covered
}

export function toggleHighlightLayer(
  editor: Editor,
  layerId: string,
  options?: { ignoreWhitespace?: boolean; scroll?: boolean },
): boolean {
  const { state } = editor
  const { from, to, empty } = state.selection
  const type = state.schema.marks.highlightLayer
  if (empty || !type || !layerId) return false

  const remove = selectionCoveredBy(editor, layerId, options)
  let hasText = false
  let tr = state.tr
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    if (start >= end) return
    hasText = true
    const current = readIds(node, 'highlightLayer', 'layerIds')
    const next = remove
      ? current.filter((id) => id !== layerId)
      : current.includes(layerId)
        ? current
        : [...current, layerId]
    tr = tr.removeMark(start, end, type)
    if (next.length > 0) tr = tr.addMark(start, end, type.create({ layerIds: next.join(' ') }))
  })
  if (!hasText || !tr.docChanged) return false
  editor.view.dispatch(options?.scroll === false ? tr : tr.scrollIntoView())
  return true
}

export function collectLayerExcerpts(doc: PMNode, layerId: string): string[] {
  const pieces: { from: number; to: number; text: string }[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    if (!readIds(node, 'highlightLayer', 'layerIds').includes(layerId)) return
    pieces.push({ from: pos, to: pos + node.nodeSize, text: node.text })
  })

  const excerpts: string[] = []
  let current = ''
  let currentTo = -1

  const flush = () => {
    const text = current.replace(/\s+/g, ' ').trim()
    if (text) excerpts.push(text)
    current = ''
    currentTo = -1
  }

  for (const piece of pieces) {
    if (currentTo < 0) {
      current = piece.text
      currentTo = piece.to
      continue
    }
    const gap = doc.textBetween(currentTo, piece.from, '\u0000', '')
    const crossesText = [...gap].some((char) => char !== '\u0000')
    if (crossesText) {
      flush()
      current = piece.text
      currentTo = piece.to
      continue
    }
    const breaks = gap.length
    current += (breaks > 0 ? ' ' : '') + piece.text
    currentTo = piece.to
  }
  flush()
  return excerpts
}

export function removeLayerFromDoc(editor: Editor, layerId: string) {
  const type = editor.state.schema.marks.highlightLayer
  if (!type) return
  let tr = editor.state.tr
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const current = readIds(node, 'highlightLayer', 'layerIds')
    if (!current.includes(layerId)) return
    const next = current.filter((id) => id !== layerId)
    tr = tr.removeMark(pos, pos + node.nodeSize, type)
    if (next.length > 0) tr = tr.addMark(pos, pos + node.nodeSize, type.create({ layerIds: next.join(' ') }))
  })
  if (tr.docChanged) editor.view.dispatch(tr)
}
