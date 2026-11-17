import { useState } from 'react'
import { clampOpacity } from '../model/color'
import type { Layer } from '../model/types'
import { IconEye, IconEyeOff, IconGrip } from './icons'

type Props = {
  layers: Layer[]
  activeId: string | null
  paintId: string | null
  exportNotice: string | null
  selectionEmpty: boolean
  selectionCovered: boolean
  onAdd: () => void
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onColor: (id: string, color: string) => void
  onOpacity: (id: string, opacity: number) => void
  onToggleVisible: (id: string) => void
  onTogglePaint: (id: string) => void
  onExport: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (from: number, to: number) => void
  onHighlight: () => void
}

export function LayerPanel({
  layers,
  activeId,
  paintId,
  exportNotice,
  selectionEmpty,
  selectionCovered,
  onAdd,
  onSelect,
  onRename,
  onColor,
  onOpacity,
  onToggleVisible,
  onTogglePaint,
  onExport,
  onDelete,
  onReorder,
  onHighlight,
}: Props) {
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const active = layers.find((layer) => layer.id === activeId) ?? null
  const painting = layers.find((layer) => layer.id === paintId) ?? null

  return (
    <aside className="layers">
      <div className="layer-head">
        <div>
          <h2>Highlight layers</h2>
          <p>The top row paints over the rows below it.</p>
        </div>
        <button type="button" className="add-layer" onClick={onAdd}>
          Add layer
        </button>
      </div>
      <div className="layer-list">
        {layers.length === 0 ? (
          <p className="layer-empty">Add a layer, then select words or a whole scene and highlight them.</p>
        ) : (
          layers.map((layer, index) => (
            <div
              key={layer.id}
              className={[
                'layer-row',
                layer.id === activeId ? 'is-active' : '',
                layer.id === paintId ? 'is-painting' : '',
                dropIndex === index ? 'is-drop' : '',
                layer.visible ? '' : 'is-hidden',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseDown={() => onSelect(layer.id)}
              onClick={() => onSelect(layer.id)}
              onDragOver={(event) => {
                event.preventDefault()
                setDropIndex(index)
              }}
              onDragLeave={() => setDropIndex((current) => (current === index ? null : current))}
              onDrop={(event) => {
                event.preventDefault()
                const from = Number(event.dataTransfer.getData('text/plain'))
                if (Number.isInteger(from)) onReorder(from, index)
                setDropIndex(null)
              }}
              style={layer.id === activeId ? { boxShadow: `inset 3px 0 0 ${layer.color}` } : undefined}
            >
              <button
                type="button"
                className="grip"
                draggable
                aria-label={`Drag ${layer.name}`}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', String(index))
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <IconGrip />
              </button>
              <button
                type="button"
                className="eye"
                aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                aria-pressed={layer.visible}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleVisible(layer.id)
                }}
              >
                {layer.visible ? <IconEye /> : <IconEyeOff />}
              </button>
              <input
                className="swatch"
                type="color"
                aria-label={`${layer.name} color`}
                value={layer.color}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onColor(layer.id, event.target.value)}
              />
              <input
                className="layer-name"
                aria-label={`${layer.name} name`}
                value={layer.name}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onRename(layer.id, event.target.value)}
                onBlur={(event) => {
                  if (!event.target.value.trim()) onRename(layer.id, 'Layer')
                }}
              />
              <div className="layer-order">
                <button
                  type="button"
                  aria-label={`Move ${layer.name} up`}
                  disabled={index === 0}
                  onClick={(event) => {
                    event.stopPropagation()
                    onReorder(index, index - 1)
                  }}
                >
                  Up
                </button>
                <button
                  type="button"
                  aria-label={`Move ${layer.name} down`}
                  disabled={index === layers.length - 1}
                  onClick={(event) => {
                    event.stopPropagation()
                    onReorder(index, index + 1)
                  }}
                >
                  Down
                </button>
              </div>
              <label className="opacity" onClick={(event) => event.stopPropagation()}>
                <span>{Math.round(layer.opacity * 100)}%</span>
                <input
                  type="range"
                  min={0.15}
                  max={0.75}
                  step={0.05}
                  value={layer.opacity}
                  aria-label={`${layer.name} opacity`}
                  style={{ accentColor: layer.color }}
                  onChange={(event) => onOpacity(layer.id, clampOpacity(Number(event.target.value)))}
                />
              </label>
              <div className="layer-actions" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className={layer.id === paintId ? 'paint-toggle is-on' : 'paint-toggle'}
                  aria-pressed={layer.id === paintId}
                  aria-label={
                    layer.id === paintId
                      ? `Stop painting with ${layer.name}`
                      : `Paint with ${layer.name} while selecting`
                  }
                  style={layer.id === paintId ? { background: layer.color } : undefined}
                  onClick={() => onTogglePaint(layer.id)}
                >
                  {layer.id === paintId ? 'Painting' : 'Paint'}
                </button>
                <button
                  type="button"
                  className="export-layer"
                  aria-label={`Export excerpts from ${layer.name}`}
                  onClick={() => onExport(layer.id)}
                >
                  Export
                </button>
              </div>
              <button
                type="button"
                className="delete-layer"
                aria-label={`Delete ${layer.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(layer.id)
                }}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
      <div className="layer-foot">
        <button
          type="button"
          className="highlight-action"
          disabled={!active || selectionEmpty}
          onClick={onHighlight}
          style={active && !selectionEmpty ? { background: active.color } : undefined}
        >
          {selectionCovered ? 'Clear highlight' : 'Highlight selection'}
        </button>
        {exportNotice ? <p className="export-notice">{exportNotice}</p> : null}
        <p>
          {painting
            ? `Painting with ${painting.name}. Double-click a word or drag across text to highlight it. Do the same on text that already has this layer to remove it.`
            : 'Turn on Paint to highlight by selecting. Ctrl+Shift+H still applies the armed layer, and applying it again removes only that layer.'}
        </p>
      </div>
    </aside>
  )
}
