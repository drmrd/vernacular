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
import { builtinElementTypes, openingKindOfType } from '../../core'
import { SectionLabel } from '../design-system'
import { useActiveTool, type ToolId } from './active-tool-context'
import { useOpeningTool } from '../plan/opening-tool-context'
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

interface ChipProps {
  toolId?: ToolId
  label: string
  unavailable?: boolean
  icon?: Icon
  /** Takes the group's single tab stop when no chip is checked. See `orphanTool`. */
  fallbackTabStop?: boolean
}

function Chip({ toolId, label, unavailable, icon, fallbackTabStop }: ChipProps) {
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
      title={unavailable ? 'Planned, not yet available' : undefined}
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

      <section className="tools-panel__section">
        <SectionLabel className="tools-panel__section-heading">Period</SectionLabel>
        <div className="tools-panel__grid">
          <Chip label="Fireplace" icon={Flame} unavailable />
          <Chip label="Chimney" icon={Buildings} unavailable />
          <Chip toolId="place-stair" label="Stairs" icon={Stairs} />
        </div>
      </section>

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
