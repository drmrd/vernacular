import './plan-overlay.css'
import { useState, type FocusEvent, type ReactElement } from 'react'
import type { Point, SceneGraph, UnitPreferences } from '../../core'
import type { SelectionStore } from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { dimensionChips, type DimensionChip } from './dimension-chip'
import type { DragReadout } from './drag-readout'
import type { PreviewSegment } from './draw-plan'
import { formatReadout, segmentReadout } from './draw-readout'
import { EntityProxy } from './entity-proxy'
import { overlayEntities, type OverlayEntity } from './overlay-entities'
import {
  angleLockAnnouncement,
  selectionAnnouncement,
  snapAnnouncement,
  snapStatusLabel,
} from './overlay-announce'
import type { SnapResult } from './snap'
import { Compass } from './compass'
import { scaleBar } from './scale-bar'
import { useOverlayKeyboard, type OverlayKeyboard } from './use-overlay-keyboard'
import { worldToScreen, type ScreenPoint, type Viewport } from './viewport'

// The width the scale bar reaches toward before rounding down to a nice round
// distance; a bar near this many pixels reads clearly without crowding the corner.
const SCALE_BAR_TARGET_PX = 80

export interface PlanOverlayProps {
  viewport: Viewport
  graph: SceneGraph
  selectedIds: ReadonlySet<string>
  selection: SelectionStore
  preferences: UnitPreferences
  snap: SnapResult | null
  // The active tool, used to gate the keyboard authoring candidate marker so it
  // never paints under the select tool (the at-rest visual-regression state).
  tool: ToolId
  // The in-progress wall-draw segment, present only while drawing, which drives the
  // live readout chip and the angle-lock announcement.
  preview?: PreviewSegment
  // The live drag readout pill (anchor and text), present only while a move-drag
  // runs. The wall draw and the move drag never co-occur, so this is independent of
  // the preview-driven readout chip.
  readout?: DragReadout
  // The keyboard authoring candidate point, marked on the canvas while a creative
  // tool is active so a keyboard user can see where Enter will drop geometry.
  authoringCandidate?: Point
  // The live keyboard authoring announcement ("Wall vertex dropped", etc.); when
  // non-empty it wins the single live region over the snap/selection text.
  authoringAnnouncement?: string
}

// The creative tools that drop free points on the canvas, which the keyboard
// authoring candidate marker paints under. Gated as a set so the marker never
// renders at rest under select, keeping the home screenshot byte-identical.
const CREATIVE_AUTHORING_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  'draw-wall',
  'dimension',
  'place-opening',
  'place-furniture',
])

function isCreativeAuthoringTool(tool: ToolId): boolean {
  return CREATIVE_AUTHORING_TOOLS.has(tool)
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

interface CandidateMarkerProps {
  candidate: Point | undefined
  tool: ToolId
  viewport: Viewport
}

// The small marker showing where the keyboard authoring candidate sits, so a
// keyboard user can see where Enter will drop geometry. It paints only while a
// creative tool is active, so it is absent at rest under the select tool and the
// home screenshot stays byte-identical.
function CandidateMarker({ candidate, tool, viewport }: CandidateMarkerProps): ReactElement | null {
  if (candidate === undefined || !isCreativeAuthoringTool(tool)) {
    return null
  }
  const screen = worldToScreen(candidate, viewport)
  return (
    <div
      className="plan-overlay__candidate"
      data-testid="plan-authoring-candidate"
      style={{ position: 'absolute', left: screen.x, top: screen.y }}
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

// The live-region text. A keyboard authoring step ("Wall vertex dropped") wins
// while authoring, so the user hears the geometry they just dropped rather than a
// snap. Otherwise an engaged angle lock reads as its bearing ("Locked to 90
// degrees"), then the active snap, then the current selection.
function liveAnnouncement(props: PlanOverlayProps, selected: readonly OverlayEntity[]): string {
  const { authoringAnnouncement, snap, preview } = props
  if (authoringAnnouncement !== undefined && authoringAnnouncement !== '') {
    return authoringAnnouncement
  }
  if (snap?.kind === 'angle' && preview) {
    return angleLockAnnouncement(segmentReadout(preview).bearingDeg)
  }
  if (snap) {
    return snapAnnouncement(snap)
  }
  return selectionAnnouncement(selected)
}

interface ReadoutPillProps {
  screen: ScreenPoint
  text: string
}

// The near-cursor readout pill, anchored at a screen point. Shared by the in-progress
// wall draw (its length and bearing at the snapped segment end) and a live drag (its
// pre-formatted text at the drag's live point); the move drag and wall draw never
// co-occur, so a single pill class serves both.
function ReadoutPill({ screen, text }: ReadoutPillProps): ReactElement {
  return <PositionedPill className="plan-overlay__readout" screen={screen} text={text} />
}

interface OverlayReadoutsProps {
  viewport: Viewport
  preferences: UnitPreferences
  preview: PreviewSegment | undefined
  readout: DragReadout | undefined
}

// The pair of near-cursor readout pills: the in-progress wall draw's length/bearing
// at the snapped segment end, and a live move drag's pre-formatted text at its anchor.
// The two never co-occur, so each renders only when its source is present.
function OverlayReadouts({
  viewport,
  preferences,
  preview,
  readout,
}: OverlayReadoutsProps): ReactElement {
  return (
    <>
      {preview ? (
        <ReadoutPill
          screen={worldToScreen(preview.end, viewport)}
          text={formatReadout(segmentReadout(preview), preferences)}
        />
      ) : null}
      {readout ? (
        <ReadoutPill screen={worldToScreen(readout.anchor, viewport)} text={readout.text} />
      ) : null}
    </>
  )
}

// The brass scale bar in the lower-right of the plan stage: a tick bar whose width
// is a nice round distance at the current zoom, with that distance labeled beneath.
// It re-measures on every viewport change, so the labeled length tracks the zoom.
function ScaleBar({
  viewport,
  preferences,
}: {
  viewport: Viewport
  preferences: UnitPreferences
}): ReactElement {
  const segment = scaleBar(viewport.scale, preferences, SCALE_BAR_TARGET_PX)
  return (
    <div className="plan-overlay__scale-bar" aria-hidden="true">
      <span className="plan-overlay__scale-bar-track" style={{ width: segment.lengthPx }} />
      <span className="plan-overlay__scale-bar-label">{segment.label}</span>
    </div>
  )
}

/**
 * The accessibility overlay layered over the plan Canvas: one keyboard/AT proxy per
 * selectable entity (positioned via worldToScreen), the dimension chips, a focus
 * tooltip, the in-progress draw readout, and a polite live region announcing selection,
 * snap, and angle-lock changes. The container is pointer-events: none so pointer
 * selection stays on the Canvas hit-test; only the focusable proxies receive keyboard
 * events. Coverage-excluded glue validated by the accessibility and smart-angle-snap
 * end-to-end specs.
 */
export function PlanOverlay(props: PlanOverlayProps): ReactElement {
  const { viewport, graph, selectedIds, selection, preferences, snap, preview, readout } = props
  const { tool, authoringCandidate } = props
  const entities = overlayEntities(graph, selectedIds, preferences)
  const keyboard = useOverlayKeyboard(entities.length, selection)
  const [focused, setFocused] = useState(false)
  const focusedEntity = entities[keyboard.focusIndex]
  const selected = entities.filter((entity) => entity.selected)
  const announcement = liveAnnouncement(props, selected)
  const snapStatus = snapStatusLabel(snap)

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
      <CandidateMarker candidate={authoringCandidate} tool={tool} viewport={viewport} />
      <OverlayReadouts
        viewport={viewport}
        preferences={preferences}
        preview={preview}
        readout={readout}
      />
      <div className="plan-overlay__annotations">
        <Compass />
        <ScaleBar viewport={viewport} preferences={preferences} />
      </div>
      {snapStatus ? <output className="plan-overlay__snap-status">{snapStatus}</output> : null}
      <div className="plan-overlay__live" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
