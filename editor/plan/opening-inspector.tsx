import { useState, type ReactElement } from 'react'
import './opening-inspector.css'
import {
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  flipOpening,
  removeOpening,
  resizeOpening,
  type AssumedUnit,
  type Command,
  type Opening,
  type OpeningDimensions,
  type UnitPreferences,
  type UnitSystem,
} from '../../core'
import { Button, Stack } from '../design-system'
import { LengthField } from './length-field'

const INCH_IN_MM = 25.4

const FRACTION_CHIPS = [
  { label: '1/16"', deltaMm: INCH_IN_MM / 16 },
  { label: '1/8"', deltaMm: INCH_IN_MM / 8 },
  { label: '1/4"', deltaMm: INCH_IN_MM / 4 },
  { label: '3/8"', deltaMm: (3 * INCH_IN_MM) / 8 },
  { label: '1/2"', deltaMm: INCH_IN_MM / 2 },
  { label: '5/8"', deltaMm: (5 * INCH_IN_MM) / 8 },
  { label: '3/4"', deltaMm: (3 * INCH_IN_MM) / 4 },
  { label: '7/8"', deltaMm: (7 * INCH_IN_MM) / 8 },
] as const

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

interface FractionChipsProps {
  dimensionLabel: string
  onNudge: (deltaMm: number) => void
}

function FractionChips({ dimensionLabel, onNudge }: FractionChipsProps): ReactElement {
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  return (
    <ul
      className="opening-inspector__fraction-chips"
      aria-label={`Fraction chips for ${dimensionLabel}`}
    >
      {FRACTION_CHIPS.map(({ label, deltaMm }) => (
        <li key={label}>
          <button
            type="button"
            className={`opening-inspector__fraction-chip${activeLabel === label ? ' opening-inspector__fraction-chip--active' : ''}`}
            onClick={() => {
              setActiveLabel(label)
              onNudge(deltaMm)
            }}
          >
            {label}
          </button>
        </li>
      ))}
    </ul>
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
  units: UnitSystem
  onResize: (dimensions: OpeningDimensions) => void
}

function DimensionFields({
  opening,
  preferences,
  assumeUnit,
  units,
  onResize,
}: DimensionFieldsProps): ReactElement {
  const current = openingDimensions(opening)
  return (
    <>
      {DIMENSION_DESCRIPTORS.map(({ key, label }) => (
        <Stack key={key} gap="space-2">
          <LengthField
            inputId={`opening-${kebabCase(key)}-${opening.id}`}
            label={label}
            valueMm={current[key]}
            preferences={preferences}
            assumeUnit={assumeUnit}
            onCommitMm={(value) => onResize({ ...current, [key]: value })}
          />
          {units === 'imperial' ? (
            <FractionChips
              dimensionLabel={label}
              onNudge={(delta) => onResize({ ...current, [key]: current[key] + delta })}
            />
          ) : null}
        </Stack>
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
    <Stack direction="horizontal" gap="space-3">
      <Stack direction="horizontal" gap="space-2">
        <Button
          variant="neutral"
          onClick={() => dispatch(flipOpening(floorId, openingId, 'hinge'))}
        >
          Flip hinge
        </Button>
        <Button
          variant="neutral"
          onClick={() => dispatch(flipOpening(floorId, openingId, 'facing'))}
        >
          Flip swing
        </Button>
      </Stack>
      <Stack direction="horizontal" gap="space-2">
        <Button variant="destructive" onClick={() => dispatch(removeOpening(floorId, openingId))}>
          Remove
        </Button>
      </Stack>
    </Stack>
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
    <Stack gap="space-2">
      <DimensionFields
        opening={opening}
        preferences={preferences}
        assumeUnit={assumeUnit}
        units={units}
        onResize={(dimensions) => dispatch(resizeOpening(floorId, opening.id, dimensions))}
      />
      <OpeningControls floorId={floorId} openingId={opening.id} dispatch={dispatch} />
    </Stack>
  )
}
