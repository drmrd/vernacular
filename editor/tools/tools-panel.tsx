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

function isWindowPlacementType(id: string): boolean {
  return openingKindOfType(id) === 'window'
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
}

function Chip({ toolId, label, unavailable, icon }: ChipProps) {
  const { tool, setTool } = useActiveTool()
  const isActive = toolId !== undefined && tool === toolId
  const IconComponent = icon
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-disabled={unavailable || undefined}
      tabIndex={isActive ? 0 : -1}
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
  kind: 'door' | 'window'
  icon: Icon
  label: string
}

function OpeningChip({ kind, icon, label }: OpeningChipProps) {
  const { tool, setTool } = useActiveTool()
  const { placementType, setPlacementType } = useOpeningTool()
  const defaultType = kind === 'door' ? DEFAULT_DOOR_TYPE : DEFAULT_WINDOW_TYPE
  const isWindow = isWindowPlacementType(placementType)
  const isActive = tool === 'place-opening' && (kind === 'window' ? isWindow : !isWindow)
  const IconComponent = icon

  function handleClick() {
    setTool('place-opening')
    setPlacementType(defaultType)
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

function ToolRailSections() {
  return (
    <>
      <section className="tools-panel__section">
        <SectionLabel className="tools-panel__section-heading">Select</SectionLabel>
        <Chip toolId="select" label="Select" icon={CursorClick} />
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
