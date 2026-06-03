import { useActiveTool, type ToolId } from './active-tool-context'

const TOOLS: ReadonlyArray<{ id: ToolId; label: string }> = [
  { id: 'draw-wall', label: 'Draw wall' },
  { id: 'select', label: 'Select' },
]

export function ToolsPanel() {
  const { tool, setTool } = useActiveTool()
  return (
    <ul className="tools-panel">
      {TOOLS.map((entry) => (
        <li key={entry.id}>
          <button type="button" aria-pressed={tool === entry.id} onClick={() => setTool(entry.id)}>
            {entry.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
