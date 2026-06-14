import type { Icon } from '@phosphor-icons/react'
import {
  Buildings,
  CursorClick,
  Flame,
  Hand,
  Minus,
  Ruler,
  Stairs,
  Tag,
} from '@phosphor-icons/react'
import { useActiveTool, type ToolId } from './active-tool-context'
import './tools-panel.css'

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
      className={`tools-panel__chip${isActive ? ' tools-panel__chip--active' : ''}`}
      aria-pressed={toolId !== undefined ? isActive : undefined}
      disabled={disabled}
      onClick={toolId !== undefined ? () => setTool(toolId) : undefined}
    >
      {IconComponent ? <IconComponent size={16} aria-hidden="true" /> : null}
      {label}
    </button>
  )
}

export function ToolsPanel() {
  return (
    <div className="tools-panel">
      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Select</span>
        <Chip toolId="select" label="Select" icon={CursorClick} />
        <Chip toolId="pan" label="Pan" icon={Hand} />
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Draw</span>
        <div className="tools-panel__grid">
          <Chip toolId="draw-wall" label="Wall" icon={Minus} />
          <Chip toolId="place-opening" label="Opening" />
        </div>
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Period</span>
        <div className="tools-panel__grid">
          <Chip label="Fireplace" icon={Flame} disabled />
          <Chip label="Chimney" icon={Buildings} disabled />
          <Chip label="Stairs" icon={Stairs} disabled />
        </div>
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Annotate</span>
        <div className="tools-panel__grid">
          <Chip toolId="dimension" label="Dimension" icon={Ruler} />
          <Chip label="Label" icon={Tag} disabled />
        </div>
      </section>
    </div>
  )
}
