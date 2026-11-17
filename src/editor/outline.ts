import type { Node as ProseNode } from '@tiptap/pm/model'

export type OutlineEntry = {
  pos: number
  level: number
  text: string
}

export function collectOutline(doc: ProseNode): OutlineEntry[] {
  const entries: OutlineEntry[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const level = Number(node.attrs.level) || 1
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    entries.push({ pos, level, text: text || 'Empty heading' })
  })
  return entries
}

export function activeHeadingPos(entries: OutlineEntry[], cursor: number): number | null {
  let active: number | null = null
  for (const entry of entries) {
    if (entry.pos <= cursor) active = entry.pos
    else break
  }
  return active
}
