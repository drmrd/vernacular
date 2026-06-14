import { useActiveTool, type ToolId } from './active-tool-context'
import './tools-panel.css'

interface ChipProps {
  toolId?: ToolId
  label: string
  disabled?: boolean
}

function Chip({ toolId, label, disabled }: ChipProps) {
  const { tool, setTool } = useActiveTool()
  const isActive = toolId !== undefined && tool === toolId
  return (
    <button
      type="button"
      className={`tools-panel__chip${isActive ? ' tools-panel__chip--active' : ''}`}
      aria-pressed={toolId !== undefined ? isActive : undefined}
      disabled={disabled}
      onClick={toolId !== undefined ? () => setTool(toolId) : undefined}
    >
      {label}
    </button>
  )
}

export function ToolsPanel() {
  return (
    <div className="tools-panel">
      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Select</span>
        <Chip toolId="select" label="Select" />
        <Chip toolId="pan" label="Pan" />
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Draw</span>
        <div className="tools-panel__grid">
          <Chip toolId="draw-wall" label="Wall" />
          <Chip toolId="place-opening" label="Opening" />
        </div>
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Period</span>
        <div className="tools-panel__grid">
          <Chip label="Fireplace" disabled />
          <Chip label="Chimney" disabled />
          <Chip label="Stairs" disabled />
        </div>
      </section>

      <section className="tools-panel__section">
        <span className="tools-panel__section-label">Annotate</span>
        <div className="tools-panel__grid">
          <Chip toolId="dimension" label="Dimension" />
          <Chip label="Label" disabled />
        </div>
      </section>
    </div>
  )
}
