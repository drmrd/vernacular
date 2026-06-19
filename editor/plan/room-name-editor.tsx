import { useState, type KeyboardEvent } from 'react'
import { setRoomName } from '../../core'
import { Field } from '../design-system'

export interface RoomNameEditorProps {
  roomKey: string
  name: string
  dispatch: (command: ReturnType<typeof setRoomName>) => void
}

export function RoomNameEditor({ roomKey, name, dispatch }: RoomNameEditorProps) {
  const [text, setText] = useState(name)
  const inputId = `room-name-${roomKey}`

  function commit() {
    dispatch(setRoomName(roomKey, text))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commit()
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
      />
    </Field>
  )
}
