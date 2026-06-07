import { useState, type KeyboardEvent } from 'react'
import { setRoomName } from '../../core'

export interface RoomNameEditorProps {
  roomKey: string
  name: string
  dispatch: (command: ReturnType<typeof setRoomName>) => void
}

export function RoomNameEditor({ roomKey, name, dispatch }: RoomNameEditorProps) {
  const [text, setText] = useState(name)

  function commit() {
    dispatch(setRoomName(roomKey, text))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <label>
      Name
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}
