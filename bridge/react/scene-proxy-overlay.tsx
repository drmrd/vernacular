import { type KeyboardEvent } from 'react'

import { useProxyRovingFocus } from './use-proxy-roving-focus'

export interface EntityProxy {
  id: string
  label: string
  x: number
  y: number
}

interface SceneProxyOverlayProps {
  proxies: EntityProxy[]
  selectedIds: ReadonlySet<string>
  onSelect: (id: string, additive: boolean) => void
}

function isActivation(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar'
}

function selectionAnnouncement(
  proxies: readonly EntityProxy[],
  selectedIds: ReadonlySet<string>,
): string {
  const names = proxies.filter((proxy) => selectedIds.has(proxy.id)).map((proxy) => proxy.label)
  return names.length === 0 ? 'No entity selected' : `Selected: ${names.join(', ')}`
}

interface OptionProps {
  proxy: EntityProxy
  selected: boolean
  tabIndex: number
  onSelect: (id: string, additive: boolean) => void
}

function EntityProxyOption({ proxy, selected, tabIndex, onSelect }: OptionProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!isActivation(event.key)) return
    event.preventDefault()
    onSelect(proxy.id, event.shiftKey || event.metaKey || event.ctrlKey)
  }
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      // pointer-events none keeps the canvas underneath receiving the pointer pick; the
      // proxies are the keyboard and screen-reader surface, reached by focus, not the mouse.
      style={{ position: 'absolute', left: proxy.x, top: proxy.y, pointerEvents: 'none' }}
    >
      {proxy.label}
    </div>
  )
}

/**
 * The keyboard and screen-reader surface over the opaque 3D canvas: one focusable, labeled
 * option per entity at its projected screen position, with a roving tab order, plus a
 * polite live region naming the selection. The container takes no pointer events (the
 * pointer pick stays on the canvas); only the options are focusable. Coverage tested in
 * jsdom; the live projection and mounting are glue.
 */
export function SceneProxyOverlay({ proxies, selectedIds, onSelect }: SceneProxyOverlayProps) {
  const roving = useProxyRovingFocus(proxies.length)
  return (
    <div
      className="scene-proxy-overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {proxies.length > 0 ? (
        <div
          ref={roving.containerRef}
          role="listbox"
          aria-label="3D entities"
          aria-multiselectable="true"
          tabIndex={-1}
          onKeyDown={roving.onKeyDown}
        >
          {proxies.map((proxy, index) => (
            <EntityProxyOption
              key={proxy.id}
              proxy={proxy}
              selected={selectedIds.has(proxy.id)}
              tabIndex={index === roving.focusIndex ? 0 : -1}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
      <div role="status" aria-live="polite">
        {selectionAnnouncement(proxies, selectedIds)}
      </div>
    </div>
  )
}
