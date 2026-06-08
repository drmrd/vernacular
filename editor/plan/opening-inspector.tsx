import { useState, type KeyboardEvent, type ReactElement } from 'react'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  flipOpening,
  formatLength,
  lengthFormatOptions,
  parseLength,
  removeOpening,
  resizeOpening,
  type AssumedUnit,
  type Command,
  type Opening,
  type OpeningDimensions,
  type UnitPreferences,
  type UnitSystem,
} from '../../core'

// A bare number entered for a metric project means millimetres; for an imperial
// project it means feet. This is the active system's assume-unit, so a number
// without a unit token still parses, matching the wall thickness editor.
const ASSUME_UNIT_BY_SYSTEM: Record<UnitSystem, AssumedUnit> = {
  metric: 'mm',
  imperial: 'ft',
}

// Default unit preferences for each system. The inspector formats and parses
// against the active system's defaults, mirroring the wall thickness editor.
const PREFERENCES_BY_UNITS: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
}

interface LengthFieldProps {
  inputId: string
  label: string
  valueMm: number
  preferences: UnitPreferences
  assumeUnit: AssumedUnit
  onCommitMm: (mm: number) => void
}

function LengthField({
  inputId,
  label,
  valueMm,
  preferences,
  assumeUnit,
  onCommitMm,
}: LengthFieldProps): ReactElement {
  const formatted = formatLength(valueMm, lengthFormatOptions(preferences))
  const [text, setText] = useState(formatted)

  function commit(): void {
    try {
      onCommitMm(parseLength(text, { assumeUnit }))
    } catch {
      // An unparseable entry dispatches nothing; the input keeps its invalid text.
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

export interface OpeningInspectorProps {
  floorId: string
  opening: Opening
  units: UnitSystem
  dispatch: (command: Command) => void
}

// The three editable dimensions, each described by its visible label and the key
// it occupies in a snapshot of the opening. The input id suffix is derived from
// the key (camelCase to kebab-case) so it never falls out of sync.
interface DimensionDescriptor {
  key: keyof OpeningDimensions
  label: string
}

const DIMENSION_DESCRIPTORS: readonly DimensionDescriptor[] = [
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
  { key: 'sillHeight', label: 'Sill height' },
]

function kebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function openingDimensions(opening: Opening): OpeningDimensions {
  return { width: opening.width, height: opening.height, sillHeight: opening.sillHeight }
}

interface DimensionFieldsProps {
  opening: Opening
  preferences: UnitPreferences
  assumeUnit: AssumedUnit
  onResize: (dimensions: OpeningDimensions) => void
}

function DimensionFields({
  opening,
  preferences,
  assumeUnit,
  onResize,
}: DimensionFieldsProps): ReactElement {
  const current = openingDimensions(opening)
  return (
    <>
      {DIMENSION_DESCRIPTORS.map(({ key, label }) => (
        <LengthField
          key={key}
          inputId={`opening-${kebabCase(key)}-${opening.id}`}
          label={label}
          valueMm={current[key]}
          preferences={preferences}
          assumeUnit={assumeUnit}
          onCommitMm={(value) => onResize({ ...current, [key]: value })}
        />
      ))}
    </>
  )
}

interface OpeningControlsProps {
  floorId: string
  openingId: string
  dispatch: (command: Command) => void
}

function OpeningControls({ floorId, openingId, dispatch }: OpeningControlsProps): ReactElement {
  return (
    <>
      <button type="button" onClick={() => dispatch(flipOpening(floorId, openingId, 'hinge'))}>
        Flip hinge
      </button>
      <button type="button" onClick={() => dispatch(flipOpening(floorId, openingId, 'facing'))}>
        Flip swing
      </button>
      <button type="button" onClick={() => dispatch(removeOpening(floorId, openingId))}>
        Remove
      </button>
    </>
  )
}

export function OpeningInspector({
  floorId,
  opening,
  units,
  dispatch,
}: OpeningInspectorProps): ReactElement {
  const preferences = PREFERENCES_BY_UNITS[units]
  const assumeUnit = ASSUME_UNIT_BY_SYSTEM[units]

  return (
    <div>
      <DimensionFields
        opening={opening}
        preferences={preferences}
        assumeUnit={assumeUnit}
        onResize={(dimensions) => dispatch(resizeOpening(floorId, opening.id, dimensions))}
      />
      <OpeningControls floorId={floorId} openingId={opening.id} dispatch={dispatch} />
    </div>
  )
}
