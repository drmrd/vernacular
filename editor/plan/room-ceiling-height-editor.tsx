import { useState, type KeyboardEvent } from 'react'
import {
  formatAdaptiveLength,
  parseLength,
  setRoomCeilingHeight,
  type AssumedUnit,
  type UnitPreferences,
  type UnitSystem,
} from '../../core'

// A bare number entered for a metric project means millimetres; for an imperial
// project it means feet. This is the active system's assume-unit, so a number
// without a unit token still parses.
const ASSUME_UNIT_BY_SYSTEM: Record<UnitSystem, AssumedUnit> = {
  metric: 'mm',
  imperial: 'ft',
}

export interface RoomCeilingHeightEditorProps {
  roomKey: string
  ceilingHeight: number
  dispatch: (command: unknown) => void
  preferences: UnitPreferences
}

export function RoomCeilingHeightEditor({
  roomKey,
  ceilingHeight,
  dispatch,
  preferences,
}: RoomCeilingHeightEditorProps) {
  const formatted = formatAdaptiveLength(ceilingHeight, preferences)
  const [text, setText] = useState(formatted)

  function commit() {
    const assumeUnit = ASSUME_UNIT_BY_SYSTEM[preferences.system]
    try {
      const parsed = parseLength(text, { assumeUnit })
      dispatch(setRoomCeilingHeight(roomKey, parsed))
    } catch {
      // An unparseable entry dispatches nothing; the input keeps its invalid text.
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <label>
      Ceiling height
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}
