import type { ReactElement } from 'react'

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
    <nav aria-label="Floors">
      <ul>
        {floors.map((floor) => (
          <li key={floor.id}>
            <button
              type="button"
              className={floor.id === activeFloorId ? 'floor-switcher__tab--active' : undefined}
              aria-pressed={floor.id === activeFloorId}
              onClick={() => onSelectFloor(floor.id)}
            >
              {floor.name}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onAddFloor}>
        Add floor
      </button>
    </nav>
  )
}
