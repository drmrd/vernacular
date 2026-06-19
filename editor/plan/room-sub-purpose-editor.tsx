import { useState, type KeyboardEvent } from 'react'
import { setRoomSubPurpose } from '../../core'
import { Field } from '../design-system'

export interface RoomSubPurposeEditorProps {
  roomKey: string
  subPurpose: string | undefined
  dispatch: (command: unknown) => void
}

export function RoomSubPurposeEditor({ roomKey, subPurpose, dispatch }: RoomSubPurposeEditorProps) {
  const [text, setText] = useState(subPurpose ?? '')
  const inputId = `room-sub-purpose-${roomKey}`

  function commit() {
    dispatch(setRoomSubPurpose(roomKey, text === '' ? undefined : text))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <Field htmlFor={inputId} label="Sub-purpose">
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </Field>
  )
}
