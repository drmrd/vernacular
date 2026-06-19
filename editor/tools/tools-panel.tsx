import type { Icon } from '@phosphor-icons/react'
import {
  Buildings,
  CursorClick,
  Door,
  Flame,
  FrameCorners,
  Hand,
  Minus,
  Ruler,
  Stairs,
  Tag,
} from '@phosphor-icons/react'
import { builtinElementTypes, type OpeningFamily } from '../../core'
import { SectionLabel } from '../design-system'
import { useActiveTool, type ToolId } from './active-tool-context'
import { useOpeningTool } from '../plan/opening-tool-context'
import '../design-system/segmented.css'
import './tools-panel.css'

const WINDOW_FAMILIES: ReadonlySet<OpeningFamily> = new Set(['window-fixed', 'window-crank'])

function openingEntries() {
  return Object.values(builtinElementTypes.entries).filter((t) => t.category === 'opening')
}

function isWindowPlacementType(id: string): boolean {
  const type = builtinElementTypes.entries[id]
  const family = type?.opening?.family
  return family !== undefined && WINDOW_FAMILIES.has(family as OpeningFamily)
}

const DEFAULT_DOOR_TYPE: string =
  openingEntries().find(
    (t) => t.opening !== undefined && !WINDOW_FAMILIES.has(t.opening.family as OpeningFamily),
  )?.id ?? 'single-swing-door'

const DEFAULT_WINDOW_TYPE: string =
  openingEntries().find(
    (t) => t.opening !== undefined && WINDOW_FAMILIES.has(t.opening.family as OpeningFamily),
  )?.id ?? 'window-fixed'

interface ChipProps {
  toolId?: ToolId
  label: string
  disabled?: boolean
  icon?: Icon
}

function Chip({ toolId, label, disabled, icon }: ChipProps) {
  const { tool, setTool } = useActiveTool()
  const isActive = toolId !== undefined && tool === toolId
  const IconComponent = icon
  return (
    <button
      type="button"
      className={`ds-segmented__option tools-panel__chip${isActive ? ' is-active' : ''}`}
      aria-pressed={toolId !== undefined ? isActive : undefined}
      disabled={disabled}
      onClick={toolId !== undefined ? () => setTool(toolId) : undefined}
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
      className={`ds-segmented__option tools-panel__chip${isActive ? ' is-active' : ''}`}
      aria-pressed={isActive}
      onClick={handleClick}
    >
      <IconComponent size={16} aria-hidden="true" />
      {label}
    </button>
  )
}

export function ToolsPanel() {
  return (
    <div className="tools-panel">
      <section className="tools-panel__section">
        <SectionLabel className="tools-panel__section-heading">Select</SectionLabel>
        <Chip toolId="select" label="Select" icon={CursorClick} />
        <Chip toolId="pan" label="Pan" icon={Hand} />
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
          <Chip label="Fireplace" icon={Flame} disabled />
          <Chip label="Chimney" icon={Buildings} disabled />
          <Chip label="Stairs" icon={Stairs} disabled />
        </div>
      </section>

      <section className="tools-panel__section">
        <SectionLabel className="tools-panel__section-heading">Annotate</SectionLabel>
        <div className="tools-panel__grid">
          <Chip toolId="dimension" label="Dimension" icon={Ruler} />
          <Chip label="Label" icon={Tag} disabled />
        </div>
      </section>
    </div>
  )
}
