import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import './length-field.css'
import {
  formatEntryMagnitude,
  parseLength,
  type AssumedUnit,
  type UnitPreferences,
  type UnitSystem,
} from '../../core'
import { Field, Segmented, type SegmentedOption } from '../design-system'
import { lengthRejectionMessage } from './length-rejection-message'

// The selectable entry units per system, in display order. The value and label
// are both the unit string so the picker reads as plain "m / cm / mm".
const ENTRY_UNITS: Record<UnitSystem, readonly AssumedUnit[]> = {
  metric: ['m', 'cm', 'mm'],
  imperial: ['ft', 'in'],
}

// The unit a bare number is read as until the user picks another.
const DEFAULT_ENTRY_UNIT: Record<UnitSystem, AssumedUnit> = {
  metric: 'm',
  imperial: 'ft',
}

function entryOptions(system: UnitSystem): SegmentedOption[] {
  return ENTRY_UNITS[system].map((unit) => ({ value: unit, label: unit }))
}

interface UnitPickerProps {
  label: string
  system: UnitSystem
  entryUnit: AssumedUnit
  onSelect: (value: string) => void
  onPress: () => void
}

// The entry-unit picker. The press handler flags an in-progress unit switch so the
// input's blur re-expresses the value instead of committing it. Naming the group
// through `title` keeps it out of label-text queries that target the input.
function UnitPicker({
  label,
  system,
  entryUnit,
  onSelect,
  onPress,
}: UnitPickerProps): ReactElement {
  return (
    <span className="length-field__unit" onMouseDown={onPress}>
      <Segmented
        title={`${label} unit`}
        options={entryOptions(system)}
        value={entryUnit}
        onSelect={onSelect}
      />
    </span>
  )
}

export interface LengthFieldProps {
  inputId: string
  label: string
  valueMm: number
  preferences: UnitPreferences
  onCommitMm: (mm: number) => void
}

interface LengthEntry {
  // Read-only state.
  entryUnit: AssumedUnit
  text: string
  error: string | null
  // Callbacks.
  setText: (text: string) => void
  commit: () => void
  handleBlur: () => void
  changeUnit: (next: string) => void
  pressUnit: () => void
}

interface CommitSinks {
  onCommitMm: (mm: number) => void
  setError: (message: string | null) => void
}

// Parses the text in the selected unit and dispatches it, recording a rejection
// message instead when the command or the entry is refused.
function commitText(text: string, entryUnit: AssumedUnit, sinks: CommitSinks): void {
  try {
    sinks.onCommitMm(parseLength(text, { assumeUnit: entryUnit }))
    sinks.setError(null)
  } catch (err) {
    // A rejected command or unparseable entry keeps the text without dispatching.
    const message = lengthRejectionMessage(err)
    if (message) {
      sinks.setError(message)
    }
  }
}

// Re-express the current text in millimetres, falling back to the committed value
// when the entry cannot be parsed so a unit switch never loses the field.
function currentMm(text: string, entryUnit: AssumedUnit, fallbackMm: number): number {
  try {
    return parseLength(text, { assumeUnit: entryUnit })
  } catch {
    return fallbackMm
  }
}

// Drives the editable text and selected entry unit. Pressing a unit button steals
// focus from the input; the switching flag turns that blur into a re-express rather
// than a commit, so a unit switch never dispatches a resize.
function useLengthEntry(
  system: UnitSystem,
  valueMm: number,
  onCommitMm: (mm: number) => void,
): LengthEntry {
  const switchingUnit = useRef(false)
  const [entryUnit, setEntryUnit] = useState<AssumedUnit>(DEFAULT_ENTRY_UNIT[system])
  const [text, setText] = useState(() => formatEntryMagnitude(valueMm, DEFAULT_ENTRY_UNIT[system]))
  const [error, setError] = useState<string | null>(null)

  const commit = (): void => commitText(text, entryUnit, { onCommitMm, setError })

  function changeUnit(next: string): void {
    // Ignore an unrecognised option so a stray value never formats with a bad unit.
    if (!ENTRY_UNITS[system].includes(next as AssumedUnit)) {
      return
    }
    const nextUnit = next as AssumedUnit
    setText(formatEntryMagnitude(currentMm(text, entryUnit, valueMm), nextUnit))
    setEntryUnit(nextUnit)
    setError(null)
    switchingUnit.current = false
  }

  return {
    entryUnit,
    text,
    error,
    setText,
    commit,
    handleBlur: () => {
      if (!switchingUnit.current) commit()
    },
    changeUnit,
    pressUnit: () => {
      switchingUnit.current = true
    },
  }
}

/**
 * A unit-aware length input whose entry unit is user-selectable via a segmented
 * picker, decoupled from how values are displayed elsewhere. The text holds a bare
 * magnitude in the chosen entry unit; an unparseable entry dispatches nothing and
 * keeps its text. Shared by the opening and furniture inspectors.
 */
export function LengthField({
  inputId,
  label,
  valueMm,
  preferences,
  onCommitMm,
}: LengthFieldProps): ReactElement {
  const system = preferences.system
  const entry = useLengthEntry(system, valueMm, onCommitMm)

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      entry.commit()
    }
  }

  return (
    <div className="length-field">
      <Field htmlFor={inputId} label={label} hint={entry.error ?? undefined}>
        <input
          id={inputId}
          type="text"
          value={entry.text}
          aria-invalid={entry.error ? 'true' : undefined}
          onChange={(event) => entry.setText(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={entry.handleBlur}
        />
      </Field>
      <UnitPicker
        label={label}
        system={system}
        entryUnit={entry.entryUnit}
        onSelect={entry.changeUnit}
        onPress={entry.pressUnit}
      />
    </div>
  )
}
