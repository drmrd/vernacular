import type { Icon } from '@phosphor-icons/react'
import {
  Buildings,
  CursorClick,
  Door,
  Flame,
  FrameCorners,
  Minus,
  Ruler,
  Stairs,
  Tag,
} from '@phosphor-icons/react'
import { useContext, useSyncExternalStore } from 'react'
import { builtinElementTypes, openingKindOfType, type Floor } from '../../core'
import { ActiveFloorContext } from '../../bridge'
import { EditorSessionContext } from '../../bridge/react/editor-session-context'
import { SectionLabel } from '../design-system'
import { useActiveTool, type ToolId } from './active-tool-context'
import { useOpeningTool } from '../plan/opening-tool-context'
import { placementRefusalMessage } from '../plan/overlay-announce'
import { hasFloorAbove } from '../plan/place-stair'
import { useRovingRadioGroup } from './roving-radio-group'
import '../design-system/segmented.css'
import './tools-panel.css'

function openingEntries() {
  return Object.values(builtinElementTypes.entries).filter((t) => t.category === 'opening')
}

/** The kind of chip an armed placement type belongs to. */
type OpeningChipKind = 'door' | 'window'

// The chip kind an armed placement type belongs to. An unknown or non-opening id
// reads as a door, matching the door-first default the panel arms.
function armedOpeningKind(id: string): OpeningChipKind {
  return openingKindOfType(id) === 'window' ? 'window' : 'door'
}

const DEFAULT_DOOR_TYPE: string =
  openingEntries().find((t) => openingKindOfType(t.id) === 'door')?.id ?? 'single-swing-door'

const DEFAULT_WINDOW_TYPE: string =
  openingEntries().find((t) => openingKindOfType(t.id) === 'window')?.id ?? 'double-hung-window'

const PLANNED_TOOL_REASON = 'Planned, not yet available'

interface ChipProps {
  toolId?: ToolId
  label: string
  unavailable?: boolean
  icon?: Icon
  /** Takes the group's single tab stop when no chip is checked. See `orphanTool`. */
  fallbackTabStop?: boolean
  /** Why an unavailable chip cannot be used; defaults to the planned-tool wording. */
  unavailableReason?: string
}

// The tooltip an unavailable chip carries: the caller's reason when it has one,
// otherwise the planned-tool wording the placeholder chips share. An available chip
// carries no tooltip at all.
function chipTitle({ unavailable, unavailableReason }: ChipProps): string | undefined {
  if (unavailable !== true) {
    return undefined
  }
  return unavailableReason ?? PLANNED_TOOL_REASON
}

function Chip(props: ChipProps) {
  const { toolId, label, unavailable, icon, fallbackTabStop } = props
  const { tool, setTool } = useActiveTool()
  const isActive = toolId !== undefined && tool === toolId
  const IconComponent = icon
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-disabled={unavailable || undefined}
      tabIndex={isActive || fallbackTabStop ? 0 : -1}
      className={`ds-segmented__option tools-panel__chip${isActive ? ' is-active' : ''}`}
      title={chipTitle(props)}
      onClick={toolId !== undefined && !unavailable ? () => setTool(toolId) : undefined}
    >
      {IconComponent ? <IconComponent size={16} aria-hidden="true" /> : null}
      {label}
    </button>
  )
}

interface OpeningChipProps {
  kind: OpeningChipKind
  icon: Icon
  label: string
}

function OpeningChip({ kind, icon, label }: OpeningChipProps) {
  const { tool, setTool } = useActiveTool()
  const { placementType, setPlacementType } = useOpeningTool()
  const defaultType = kind === 'door' ? DEFAULT_DOOR_TYPE : DEFAULT_WINDOW_TYPE
  const armedKind = armedOpeningKind(placementType)
  const isActive = tool === 'place-opening' && armedKind === kind
  const IconComponent = icon

  // Arming this chip's kind only reaches for the default type when the armed type
  // belongs to the other kind. A pocket door stays a pocket door when the Door chip
  // is pressed again, so a press never silently discards the variant the user chose
  // in the type chooser.
  function handleClick() {
    setTool('place-opening')
    if (armedKind !== kind) {
      setPlacementType(defaultType)
    }
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      tabIndex={isActive ? 0 : -1}
      className={`ds-segmented__option tools-panel__chip${isActive ? ' is-active' : ''}`}
      onClick={handleClick}
    >
      <IconComponent size={16} aria-hidden="true" />
      {label}
    </button>
  )
}

// The tools the rack shows a chip for. Some tools are armed from elsewhere in the
// editor (the library panel arms place-furniture, the underlay panel arms
// calibrate), and while one of those runs no chip is checked.
const CHIP_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  'select',
  'draw-wall',
  'place-opening',
  'place-stair',
  'dimension',
])

const NO_FLOORS: readonly Floor[] = []
const IGNORE_CHANGES = () => () => {}

// The rack renders bare in stories and isolated tests, outside the editor session
// and active-floor providers. Reading both contexts directly, rather than through
// the hooks that throw without a provider, keeps that bare render working: with no
// project in scope the panel cannot know the floor stack, so it does not withhold a
// tool over a question it cannot answer.
function useStairsUnavailable(): boolean {
  const session = useContext(EditorSessionContext)
  const activeFloor = useContext(ActiveFloorContext)
  const floors = useSyncExternalStore(
    session?.subscribe ?? IGNORE_CHANGES,
    session === null ? () => NO_FLOORS : () => session.getProject().floors,
  )
  const activeFloorId = useSyncExternalStore(
    activeFloor?.subscribe ?? IGNORE_CHANGES,
    activeFloor === null ? () => null : activeFloor.getActiveFloorId,
  )
  return session !== null && !hasFloorAbove(floors, activeFloorId)
}

// The period-detail chips. Stairs is the one chip the project can withhold: a stair
// spans two floors, so it is offered only while a floor sits above the one in hand,
// and it borrows the refusal the placement glue would otherwise raise on a click.
function PeriodSection() {
  const stairsUnavailable = useStairsUnavailable()
  return (
    <section className="tools-panel__section">
      <SectionLabel className="tools-panel__section-heading">Period</SectionLabel>
      <div className="tools-panel__grid">
        <Chip label="Fireplace" icon={Flame} unavailable />
        <Chip label="Chimney" icon={Buildings} unavailable />
        <Chip
          toolId="place-stair"
          label="Stairs"
          icon={Stairs}
          unavailable={stairsUnavailable}
          unavailableReason={placementRefusalMessage('no-floor-above')}
        />
      </div>
    </section>
  )
}

function ToolRailSections() {
  const { tool } = useActiveTool()
  // A radiogroup with no checked option would leave every chip at tabindex -1 and
  // drop the whole rack out of the tab order, so the first chip holds the tab stop
  // until a chip is checked again.
  const orphanTool = !CHIP_TOOLS.has(tool)
  return (
    <>
      <section className="tools-panel__section">
        <SectionLabel className="tools-panel__section-heading">Select</SectionLabel>
        <Chip toolId="select" label="Select" icon={CursorClick} fallbackTabStop={orphanTool} />
      </section>

      <section className="tools-panel__section">
        <SectionLabel className="tools-panel__section-heading">Draw</SectionLabel>
        <div className="tools-panel__grid">
          <Chip toolId="draw-wall" label="Wall" icon={Minus} />
          <OpeningChip kind="door" icon={Door} label="Door" />
          <OpeningChip kind="window" icon={FrameCorners} label="Window" />
        </div>
      </section>

      <PeriodSection />

      <section className="tools-panel__section">
        <SectionLabel className="tools-panel__section-heading">Annotate</SectionLabel>
        <div className="tools-panel__grid">
          <Chip toolId="dimension" label="Dimension" icon={Ruler} />
          <Chip label="Label" icon={Tag} unavailable />
        </div>
      </section>
    </>
  )
}

export function ToolsPanel() {
  const { containerRef, onKeyDown } = useRovingRadioGroup<HTMLDivElement>()
  return (
    <div
      ref={containerRef}
      className="tools-panel"
      role="radiogroup"
      aria-label="Tools"
      onKeyDown={onKeyDown}
    >
      <ToolRailSections />
    </div>
  )
}
