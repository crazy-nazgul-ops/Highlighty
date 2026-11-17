import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import TextAlign from '@tiptap/extension-text-align'
import StarterKit from '@tiptap/starter-kit'
import { CommentAnchor, CommentRange } from './comments'
import { HighlightLayer, highlightPaintPlugin } from './highlights'

function indentAttribute() {
  return {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-indent') === 'true',
    renderHTML: (attributes: { indent?: boolean }) => {
      if (!attributes.indent) return {}
      return { 'data-indent': 'true' }
    },
  }
}

const ManuscriptParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
        indent: indentAttribute(),
    }
  },
})

const ManuscriptHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
        indent: indentAttribute(),
    }
  },
})

function setIndent(editor: Editor, value: boolean) {
  const name = editor.state.selection.$from.parent.type.name
  if (name !== 'paragraph' && name !== 'heading') return
  editor.commands.updateAttributes(name, { indent: value })
}

const ManuscriptKeys = Extension.create({
  name: 'manuscriptKeys',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        setIndent(this.editor, true)
        return true
      },
      'Shift-Tab': () => {
        setIndent(this.editor, false)
        return true
      },
    }
  },
})

export function createExtensions() {
  return [
    StarterKit.configure({
      paragraph: false,
      heading: false,
    }),
    ManuscriptParagraph,
    ManuscriptHeading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    HighlightLayer,
    CommentRange,
    CommentAnchor,
    ManuscriptKeys,
    Extension.create({
      name: 'highlightPaint',
      addProseMirrorPlugins() {
        return [highlightPaintPlugin()]
      },
    }),
  ]
}
