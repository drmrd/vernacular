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
  type Command,
  type Opening,
  type OpeningDimensions,
  type UnitPreferences,
  type UnitSystem,
} from '../../core'

// The inspector edits raw millimeter values, so a bare number always means
// millimeters regardless of the active system.
const PARSE_OPTIONS = { assumeUnit: 'mm' } as const

// Default unit preferences for each system. The inspector formats and parses
// against the active system's defaults, mirroring the wall thickness editor.
const PREFERENCES_BY_SYSTEM: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
}

interface LengthFieldProps {
  inputId: string
  label: string
  valueMm: number
  preferences: UnitPreferences
  onCommitMm: (mm: number) => void
}

function LengthField({
  inputId,
  label,
  valueMm,
  preferences,
  onCommitMm,
}: LengthFieldProps): ReactElement {
  const formatted = formatLength(valueMm, lengthFormatOptions(preferences))
  const [text, setText] = useState(formatted)

  function commit(): void {
    try {
      onCommitMm(parseLength(text, PARSE_OPTIONS))
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

// The three editable dimensions, each described by its visible label, the key it
// occupies in a snapshot of the opening, and the suffix for its input id.
interface DimensionDescriptor {
  key: keyof OpeningDimensions
  label: string
  idSuffix: string
}

const DIMENSION_DESCRIPTORS: readonly DimensionDescriptor[] = [
  { key: 'width', label: 'Width', idSuffix: 'width' },
  { key: 'height', label: 'Height', idSuffix: 'height' },
  { key: 'sillHeight', label: 'Sill height', idSuffix: 'sill-height' },
]

function openingDimensions(opening: Opening): OpeningDimensions {
  return { width: opening.width, height: opening.height, sillHeight: opening.sillHeight }
}

interface DimensionFieldsProps {
  opening: Opening
  preferences: UnitPreferences
  onResize: (dimensions: OpeningDimensions) => void
}

function DimensionFields({ opening, preferences, onResize }: DimensionFieldsProps): ReactElement {
  const current = openingDimensions(opening)
  return (
    <>
      {DIMENSION_DESCRIPTORS.map(({ key, label, idSuffix }) => (
        <LengthField
          key={key}
          inputId={`opening-${idSuffix}-${opening.id}`}
          label={label}
          valueMm={current[key]}
          preferences={preferences}
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
  const preferences = PREFERENCES_BY_SYSTEM[units]

  return (
    <div>
      <DimensionFields
        opening={opening}
        preferences={preferences}
        onResize={(dimensions) => dispatch(resizeOpening(floorId, opening.id, dimensions))}
      />
      <OpeningControls floorId={floorId} openingId={opening.id} dispatch={dispatch} />
    </div>
  )
}
