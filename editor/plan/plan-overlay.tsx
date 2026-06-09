import './plan-overlay.css'
import { useState, type FocusEvent, type ReactElement } from 'react'
import type { SceneGraph, UnitPreferences } from '../../core'
import type { SelectionStore } from '../../bridge'
import { dimensionChips, type DimensionChip } from './dimension-chip'
import { EntityProxy } from './entity-proxy'
import { overlayEntities, type OverlayEntity } from './overlay-entities'
import { selectionAnnouncement, snapAnnouncement } from './overlay-announce'
import type { SnapResult } from './snap'
import { useOverlayKeyboard, type OverlayKeyboard } from './use-overlay-keyboard'
import { worldToScreen, type ScreenPoint, type Viewport } from './viewport'

export interface PlanOverlayProps {
  viewport: Viewport
  graph: SceneGraph
  selectedIds: ReadonlySet<string>
  selection: SelectionStore
  preferences: UnitPreferences
  snap: SnapResult | null
}

interface PillProps {
  className: string
  screen: ScreenPoint
  text: string
}

// A read-only label pill anchored at a screen point. Shared by the dimension chips
// and the focus tooltip; the container's translate centers it on the anchor.
function PositionedPill({ className, screen, text }: PillProps): ReactElement {
  return (
    <div className={className} style={{ position: 'absolute', left: screen.x, top: screen.y }}>
      {text}
    </div>
  )
}

interface ProxyLayerProps {
  entities: readonly OverlayEntity[]
  viewport: Viewport
  focusIndex: number
  onSelect: (id: string, additive: boolean) => void
}

// One keyboard/AT proxy per selectable entity, positioned in screen space, with the
// roving tabindex landing on the focused entry.
function ProxyLayer({ entities, viewport, focusIndex, onSelect }: ProxyLayerProps): ReactElement {
  return (
    <>
      {entities.map((entity, index) => (
        <EntityProxy
          key={entity.id}
          entity={entity}
          screen={worldToScreen(entity.anchor, viewport)}
          tabIndex={index === focusIndex ? 0 : -1}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function ChipLayer({ chips }: { chips: readonly DimensionChip[] }): ReactElement {
  return (
    <>
      {chips.map((chip) => (
        <PositionedPill
          key={chip.id}
          className="plan-overlay__chip"
          screen={chip.screen}
          text={chip.label}
        />
      ))}
    </>
  )
}

interface FocusTooltipProps {
  entity: OverlayEntity | undefined
  viewport: Viewport
  visible: boolean
}

// The label pill for the keyboard-focused entity; absent until a proxy holds focus.
function FocusTooltip({ entity, viewport, visible }: FocusTooltipProps): ReactElement | null {
  if (!visible || entity === undefined) {
    return null
  }
  return (
    <PositionedPill
      className="plan-overlay__tooltip"
      screen={worldToScreen(entity.anchor, viewport)}
      text={entity.label}
    />
  )
}

// Ignore focus moving between the overlay's own proxies; only a move outside the
// container hides the tooltip.
function focusLeftContainer(event: FocusEvent<HTMLDivElement>): boolean {
  return !event.currentTarget.contains(event.relatedTarget)
}

interface ProxyListboxProps {
  entities: readonly OverlayEntity[]
  viewport: Viewport
  keyboard: OverlayKeyboard
  onFocusChange: (focused: boolean) => void
}

// The listbox wrapping the entity proxies. It renders only when there are entities
// so an empty listbox (which has no option children) never reaches the accessibility
// tree, and it holds the roving-focus container ref and keyboard handler.
function ProxyListbox({
  entities,
  viewport,
  keyboard,
  onFocusChange,
}: ProxyListboxProps): ReactElement | null {
  if (entities.length === 0) {
    return null
  }
  return (
    <div
      ref={keyboard.containerRef}
      role="listbox"
      aria-label="Plan entities"
      aria-multiselectable="true"
      tabIndex={-1}
      onKeyDown={keyboard.onKeyDown}
      onFocus={() => onFocusChange(true)}
      onBlur={(event) => focusLeftContainer(event) && onFocusChange(false)}
    >
      <ProxyLayer
        entities={entities}
        viewport={viewport}
        focusIndex={keyboard.focusIndex}
        onSelect={keyboard.onSelect}
      />
    </div>
  )
}

/**
 * The accessibility overlay layered over the plan Canvas: one keyboard/AT proxy per
 * selectable entity (positioned via worldToScreen), the dimension chips, a focus
 * tooltip, and a polite live region announcing selection and snap changes. The
 * container is pointer-events: none so pointer selection stays on the Canvas
 * hit-test; only the focusable proxies receive keyboard events. Coverage-excluded
 * glue validated by the accessibility end-to-end spec.
 */
export function PlanOverlay(props: PlanOverlayProps): ReactElement {
  const { viewport, graph, selectedIds, selection, preferences, snap } = props
  const entities = overlayEntities(graph, selectedIds, preferences)
  const keyboard = useOverlayKeyboard(entities.length, selection)
  const [focused, setFocused] = useState(false)
  const focusedEntity = entities[keyboard.focusIndex]
  const selected = entities.filter((entity) => entity.selected)
  const announcement = snap ? snapAnnouncement(snap) : selectionAnnouncement(selected)

  return (
    <div className="plan-overlay">
      <ProxyListbox
        entities={entities}
        viewport={viewport}
        keyboard={keyboard}
        onFocusChange={setFocused}
      />
      <ChipLayer chips={dimensionChips(graph.dimensions, viewport, preferences)} />
      <FocusTooltip entity={focusedEntity} viewport={viewport} visible={focused} />
      <div className="plan-overlay__live" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
