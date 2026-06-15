import type { ReactElement } from 'react'
import { Button } from '../design-system'
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
      <ul className="floor-switcher__tabs">
        {floors.map((floor) => {
          const isActive = floor.id === activeFloorId
          return (
            <li key={floor.id}>
              <button
                type="button"
                className={`floor-switcher__tab${isActive ? ' floor-switcher__tab--active' : ''}`}
                aria-pressed={isActive}
                onClick={() => onSelectFloor(floor.id)}
              >
                {floor.name}
              </button>
            </li>
          )
        })}
      </ul>
      <Button onClick={onAddFloor}>Add floor</Button>
    </nav>
  )
}
