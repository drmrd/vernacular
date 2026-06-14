import type { ReactElement } from 'react'
import { FloorSwitcher, type FloorSummary } from './floor-switcher'
import './status-bar.css'

export interface StatusBarProps {
  floors: readonly FloorSummary[]
  activeFloorId: string | null
  onSelectFloor: (id: string) => void
  onAddFloor: () => void
}

export function StatusBar({
  floors,
  activeFloorId,
  onSelectFloor,
  onAddFloor,
}: StatusBarProps): ReactElement {
  return (
    <div className="status-bar">
      <FloorSwitcher
        floors={floors}
        activeFloorId={activeFloorId}
        onSelectFloor={onSelectFloor}
        onAddFloor={onAddFloor}
      />
      <span className="status-bar__tool" />
      <span className="status-bar__coords" />
      <span className="status-bar__snap" />
    </div>
  )
}
