import { useActiveTool, type ToolId } from './active-tool-context'

const TOOLS: ReadonlyArray<{ id: ToolId; label: string; title?: string }> = [
  { id: 'select', label: 'Select', title: 'Select. Drag to pan, Shift-drag to marquee.' },
  { id: 'draw-wall', label: 'Draw wall' },
  { id: 'place-opening', label: 'Opening' },
  { id: 'dimension', label: 'Dimension' },
]

export function ToolsPanel() {
  const { tool, setTool } = useActiveTool()
  return (
    <ul className="tools-panel">
      {TOOLS.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            aria-pressed={tool === entry.id}
            title={entry.title}
            onClick={() => setTool(entry.id)}
          >
            {entry.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
