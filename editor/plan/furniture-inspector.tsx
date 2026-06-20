import { useState, type KeyboardEvent, type ReactElement } from 'react'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  resizeFurniture,
  rotateFurniture,
  setFurnitureHeight,
  setFurnitureName,
  type AssumedUnit,
  type Command,
  type FurnitureFootprint,
  type FurnitureInstance,
  type UnitPreferences,
  type UnitSystem,
} from '../../core'
import { Field, Stack } from '../design-system'
import { LengthField } from './length-field'

// A bare number entered for a metric project means millimetres; for an imperial
// project it means feet. This mirrors the opening inspector's resolution.
const ASSUME_UNIT_BY_SYSTEM: Record<UnitSystem, AssumedUnit> = {
  metric: 'mm',
  imperial: 'ft',
}

const PREFERENCES_BY_UNITS: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
}

interface NameFieldProps {
  inputId: string
  name: string
  onCommit: (name: string) => void
}

function NameField({ inputId, name, onCommit }: NameFieldProps): ReactElement {
  const [text, setText] = useState(name)

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      onCommit(text)
    }
  }

  return (
    <Field htmlFor={inputId} label="Name">
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onCommit(text)}
      />
    </Field>
  )
}

interface AngleFieldProps {
  inputId: string
  rotation: number
  onCommit: (rotation: number) => void
}

function AngleField({ inputId, rotation, onCommit }: AngleFieldProps): ReactElement {
  const [text, setText] = useState(String(rotation))

  function commit(): void {
    const parsed = Number.parseFloat(text)
    if (Number.isFinite(parsed)) {
      onCommit(parsed)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <Field htmlFor={inputId} label="Angle">
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
    </Field>
  )
}

export interface FurnitureInspectorProps {
  floorId: string
  furniture: FurnitureInstance
  units: UnitSystem
  dispatch: (command: Command) => void
}

interface FootprintFieldsProps {
  furniture: FurnitureInstance
  preferences: UnitPreferences
  assumeUnit: AssumedUnit
  onResize: (footprint: FurnitureFootprint) => void
}

function FootprintFields({
  furniture,
  preferences,
  assumeUnit,
  onResize,
}: FootprintFieldsProps): ReactElement {
  return (
    <>
      <LengthField
        inputId={`furniture-width-${furniture.id}`}
        label="Width"
        valueMm={furniture.footprint.width}
        preferences={preferences}
        assumeUnit={assumeUnit}
        onCommitMm={(mm) => onResize({ ...furniture.footprint, width: mm })}
      />
      <LengthField
        inputId={`furniture-depth-${furniture.id}`}
        label="Depth"
        valueMm={furniture.footprint.depth}
        preferences={preferences}
        assumeUnit={assumeUnit}
        onCommitMm={(mm) => onResize({ ...furniture.footprint, depth: mm })}
      />
    </>
  )
}

export function FurnitureInspector({
  floorId,
  furniture,
  units,
  dispatch,
}: FurnitureInspectorProps): ReactElement {
  const preferences = PREFERENCES_BY_UNITS[units]
  const assumeUnit = ASSUME_UNIT_BY_SYSTEM[units]

  return (
    <Stack gap="space-2">
      <NameField
        inputId={`furniture-name-${furniture.id}`}
        name={furniture.name ?? ''}
        onCommit={(name) => dispatch(setFurnitureName(floorId, furniture.id, name))}
      />
      <AngleField
        inputId={`furniture-angle-${furniture.id}`}
        rotation={furniture.rotation}
        onCommit={(rotation) => dispatch(rotateFurniture(floorId, furniture.id, rotation))}
      />
      <FootprintFields
        furniture={furniture}
        preferences={preferences}
        assumeUnit={assumeUnit}
        onResize={(footprint) => dispatch(resizeFurniture(floorId, furniture.id, footprint))}
      />
      <LengthField
        inputId={`furniture-height-${furniture.id}`}
        label="Height"
        valueMm={furniture.height}
        preferences={preferences}
        assumeUnit={assumeUnit}
        onCommitMm={(mm) => dispatch(setFurnitureHeight(floorId, furniture.id, mm))}
      />
    </Stack>
  )
}
