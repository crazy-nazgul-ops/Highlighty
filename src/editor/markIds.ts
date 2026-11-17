import type { Node as PMNode } from '@tiptap/pm/model'

export function readIds(node: PMNode, markName: string, attr: string): string[] {
  const mark = node.marks.find((item) => item.type.name === markName)
  if (!mark) return []
  return String(mark.attrs[attr] ?? '')
    .split(/\s+/)
    .filter(Boolean)
}
