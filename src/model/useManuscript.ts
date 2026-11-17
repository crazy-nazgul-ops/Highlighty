import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditor } from '@tiptap/react'
import { addCommentToDocument, commentIdsAt, commentIdsInDoc, deleteCommentFromDoc } from '../editor/comments'
import { createExtensions } from '../editor/extensions'
import {
  collectLayerExcerpts,
  highlightPluginKey,
  removeLayerFromDoc,
  selectionCoveredBy,
  toggleHighlightLayer,
} from '../editor/highlights'
import { cloneComments, plainTextToManuscriptHtml, remapPastedAnnotations, sanitizeManuscriptHtml } from '../editor/paste'
import { fileSlug, makeFile, parseManuscriptFile } from './document'
import { EMPTY_DOC, LAYER_PALETTE, type Comment, type Layer, type ManuscriptFile } from './types'

const SESSION_KEY = 'mh-session'
const AUTHOR_KEY = 'mh-author'

export type FormatState = {
  empty: boolean
  italic: boolean
  bold: boolean
  center: boolean
  indent: boolean
}

const INITIAL_FORMAT: FormatState = {
  empty: true,
  italic: false,
  bold: false,
  center: false,
  indent: false,
}

function readFormat(editor: Editor): FormatState {
  const name = editor.state.selection.$from.parent.type.name
  const block = name === 'paragraph' || name === 'heading' ? name : 'paragraph'
  return {
    empty: editor.state.selection.empty,
    italic: editor.isActive('italic'),
    bold: editor.isActive('bold'),
    center: editor.isActive({ textAlign: 'center' }),
    indent: editor.isActive(block, { indent: true }),
  }
}

function isBlankFile(file: ManuscriptFile): boolean {
  if (file.title !== 'Untitled' || file.layers.length > 0 || file.comments.length > 0) return false
  return !JSON.stringify(file.doc).includes('"text"')
}

export function useManuscript() {
  const [title, setTitle] = useState('Untitled')
  const [authorName, setAuthorName] = useState(() => localStorage.getItem(AUTHOR_KEY) ?? '')
  const [layers, setLayers] = useState<Layer[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsVisible, setCommentsVisible] = useState(true)
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
  const [paintLayerId, setPaintLayerId] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [freshCommentId, setFreshCommentId] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [format, setFormat] = useState<FormatState>(INITIAL_FORMAT)
  const [dirty, setDirty] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const commentsRef = useRef(comments)
  const layersRef = useRef(layers)
  const activeLayerRef = useRef(activeLayerId)
  const paintLayerRef = useRef(paintLayerId)
  const activeCommentRef = useRef(activeCommentId)
  const editorRef = useRef<Editor | null>(null)
  const savedSnapshot = useRef<string | null>(null)
  const snapshotAfterPaint = useRef(false)
  const keepDirty = useRef(false)
  const restored = useRef(false)
  commentsRef.current = comments
  layersRef.current = layers
  activeLayerRef.current = activeLayerId
  paintLayerRef.current = paintLayerId
  activeCommentRef.current = activeCommentId

  const extensions = useMemo(() => createExtensions(), [])

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'manuscript',
        spellcheck: 'true',
      },
      handlePaste(_view, event) {
        const current = editorRef.current
        if (!current) return false
        const html = event.clipboardData?.getData('text/html') ?? ''
        const text = event.clipboardData?.getData('text/plain') ?? ''
        let content = ''
        if (html.trim()) {
          const clean = sanitizeManuscriptHtml(html)
          const remapped = remapPastedAnnotations(
            clean,
            new Set(commentsRef.current.map((comment) => comment.id)),
            new Set(layersRef.current.map((layer) => layer.id)),
          )
          const clones = cloneComments(commentsRef.current, remapped.clones)
          if (clones.length > 0) setComments((prev) => [...prev, ...clones])
          content = remapped.html
        } else if (text) {
          content = plainTextToManuscriptHtml(text)
        }
        if (!content) return false
        if (current.isEmpty) current.commands.setContent(content)
        else current.chain().focus().insertContent(content).run()
        return true
      },
      handleClick(view, pos) {
        const ids = commentIdsAt(view.state.doc, pos)
        if (ids.length === 0) return false
        const current = activeCommentRef.current
        const next = current && ids.includes(current) ? current : ids[ids.length - 1]
        setActiveCommentId(next)
        return false
      },
      handleKeyDown(_view, event) {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'h') {
          event.preventDefault()
          const current = editorRef.current
          const layerId = activeLayerRef.current
          if (current && layerId) toggleHighlightLayer(current, layerId)
          return true
        }
        return false
      },
    },
    onCreate: ({ editor: created }) => {
      editorRef.current = created
    },
    onTransaction: ({ editor: current, transaction }) => {
      editorRef.current = current
      if (transaction.docChanged) setRevision((value) => value + 1)
      setSelectionVersion((value) => value + 1)
      setFormat(readFormat(current))
    },
  })

  if (editor) editorRef.current = editor

  const buildFile = useCallback((): ManuscriptFile => {
    const doc = editor?.getJSON() ?? EMPTY_DOC
    const anchors = editor ? commentIdsInDoc(editor.state.doc) : new Set<string>()
    return makeFile(
      title,
      doc,
      layers,
      comments.filter((comment) => anchors.has(comment.id)),
      commentsVisible,
    )
  }, [comments, commentsVisible, editor, layers, title])

  const loadFile = useCallback((file: ManuscriptFile, markSaved: boolean) => {
    setTitle(file.title)
    setLayers(file.layers)
    setComments(file.comments)
    setCommentsVisible(file.commentsVisible)
    setActiveLayerId(file.layers[0]?.id ?? null)
    setPaintLayerId(null)
    setActiveCommentId(null)
    editorRef.current?.commands.setContent(file.doc)
    if (markSaved) {
      snapshotAfterPaint.current = true
      keepDirty.current = false
    } else {
      savedSnapshot.current = null
      keepDirty.current = true
      setDirty(true)
    }
  }, [])

  useEffect(() => {
    if (!editor || restored.current) return
    restored.current = true
    const raw = localStorage.getItem(SESSION_KEY)
    const file = raw ? parseManuscriptFile(raw) : null
    if (file && !isBlankFile(file)) loadFile(file, false)
    else snapshotAfterPaint.current = true
    setHydrated(true)
  }, [editor, loadFile])

  useEffect(() => {
    localStorage.setItem(AUTHOR_KEY, authorName)
  }, [authorName])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const tr = editor.state.tr
      .setMeta(highlightPluginKey, {
        layers,
        commentsVisible,
        activeCommentId,
      })
      .setMeta('addToHistory', false)
    editor.view.dispatch(tr)
  }, [activeCommentId, commentsVisible, editor, layers])

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    let gesture = 0
    let paintedGesture = -1
    let tracking = false
    let downFrom = 0
    let downTo = 0
    let clickCount = 0
    let timer = 0

    const applyPaint = () => {
      const layerId = paintLayerRef.current
      if (!layerId || paintedGesture === gesture) return
      const { from, to, empty } = editor.state.selection
      if (empty || from === to) return
      if (from === downFrom && to === downTo && clickCount < 2) return
      paintedGesture = gesture
      toggleHighlightLayer(editor, layerId, { ignoreWhitespace: true, scroll: false })
    }

    const schedulePaint = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(applyPaint, 0)
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || !paintLayerRef.current) return
      gesture += 1
      tracking = true
      clickCount = event.detail
      downFrom = editor.state.selection.from
      downTo = editor.state.selection.to
    }

    const onMouseUp = () => {
      if (!tracking) return
      tracking = false
      if (!paintLayerRef.current) return
      schedulePaint()
    }

    const onDoubleClick = () => {
      if (!paintLayerRef.current) return
      clickCount = Math.max(clickCount, 2)
      schedulePaint()
    }

    dom.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    dom.addEventListener('dblclick', onDoubleClick)
    return () => {
      window.clearTimeout(timer)
      dom.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      dom.removeEventListener('dblclick', onDoubleClick)
    }
  }, [editor])

  useEffect(() => {
    editor?.view.dom.classList.toggle('is-painting', Boolean(paintLayerId))
  }, [editor, paintLayerId])

  useEffect(() => {
    if (layers.length === 0) {
      if (activeLayerId) setActiveLayerId(null)
      if (paintLayerId) setPaintLayerId(null)
      return
    }
    if (!layers.some((layer) => layer.id === activeLayerId)) setActiveLayerId(layers[0].id)
    if (paintLayerId && !layers.some((layer) => layer.id === paintLayerId)) setPaintLayerId(null)
  }, [activeLayerId, layers, paintLayerId])

  useEffect(() => {
    document.body.classList.toggle('comments-hidden', !commentsVisible)
    editor?.view.dom.classList.toggle('comments-hidden', !commentsVisible)
    if (!editor) return
    editor.view.dom.querySelectorAll<HTMLElement>('[data-comment-anchor]').forEach((anchor) => {
      anchor.classList.toggle('is-active', anchor.dataset.commentAnchor === activeCommentId)
    })
  }, [activeCommentId, commentsVisible, editor, revision])

  useEffect(() => {
    if (keepDirty.current || !snapshotAfterPaint.current || !hydrated || !editor) return
    snapshotAfterPaint.current = false
    savedSnapshot.current = JSON.stringify(buildFile())
    setDirty(false)
  }, [buildFile, editor, hydrated, revision])

  useEffect(() => {
    if (!hydrated || !editor) return
    const timer = window.setTimeout(() => {
      const file = buildFile()
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(file))
      } catch {
        // The browser copy is a convenience. A full disk should not block editing.
      }
      if (keepDirty.current || savedSnapshot.current == null) {
        const hasWork = !editor.isEmpty || file.layers.length > 0 || file.comments.length > 0
        setDirty(hasWork)
        return
      }
      setDirty(JSON.stringify(file) !== savedSnapshot.current)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [buildFile, editor, hydrated])

  const selectionCovered = useMemo(() => {
    if (!editor || !activeLayerId) return false
    return selectionCoveredBy(editor, activeLayerId)
  }, [activeLayerId, editor, selectionVersion])

  const addLayer = useCallback(() => {
    const id = crypto.randomUUID()
    const layer: Layer = {
      id,
      name: `Layer ${layers.length + 1}`,
      color: LAYER_PALETTE[layers.length % LAYER_PALETTE.length],
      opacity: 0.4,
      visible: true,
    }
    setLayers((prev) => [layer, ...prev])
    setActiveLayerId(id)
  }, [layers.length])

  const renameLayer = useCallback((id: string, name: string) => {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, name } : layer)))
  }, [])

  const recolorLayer = useCallback((id: string, color: string) => {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, color } : layer)))
  }, [])

  const setLayerOpacity = useCallback((id: string, opacity: number) => {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, opacity } : layer)))
  }, [])

  const toggleLayerVisible = useCallback((id: string) => {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)))
  }, [])

  const deleteLayer = useCallback(
    (id: string) => {
      if (!editor) return
      const layer = layers.find((item) => item.id === id)
      if (!layer) return
      if (!window.confirm(`Remove "${layer.name}" and its highlights?`)) return
      removeLayerFromDoc(editor, id)
      setLayers((prev) => prev.filter((item) => item.id !== id))
      setPaintLayerId((current) => (current === id ? null : current))
    },
    [editor, layers],
  )

  const reorderLayers = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return
    setLayers((prev) => {
      if (from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      if (!item) return prev
      next.splice(to, 0, item)
      return next
    })
  }, [])

  const highlightSelection = useCallback(() => {
    if (!editor || !activeLayerId) return
    toggleHighlightLayer(editor, activeLayerId)
  }, [activeLayerId, editor])

  const togglePaintLayer = useCallback((id: string) => {
    const turningOn = paintLayerRef.current !== id
    setActiveLayerId(id)
    setPaintLayerId(turningOn ? id : null)
    if (turningOn) {
      setLayers((prev) => {
        const layer = prev.find((item) => item.id === id)
        if (!layer || layer.visible) return prev
        return prev.map((item) => (item.id === id ? { ...item, visible: true } : item))
      })
    }
  }, [])

  const exportLayerExcerpts = useCallback(
    (id: string) => {
      if (!editor) return
      const layer = layersRef.current.find((item) => item.id === id)
      if (!layer) return
      const excerpts = collectLayerExcerpts(editor.state.doc, id)
      const notice =
        excerpts.length === 0
          ? `No excerpts on ${layer.name}.`
          : excerpts.length === 1
            ? `Exported 1 excerpt from ${layer.name}. Paste into Excel, or open the downloaded file.`
            : `Exported ${excerpts.length} excerpts from ${layer.name}. Paste into Excel, or open the downloaded file.`
      if (excerpts.length > 0) {
        const cell = (value: string) => value.replace(/[\t\r\n]+/g, ' ').trim()
        const rows = [
          ['Index', 'Layer', 'Excerpt'],
          ...excerpts.map((excerpt, index) => [String(index + 1), cell(layer.name), cell(excerpt)]),
        ]
        const tsv = rows.map((row) => row.join('\t')).join('\r\n')
        downloadExcelCsv(`${fileSlug(title)}-${fileSlug(layer.name)}-excerpts.csv`, tsv)
        void navigator.clipboard?.writeText(tsv).catch(() => undefined)
      }
      setExportNotice(notice)
      window.setTimeout(() => {
        setExportNotice((current) => (current === notice ? null : current))
      }, 5000)
    },
    [editor, title],
  )

  const addComment = useCallback(() => {
    if (!editor) return
    const id = crypto.randomUUID()
    const comment: Comment = {
      id,
      author: authorName.trim() || 'Anonymous',
      createdAt: new Date().toISOString(),
      text: '',
    }
    addCommentToDocument(editor, id)
    setComments((prev) => [...prev, comment])
    setCommentsVisible(true)
    setActiveCommentId(id)
    setFreshCommentId(id)
  }, [authorName, editor])

  const updateComment = useCallback((id: string, text: string) => {
    setComments((prev) => prev.map((comment) => (comment.id === id ? { ...comment, text } : comment)))
  }, [])

  const deleteComment = useCallback(
    (id: string) => {
      if (!editor) return
      deleteCommentFromDoc(editor, id)
      setComments((prev) => prev.filter((comment) => comment.id !== id))
      setActiveCommentId((current) => (current === id ? null : current))
    },
    [editor],
  )

  const revealComment = useCallback(
    (id: string) => {
      if (!editor) return
      scrollToComment(editor, id)
    },
    [editor],
  )

  const toggleMark = useCallback(
    (mark: 'italic' | 'bold') => {
      if (!editor) return
      const chain = editor.chain().focus()
      if (mark === 'italic') chain.toggleItalic().run()
      else chain.toggleBold().run()
    },
    [editor],
  )

  const toggleCenter = useCallback(() => {
    if (!editor) return
    if (editor.isActive({ textAlign: 'center' })) editor.chain().focus().unsetTextAlign().run()
    else editor.chain().focus().setTextAlign('center').run()
  }, [editor])

  const toggleIndent = useCallback(() => {
    if (!editor) return
    const name = editor.state.selection.$from.parent.type.name
    if (name !== 'paragraph' && name !== 'heading') return
    const indented = editor.isActive(name, { indent: true })
    editor.chain().focus().updateAttributes(name, { indent: !indented }).run()
  }, [editor])

  const newDocument = useCallback(() => {
    if (!editor) return
    const hasWork = !editor.isEmpty || layers.length > 0 || comments.length > 0
    if (hasWork && !window.confirm('Start a new manuscript? This clears the text, highlights, and comments on the page.')) {
      return
    }
    loadFile(
      {
        version: 1,
        title: 'Untitled',
        doc: EMPTY_DOC,
        layers: [],
        comments: [],
        commentsVisible: true,
      },
      true,
    )
  }, [comments.length, editor, layers.length, loadFile])

  const openText = useCallback(
    (raw: string) => {
      const file = parseManuscriptFile(raw)
      if (!file) return false
      loadFile(file, true)
      return true
    },
    [loadFile],
  )

  const saveFile = useCallback(() => {
    const file = buildFile()
    const json = JSON.stringify(file, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileSlug(file.title)}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    keepDirty.current = false
    savedSnapshot.current = JSON.stringify(file)
    setDirty(false)
  }, [buildFile])

  const anchoredComments = useMemo(() => {
    if (!editor) return []
    const anchors = commentIdsInDoc(editor.state.doc)
    return comments.filter((comment) => anchors.has(comment.id))
  }, [comments, editor, revision])

  return {
    editor,
    title,
    setTitle,
    authorName,
    setAuthorName,
    layers,
    comments: anchoredComments,
    commentsVisible,
    setCommentsVisible,
    activeLayerId,
    setActiveLayerId,
    paintLayerId,
    exportNotice,
    activeCommentId,
    setActiveCommentId,
    freshCommentId,
    setFreshCommentId,
    revision,
    format,
    dirty,
    selectionCovered,
    addLayer,
    renameLayer,
    recolorLayer,
    setLayerOpacity,
    toggleLayerVisible,
    deleteLayer,
    reorderLayers,
    highlightSelection,
    togglePaintLayer,
    exportLayerExcerpts,
    addComment,
    updateComment,
    deleteComment,
    revealComment,
    toggleMark,
    toggleCenter,
    toggleIndent,
    newDocument,
    openText,
    saveFile,
    exportPdf: () => window.print(),
  }
}

function downloadExcelCsv(filename: string, tsv: string) {
  const bytes = new Uint8Array((tsv.length + 1) * 2)
  const view = new DataView(bytes.buffer)
  view.setUint16(0, 0xfeff, true)
  for (let index = 0; index < tsv.length; index += 1) view.setUint16((index + 1) * 2, tsv.charCodeAt(index), true)
  const blob = new Blob([bytes], { type: 'text/csv;charset=utf-16le' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function scrollToComment(editor: Editor, commentId: string) {
  const root = editor.view.dom
  const target =
    root.querySelector(`[data-comment-anchor="${CSS.escape(commentId)}"]`) ||
    root.querySelector(`[data-comment-ids~="${CSS.escape(commentId)}"]`)
  target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
