import type { ReactElement } from 'react'
import { Button, Segmented } from '../design-system'
import './floor-switcher.css'

export interface FloorSummary {
  id: string
  name: string
}

export interface FloorSwitcherProps {
  floors: readonly FloorSummary[]
  activeFloorId: string | null
  onSelectFloor: (id: string) => void
  onAddFloor: () => void
}

export function FloorSwitcher({
  floors,
  activeFloorId,
  onSelectFloor,
  onAddFloor,
}: FloorSwitcherProps): ReactElement {
  return (
    <nav className="floor-switcher" aria-label="Floors">
      <Segmented
        label="Floors"
        options={floors.map((floor) => ({ value: floor.id, label: floor.name }))}
        /* '' is the "no floor selected" sentinel: it matches no floor id, so no option reads active. */
        value={activeFloorId ?? ''}
        onSelect={onSelectFloor}
      />
      <Button onClick={onAddFloor}>Add floor</Button>
    </nav>
  )
}
