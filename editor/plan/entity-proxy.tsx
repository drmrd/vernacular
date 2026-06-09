import './plan-overlay.css'
import type { KeyboardEvent, ReactElement } from 'react'
import type { OverlayEntity } from './overlay-entities'
import type { ScreenPoint } from './viewport'

export interface EntityProxyProps {
  entity: OverlayEntity
  screen: ScreenPoint
  tabIndex: 0 | -1
  onSelect: (id: string, additive: boolean) => void
}

export function EntityProxy({
  entity,
  screen,
  tabIndex,
  onSelect,
}: EntityProxyProps): ReactElement {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(entity.id, event.shiftKey)
    }
  }

  return (
    <div
      role="option"
      aria-label={entity.label}
      aria-selected={entity.selected}
      tabIndex={tabIndex}
      className="plan-overlay__proxy"
      style={{ position: 'absolute', left: screen.x, top: screen.y }}
      onKeyDown={handleKeyDown}
    />
  )
}
