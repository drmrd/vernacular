import type { ReactElement } from 'react'
import { Button, Segmented } from '../design-system'
import './floor-switcher.css'

export interface FloorSummary {
  id: string
  name: string
  /** Elevation in millimeters; absent is treated as ground level (0). */
  elevation?: number
}

export interface FloorSwitcherProps {
  floors: readonly FloorSummary[]
  activeFloorId: string | null
  onSelectFloor: (id: string) => void
  onAddFloor: () => void
}

const GROUND_ELEVATION_MM = 0

// Highest floor first so the list reads top-down like the building: upper floors
// above the ground floor, basements at the bottom. Equal elevations keep their
// given order, so the sort is stable on ties.
function byElevationDescending(floors: readonly FloorSummary[]): FloorSummary[] {
  return [...floors].sort(
    (first, second) =>
      (second.elevation ?? GROUND_ELEVATION_MM) - (first.elevation ?? GROUND_ELEVATION_MM),
  )
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
        options={byElevationDescending(floors).map((floor) => ({
          value: floor.id,
          label: floor.name,
        }))}
        /* '' is the "no floor selected" sentinel: it matches no floor id, so no option reads active. */
        value={activeFloorId ?? ''}
        onSelect={onSelectFloor}
      />
      <Button onClick={onAddFloor}>Add floor</Button>
    </nav>
  )
}
