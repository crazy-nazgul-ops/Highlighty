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

function clampHeading(value: string | null | undefined): number | null {
  if (!value) return null
  const amount = Number.parseInt(value, 10)
  if (!Number.isFinite(amount) || amount < 1) return null
  return Math.min(amount, 6)
}

function isTitleLike(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 90) return false
  if (/[.!?]["')\]]?\s+\S/.test(trimmed)) return false
  return trimmed.split(/\s+/).length <= 14
}

function isRomanNumeral(text: string): boolean {
  return (
    text.length > 0 &&
    text.length <= 8 &&
    /^(?:M{0,3})(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/i.test(text)
  )
}

function isAllCapsTitle(text: string): boolean {
  const trimmed = text.trim()
  const letters = trimmed.replace(/[^A-Za-z]/g, '')
  if (letters.length < 4 || letters !== letters.toUpperCase()) return false
  if (trimmed.length > 60 || /[.!?]/.test(trimmed)) return false
  const words = trimmed.split(/\s+/)
  return words.length >= 2 && words.length <= 10
}

function keywordHeading(text: string): number | null {
  if (!isTitleLike(text)) return null
  if (/[.!?]["')\]]?$/.test(text) && !/[:\u2014\u2013]| - /.test(text)) return null
  if (/^(?:chapter|chap\.?|part|book|act)\b/i.test(text)) return 1
  if (/^(?:prologue|epilogue|preface|foreword|afterword|introduction|conclusion|interlude|coda|appendix)\b/i.test(text)) {
    return 1
  }
  if (/^(?:subchapter|subsection)\b/i.test(text)) return 2
  if (/^(?:section|scene)\s+(?:\d+|[ivxlcdm]+)\b/i.test(text)) return 2
  return null
}

export function headingFromPlainLine(line: string): { level: number; text: string } | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const markdown = trimmed.match(/^(#{1,6})\s+(\S.*)$/)
  if (markdown) {
    const text = markdown[2].trim()
    if (text) return { level: markdown[1].length, text }
  }

  const numbered = trimmed.match(/^(\d+(?:\.\d+)+)\.?\s+(\S.*)$/)
  if (numbered && isTitleLike(numbered[2]) && trimmed.length <= 90) {
    return {
      level: Math.min(numbered[1].split('.').length, 6),
      text: trimmed,
    }
  }

  const keyword = keywordHeading(trimmed)
  if (keyword) return { level: keyword, text: trimmed }
  if (/^\d{1,3}$/.test(trimmed)) return { level: 1, text: trimmed }
  if (isRomanNumeral(trimmed)) return { level: 1, text: trimmed.toUpperCase() }
  if (isAllCapsTitle(trimmed)) return { level: 1, text: trimmed }
  return null
}

function explicitHeadingLevel(el: HTMLElement, style: Record<string, string>, tag: string): number | null {
  const fromTag = tag.match(/^h([1-6])$/)
  if (fromTag) return Number(fromTag[1])

  if (el.getAttribute('role') === 'heading') {
    const aria = clampHeading(el.getAttribute('aria-level') || '1')
    if (aria) return aria
  }

  const outline = clampHeading(style['mso-outline-level'] || el.getAttribute('data-outline-level'))
  if (outline) return outline

  const styleName = (style['mso-style-name'] || '').replace(/["']/g, '').trim().toLowerCase()
  if (styleName === 'title') return 1
  if (styleName === 'subtitle') return 2
  const named = styleName.match(/^heading\s*([1-6])$/)
  if (named) return Number(named[1])

  const classes = [...el.classList].join(' ')
  if (/(?:^|[^a-z])(?:mso)?subtitle(?:[^a-z]|$)/i.test(classes)) return 2
  if (/(?:^|[^a-z])(?:mso)?title(?:[^a-z]|$)/i.test(classes)) return 1
  const fromClass = classes.match(/(?:^|[^a-z])(?:mso)?heading(?:_20_|[\s_-]*)([1-6])(?:[^0-9]|$)/i)
  if (fromClass) return Number(fromClass[1])
  return null
}

function parseFontSizePt(value: string | undefined): number | null {
  if (!value) return null
  const match = value.trim().match(/^([\d.]+)\s*(pt|px|em|rem)?$/i)
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = (match[2] || 'pt').toLowerCase()
  if (unit === 'pt') return amount
  if (unit === 'px') return amount * 0.75
  if (unit === 'em' || unit === 'rem') return amount * 12
  return null
}

function nearestFontSize(node: Node, root: HTMLElement, styles: ClassStyles): number | null {
  let current = node.parentElement
  while (current) {
    const size = parseFontSizePt(mergedStyle(current, styles)['font-size'])
    if (size) return size
    if (current === root) break
    current = current.parentElement
  }
  return null
}

function uniformFontSizePt(el: HTMLElement, styles: ClassStyles): number | null {
  let found: number | null = null
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  let saw = false
  while (current) {
    if ((current.textContent || '').trim()) {
      saw = true
      const size = nearestFontSize(current, el, styles)
      if (!size) return null
      if (found === null) found = size
      else if (Math.abs(found - size) > 0.6) return null
    }
    current = walker.nextNode()
  }
  return saw ? found : null
}

function blockIsBold(el: HTMLElement, style: Record<string, string>, styles: ClassStyles, tag: string): boolean {
  if (weightIsBold(style['font-weight'], tag)) return true
  let saw = false
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    if (!(current.textContent || '').trim()) {
      current = walker.nextNode()
      continue
    }
    saw = true
    let bold = false
    let parent = current.parentElement
    while (parent) {
      const parentTag = parent.tagName.toLowerCase()
      const weight = mergedStyle(parent, styles)['font-weight']
      if (parentTag === 'b' || parentTag === 'strong' || weightIsBold(weight, parentTag)) {
        bold = true
        break
      }
      if (parent === el) break
      parent = parent.parentElement
    }
    if (!bold) return false
    current = walker.nextNode()
  }
  return saw
}

function levelFromSize(pt: number, text: string, bold: boolean, centered: boolean): number | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 80) return null
  if (/[.!?]/.test(trimmed)) return null
  if (trimmed.split(/\s+/).length > 10) return null
  const large = pt >= 18 || (pt >= 16 && (bold || centered)) || (pt >= 14 && bold && centered)
  if (!large) return null
  if (pt >= 20) return 1
  if (pt >= 16) return 2
  return 3
}

function resolveHeading(
  el: HTMLElement,
  style: Record<string, string>,
  styles: ClassStyles,
  tag: string,
  text: string,
  align: string | null,
): { level: number | null; replaceText: string | null } {
  const explicit = explicitHeadingLevel(el, style, tag)
  if (explicit) return { level: explicit, replaceText: null }
  if (!text) return { level: null, replaceText: null }
  const plain = headingFromPlainLine(text)
  if (plain) return { level: plain.level, replaceText: plain.text === text ? null : plain.text }
  const size = uniformFontSizePt(el, styles)
  if (!size) return { level: null, replaceText: null }
  const level = levelFromSize(size, text, blockIsBold(el, style, styles, tag), align === 'center')
  return { level, replaceText: null }
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
  const style = mergedStyle(el, styles)
  const align = readAlign(style, el)
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
  const heading = resolveHeading(el, style, styles, tag, text, align)
  const blockTag = heading.level ? `h${heading.level}` : 'p'
  const state: InlineState = {
    atStart: true,
    allowIndent: align !== 'center' && !heading.level,
    indent:
      !heading.level &&
      (el.getAttribute('data-indent') === 'true' || isPositiveLength(style['text-indent'])),
    preserveBreaks: ['pre', 'pre-wrap', 'pre-line'].includes(style['white-space'] || ''),
  }
  let inner = ''
  if (heading.replaceText !== null) inner = escapeHtml(heading.replaceText)
  else for (const child of el.childNodes) inner += renderInline(child, state, styles)
  if (styleIsItalic(style['font-style'], tag) && inner && !inner.includes('<em>')) inner = `<em>${inner}</em>`
  if (!heading.level && weightIsBold(style['font-weight'], tag) && inner && !inner.includes('<strong>')) {
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

function paragraphFromPlainLine(line: string): string {
  let indent = false
  let content = line
  if (/^\t+/.test(content) || /^[ \u00a0]{4,}/.test(content)) {
    indent = true
    content = content.replace(/^(?:\t+|[ \u00a0]{4,})/, '')
  }
  const heading = headingFromPlainLine(content)
  if (heading) return `<h${heading.level}>${escapeHtml(heading.text)}</h${heading.level}>`
  content = content.replace(/\t/g, '\u2003\u2003')
  const attrs = indent ? ' data-indent="true"' : ''
  return `<p${attrs}>${escapeHtml(content)}</p>`
}

export function plainTextToManuscriptHtml(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const blocks: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const underline = lines[index + 1] ?? ''
    if (line.trim() && isTitleLike(line.trim()) && /^=+\s*$/.test(underline) && underline.trim().length >= 3) {
      blocks.push(`<h1>${escapeHtml(line.trim())}</h1>`)
      index += 1
      continue
    }
    blocks.push(paragraphFromPlainLine(line))
  }
  return blocks.join('')
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
