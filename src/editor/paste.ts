import type { Comment } from '../model/types'

type ClassStyles = Map<string, Record<string, string>>

type InlineState = {
  atStart: boolean
  allowIndent: boolean
  indent: boolean
  preserveBreaks: boolean
}

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'])
const SKIP_TAGS = new Set([
  'script',
  'style',
  'head',
  'meta',
  'link',
  'noscript',
  'title',
  'img',
  'svg',
  'button',
  'input',
  'textarea',
])

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function parseStyle(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of css.split(';')) {
    const index = part.indexOf(':')
    if (index === -1) continue
    const key = part.slice(0, index).trim().toLowerCase()
    const value = part.slice(index + 1).trim().toLowerCase()
    if (key && value) out[key] = value
  }
  return out
}

function extractClassStyles(doc: Document): ClassStyles {
  const map: ClassStyles = new Map()
  const css = [...doc.querySelectorAll('style')]
    .map((style) => style.textContent || '')
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = /([^{}]+)\{([^}]+)\}/g
  let match: RegExpExecArray | null
  while ((match = rule.exec(css))) {
    const body = parseStyle(match[2])
    for (const selector of match[1].split(',')) {
      const classes = selector.match(/\.([A-Za-z0-9_-]+)/g)
      if (!classes) continue
      for (const token of classes) {
        const name = token.slice(1)
        map.set(name, { ...(map.get(name) ?? {}), ...body })
      }
    }
  }
  return map
}

function mergedStyle(el: HTMLElement, styles: ClassStyles): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of el.classList) {
    const found = styles.get(name)
    if (found) Object.assign(out, found)
  }
  Object.assign(out, parseStyle(el.getAttribute('style') || ''))
  return out
}

function isPositiveLength(value: string | undefined): boolean {
  if (!value) return false
  const amount = Number.parseFloat(value)
  return Number.isFinite(amount) && amount > 0
}

function weightIsBold(value: string | undefined, tag: string): boolean {
  if (!value) return tag === 'b' || tag === 'strong'
  if (value === 'bold' || value === 'bolder') return true
  if (value === 'normal' || value === 'lighter') return false
  const amount = Number.parseInt(value, 10)
  return Number.isFinite(amount) && amount >= 600
}

function styleIsItalic(value: string | undefined, tag: string): boolean {
  if (!value) return tag === 'i' || tag === 'em'
  return value === 'italic' || value === 'oblique'
}

function readAlign(style: Record<string, string>, el: HTMLElement): string | null {
  const value = (style['text-align'] || el.getAttribute('align') || '').trim().toLowerCase()
  if (value === 'center' || value === 'right' || value === 'justify') return value
  return null
}

function consumeLeadingIndent(text: string, state: InlineState): string {
  if (!state.atStart) return text
  const match = text.match(/^[\t \u00a0]+/)
  if (!match) {
    if (text.length > 0) state.atStart = false
    return text
  }
  const lead = match[0]
  const hasTab = lead.includes('\t')
  const spaces = lead.replace(/[^\u00a0 ]/g, '').length
  if (!state.allowIndent) {
    const rest = text.replace(/^[\t \u00a0]+/, '')
    if (rest.length > 0) state.atStart = false
    return rest
  }
  if (hasTab || spaces >= 4) {
    state.indent = true
    const rest = text.slice(lead.length)
    if (rest.length > 0) state.atStart = false
    return rest
  }
  if (text.length > 0) state.atStart = false
  return text
}

function renderText(text: string, state: InlineState): string {
  let next = consumeLeadingIndent(text, state)
  next = next.replace(/\t/g, '\u2003\u2003')
  if (state.preserveBreaks) {
    if (next.length > 0) state.atStart = false
    return escapeHtml(next).replace(/\n/g, '<br>')
  }
  next = next.replace(/\s*\n+\s*/g, ' ')
  if (next.trim().length > 0) state.atStart = false
  return escapeHtml(next)
}

function renderInline(node: Node, state: InlineState, styles: ClassStyles): string {
  if (node.nodeType === Node.TEXT_NODE) return renderText(node.textContent || '', state)
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (SKIP_TAGS.has(tag)) return ''
  if (tag === 'br') {
    state.atStart = false
    return '<br>'
  }

  const anchor = el.getAttribute('data-comment-anchor')
  if (anchor) {
    state.atStart = false
    return `<span data-comment-anchor="${escapeAttr(anchor)}"></span>`
  }

  const style = mergedStyle(el, styles)
  let inner = ''
  for (const child of el.childNodes) inner += renderInline(child, state, styles)
  if (!inner) return ''

  if (styleIsItalic(style['font-style'], tag)) inner = `<em>${inner}</em>`
  if (weightIsBold(style['font-weight'], tag)) inner = `<strong>${inner}</strong>`

  const layerIds = el.getAttribute('data-layer-ids')
  const commentIds = el.getAttribute('data-comment-ids')
  if (layerIds) inner = `<span data-layer-ids="${escapeAttr(layerIds)}">${inner}</span>`
  if (commentIds) inner = `<span data-comment-ids="${escapeAttr(commentIds)}">${inner}</span>`
  return inner
}

function renderBlock(el: HTMLElement, styles: ClassStyles): string {
  const tag = el.tagName.toLowerCase()
  const blockTag = /^h[1-6]$/.test(tag) ? tag : 'p'
  const style = mergedStyle(el, styles)
  const align = readAlign(style, el)
  const state: InlineState = {
    atStart: true,
    allowIndent: align !== 'center',
    indent: el.getAttribute('data-indent') === 'true' || isPositiveLength(style['text-indent']),
    preserveBreaks: ['pre', 'pre-wrap', 'pre-line'].includes(style['white-space'] || ''),
  }
  let inner = ''
  for (const child of el.childNodes) inner += renderInline(child, state, styles)
  if (styleIsItalic(style['font-style'], tag) && !inner.includes('<em>')) inner = `<em>${inner}</em>`
  if (weightIsBold(style['font-weight'], tag) && !inner.includes('<strong>')) {
    inner = `<strong>${inner}</strong>`
  }

  const indent = state.indent && align !== 'center'
  const attrs = [
    indent ? ' data-indent="true"' : '',
    align ? ` style="text-align: ${align}"` : '',
  ].join('')
  return `<${blockTag}${attrs}>${inner}</${blockTag}>`
}

function hasStructuralChild(el: HTMLElement): boolean {
  return Boolean(
    el.querySelector(
      'p,h1,h2,h3,h4,h5,h6,li,blockquote,div,table,tr,td,th,section,article,ul,ol',
    ),
  )
}

function collect(node: Node, styles: ClassStyles, out: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || ''
    if (text.trim()) out.push(plainTextToManuscriptHtml(text))
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (SKIP_TAGS.has(tag)) return
  if (BLOCK_TAGS.has(tag)) {
    out.push(renderBlock(el, styles))
    return
  }
  if (!hasStructuralChild(el)) {
    const hasPayload =
      Boolean((el.textContent || '').trim()) ||
      Boolean(el.querySelector('br, [data-comment-anchor]'))
    if (hasPayload) out.push(renderBlock(el, styles))
    return
  }
  for (const child of el.childNodes) collect(child, styles, out)
}

export function sanitizeManuscriptHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks: string[] = []
  collect(doc.body, extractClassStyles(doc), blocks)
  if (blocks.length > 0) return blocks.join('')
  const text = doc.body.textContent || ''
  if (text.trim()) return plainTextToManuscriptHtml(text)
  return ''
}

export function plainTextToManuscriptHtml(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return lines
    .map((line) => {
      let indent = false
      let content = line
      if (/^\t+/.test(content) || /^[ \u00a0]{4,}/.test(content)) {
        indent = true
        content = content.replace(/^(?:\t+|[ \u00a0]{4,})/, '')
      }
      content = content.replace(/\t/g, '\u2003\u2003')
      const attrs = indent ? ' data-indent="true"' : ''
      return `<p${attrs}>${escapeHtml(content)}</p>`
    })
    .join('')
}

export function remapPastedAnnotations(
  html: string,
  knownCommentIds: Set<string>,
  knownLayerIds: Set<string>,
): { html: string; clones: { from: string; to: string }[] } {
  const clones: { from: string; to: string }[] = []
  const commentMap = new Map<string, string>()

  const remapComment = (id: string): string | null => {
    if (!knownCommentIds.has(id)) return null
    const existing = commentMap.get(id)
    if (existing) return existing
    const next = crypto.randomUUID()
    commentMap.set(id, next)
    clones.push({ from: id, to: next })
    return next
  }

  let next = html.replace(/data-layer-ids="([^"]*)"/g, (_full, raw: string) => {
    const ids = raw.split(/\s+/).filter((id) => knownLayerIds.has(id))
    return ids.length > 0 ? `data-layer-ids="${ids.join(' ')}"` : ''
  })
  next = next.replace(/data-comment-ids="([^"]*)"/g, (_full, raw: string) => {
    const ids = raw
      .split(/\s+/)
      .map((id) => remapComment(id))
      .filter((id): id is string => Boolean(id))
    return ids.length > 0 ? `data-comment-ids="${ids.join(' ')}"` : ''
  })
  next = next.replace(/data-comment-anchor="([^"]*)"/g, (_full, id: string) => {
    const mapped = remapComment(id)
    return mapped ? `data-comment-anchor="${mapped}"` : 'data-stripped-anchor="1"'
  })
  next = next.replace(/<span data-stripped-anchor="1"><\/span>/g, '')
  return { html: next, clones }
}

export function cloneComments(
  comments: Comment[],
  clones: { from: string; to: string }[],
): Comment[] {
  return clones.flatMap((clone) => {
    const source = comments.find((comment) => comment.id === clone.from)
    if (!source) return []
    return [{ ...source, id: clone.to }]
  })
}
