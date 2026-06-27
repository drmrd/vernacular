import { useState, type FormEvent, type ReactElement } from 'react'
import { planBasement, planUpperFloor, type PlannedFloor } from '../../core'
import { Button, Field, Segmented } from '../design-system'
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
  /** Adds a floor at a default-named, well-ordered placement the switcher computes. */
  onAddFloor: (placement: PlannedFloor) => void
  /** Renames a floor by id; absent hides the inline rename affordance. */
  onRenameFloor?: (id: string, name: string) => void
}

const GROUND_ELEVATION_MM = 0
const FLOOR_NAME_INPUT_ID = 'floor-switcher-name'

// Highest floor first so the list reads top-down like the building: upper floors
// above the ground floor, basements at the bottom. Equal elevations keep their
// given order, so the sort is stable on ties.
function byElevationDescending(floors: readonly FloorSummary[]): FloorSummary[] {
  return [...floors].sort(
    (first, second) =>
      (second.elevation ?? GROUND_ELEVATION_MM) - (first.elevation ?? GROUND_ELEVATION_MM),
  )
}

function elevationsOf(floors: readonly FloorSummary[]): number[] {
  return floors.map((floor) => floor.elevation ?? GROUND_ELEVATION_MM)
}

interface FloorTabsProps {
  floors: readonly FloorSummary[]
  activeFloorId: string | null
  onSelectFloor: (id: string) => void
}

// The floor selector, ordered top-down by elevation.
function FloorTabs({ floors, activeFloorId, onSelectFloor }: FloorTabsProps): ReactElement {
  return (
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
  )
}

interface FloorRenameFormProps {
  initialName: string
  onCommit: (name: string) => void
  onCancel: () => void
}

// Inline editor for the active floor's name. Enter (form submit) commits the
// draft; Escape abandons it and restores the read-only switcher controls.
function FloorRenameForm({ initialName, onCommit, onCancel }: FloorRenameFormProps): ReactElement {
  const [draft, setDraft] = useState(initialName)
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    onCommit(draft)
  }
  return (
    <form className="floor-switcher__rename" onSubmit={submit}>
      <Field htmlFor={FLOOR_NAME_INPUT_ID} label="Floor name">
        <input
          id={FLOOR_NAME_INPUT_ID}
          className="floor-switcher__rename-input"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onCancel()
            }
          }}
        />
      </Field>
      <Button type="submit">Save name</Button>
    </form>
  )
}

interface FloorSwitcherActionsProps {
  floors: readonly FloorSummary[]
  canRename: boolean
  onAddFloor: (placement: PlannedFloor) => void
  onStartRename: () => void
}

// The read-only switcher controls: rename the active floor (when supported), add
// an upper floor above the stack, or add a basement below it.
function FloorSwitcherActions({
  floors,
  canRename,
  onAddFloor,
  onStartRename,
}: FloorSwitcherActionsProps): ReactElement {
  const elevations = elevationsOf(floors)
  return (
    <>
      {canRename ? <Button onClick={onStartRename}>Rename floor</Button> : null}
      <Button onClick={() => onAddFloor(planUpperFloor(elevations))}>Add floor</Button>
      <Button onClick={() => onAddFloor(planBasement(elevations))}>Add basement</Button>
    </>
  )
}

export function FloorSwitcher({
  floors,
  activeFloorId,
  onSelectFloor,
  onAddFloor,
  onRenameFloor,
}: FloorSwitcherProps): ReactElement {
  const [renaming, setRenaming] = useState(false)
  const activeFloor = floors.find((floor) => floor.id === activeFloorId)
  const commitRename = (name: string): void => {
    if (activeFloor !== undefined) {
      onRenameFloor?.(activeFloor.id, name)
    }
    setRenaming(false)
  }
  return (
    <nav className="floor-switcher" aria-label="Floors">
      <FloorTabs floors={floors} activeFloorId={activeFloorId} onSelectFloor={onSelectFloor} />
      {renaming && activeFloor ? (
        <FloorRenameForm
          initialName={activeFloor.name}
          onCommit={commitRename}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <FloorSwitcherActions
          floors={floors}
          canRename={onRenameFloor !== undefined && activeFloor !== undefined}
          onAddFloor={onAddFloor}
          onStartRename={() => setRenaming(true)}
        />
      )}
    </nav>
  )
}
