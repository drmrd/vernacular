import type { ReactElement, ReactNode } from 'react'
import { FloorSwitcher, type FloorSummary } from './floor-switcher'
import './status-bar.css'

export interface StatusBarProps {
  floors: readonly FloorSummary[]
  activeFloorId: string | null
  onSelectFloor: (id: string) => void
  onAddFloor: () => void
  tool?: ReactNode
  snap?: ReactNode
  units?: ReactNode
}

export function StatusBar({
  floors,
  activeFloorId,
  onSelectFloor,
  onAddFloor,
  tool,
  snap,
  units,
}: StatusBarProps): ReactElement {
  return (
    <div className="status-bar">
      <FloorSwitcher
        floors={floors}
        activeFloorId={activeFloorId}
        onSelectFloor={onSelectFloor}
        onAddFloor={onAddFloor}
      />
      <span className="status-bar__tool">{tool}</span>
      <span className="status-bar__coords" />
      <span className="status-bar__snap">{snap}</span>
      <span className="status-bar__units">{units}</span>
    </div>
  )
}
