import { useState, type ReactElement } from 'react'
import './opening-inspector.css'
import {
  clampOpeningWidth,
  DEFAULT_IMPERIAL_PREFERENCES,
  DEFAULT_METRIC_PREFERENCES,
  flipOpening,
  formatAdaptiveLength,
  inchesToMillimeters,
  millimetersToInches,
  removeOpening,
  resizeOpening,
  roundToDecimalPlaces,
  setOpeningType,
  type Command,
  type Opening,
  type OpeningDimensions,
  type UnitPreferences,
  type UnitSystem,
} from '../../core'
import { Button, Stack } from '../design-system'
import { LengthField } from './length-field'
import { OpeningOptionGroup } from './opening-type-chooser'
import { groupedOpeningTypes } from './opening-type-options'
import { RemoveControl } from './remove-control'

// Decimal places the rounded millimeter value keeps after the whole-plus-fraction
// inch conversion below, chosen to erase floating point noise (e.g. 774.6999999999999)
// without discarding any precision a fractional inch could plausibly need in mm.
const FRACTION_RESULT_PRECISION = 4

const FRACTION_CHIPS = [
  { label: '1/16"', text: '1/16', fraction: 1 / 16 },
  { label: '1/8"', text: '1/8', fraction: 1 / 8 },
  { label: '1/4"', text: '1/4', fraction: 1 / 4 },
  { label: '3/8"', text: '3/8', fraction: 3 / 8 },
  { label: '1/2"', text: '1/2', fraction: 1 / 2 },
  { label: '5/8"', text: '5/8', fraction: 5 / 8 },
  { label: '3/4"', text: '3/4', fraction: 3 / 4 },
  { label: '7/8"', text: '7/8', fraction: 7 / 8 },
] as const

/**
 * Replaces the fractional part of a dimension while preserving its whole inches:
 * a width of 30 1/4" pressed with the 1/2" chip becomes 30 1/2", not 30 3/4".
 * Idempotent by construction, since it always derives from the whole inches
 * already present in valueMm rather than accumulating onto the previous press.
 */
function withFractionSetMm(valueMm: number, fraction: number): number {
  const wholeInches = Math.floor(millimetersToInches(valueMm))
  return roundToDecimalPlaces(
    inchesToMillimeters(wholeInches + fraction),
    FRACTION_RESULT_PRECISION,
  )
}

// Default unit preferences for each system. The inspector formats and parses
// against the active system's defaults, mirroring the wall thickness editor.
const PREFERENCES_BY_UNITS: Record<UnitSystem, UnitPreferences> = {
  metric: DEFAULT_METRIC_PREFERENCES,
  imperial: DEFAULT_IMPERIAL_PREFERENCES,
}

interface FractionChipsProps {
  dimensionLabel: string
  onSetFraction: (fraction: number) => void
}

function FractionChips({ dimensionLabel, onSetFraction }: FractionChipsProps): ReactElement {
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  return (
    <ul
      className="opening-inspector__fraction-chips"
      aria-label={`Fraction chips for ${dimensionLabel}`}
    >
      {FRACTION_CHIPS.map(({ label, text, fraction }) => (
        <li key={label}>
          <button
            type="button"
            aria-label={`Set fraction to ${text} inch`}
            className={`opening-inspector__fraction-chip${activeLabel === label ? ' opening-inspector__fraction-chip--active' : ''}`}
            onClick={() => {
              setActiveLabel(label)
              onSetFraction(fraction)
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
  /** Openings on the same floor; used to clamp a widened opening against same-wall neighbors. */
  siblingOpenings?: readonly Opening[]
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

/**
 * The explanation the width field carries when a same-wall neighbor is what keeps
 * the opening from growing, and nothing when the opening can still grow freely.
 * Derived from the model on every render rather than remembered from the last
 * resize, so it survives the remount an edit to the opening triggers.
 */
function widthLimitNotice(
  opening: Opening,
  siblingOpenings: readonly Opening[],
  preferences: UnitPreferences,
): string | undefined {
  const limitMm = clampOpeningWidth(opening, Number.POSITIVE_INFINITY, siblingOpenings)
  if (!Number.isFinite(limitMm) || opening.width < limitMm) {
    return undefined
  }
  return `Limited to ${formatAdaptiveLength(limitMm, preferences)} by a neighboring opening on this wall.`
}

interface DimensionFieldsProps {
  opening: Opening
  preferences: UnitPreferences
  units: UnitSystem
  onResize: (dimensions: OpeningDimensions) => void
  // Only the width is clamped against neighbors, so only its field is given a notice.
  widthNotice?: string | undefined
}

function DimensionFields({
  opening,
  preferences,
  units,
  onResize,
  widthNotice,
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
            onCommitMm={(value) => onResize({ ...current, [key]: value })}
            {...(key === 'width' && widthNotice !== undefined ? { notice: widthNotice } : {})}
          />
          {units === 'imperial' ? (
            <FractionChips
              dimensionLabel={label}
              onSetFraction={(fraction) =>
                onResize({ ...current, [key]: withFractionSetMm(current[key], fraction) })
              }
            />
          ) : null}
        </Stack>
      ))}
    </>
  )
}

interface OpeningTypeFieldProps {
  opening: Opening
  onChangeType: (type: string) => void
}

function OpeningTypeField({ opening, onChangeType }: OpeningTypeFieldProps): ReactElement {
  const selectId = `opening-type-${opening.id}`
  const { doors, windows } = groupedOpeningTypes()
  return (
    <Stack gap="space-2">
      <label htmlFor={selectId}>Opening type</label>
      <select
        id={selectId}
        value={opening.type}
        onChange={(event) => onChangeType(event.target.value)}
      >
        <OpeningOptionGroup label="Doors" types={doors} />
        <OpeningOptionGroup label="Windows" types={windows} />
      </select>
    </Stack>
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
      <RemoveControl
        targetId={openingId}
        onConfirm={() => dispatch(removeOpening(floorId, openingId))}
      />
    </Stack>
  )
}

export function OpeningInspector({
  floorId,
  opening,
  units,
  siblingOpenings = [],
  dispatch,
}: OpeningInspectorProps): ReactElement {
  const preferences = PREFERENCES_BY_UNITS[units]

  return (
    <Stack gap="space-2">
      <OpeningTypeField
        opening={opening}
        onChangeType={(type) => dispatch(setOpeningType(floorId, opening.id, type))}
      />
      <DimensionFields
        opening={opening}
        preferences={preferences}
        units={units}
        widthNotice={widthLimitNotice(opening, siblingOpenings, preferences)}
        onResize={(dimensions) =>
          dispatch(
            resizeOpening(floorId, opening.id, {
              ...dimensions,
              width: clampOpeningWidth(opening, dimensions.width, siblingOpenings),
            }),
          )
        }
      />
      <OpeningControls floorId={floorId} openingId={opening.id} dispatch={dispatch} />
    </Stack>
  )
}
