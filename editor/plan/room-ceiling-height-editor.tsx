import type { ReactElement } from 'react'
import { setRoomCeilingHeight, type UnitPreferences } from '../../core'
import { LengthField } from './length-field'

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
}: RoomCeilingHeightEditorProps): ReactElement {
  return (
    <LengthField
      inputId={`room-ceiling-height-${roomKey}`}
      label="Ceiling height"
      valueMm={ceilingHeight}
      preferences={preferences}
      onCommitMm={(mm) => dispatch(setRoomCeilingHeight(roomKey, mm))}
    />
  )
}
