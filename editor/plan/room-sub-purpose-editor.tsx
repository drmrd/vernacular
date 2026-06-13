import { useState, type KeyboardEvent } from 'react'
import { setRoomSubPurpose } from '../../core'

export interface RoomSubPurposeEditorProps {
  roomKey: string
  subPurpose: string | undefined
  dispatch: (command: unknown) => void
}

export function RoomSubPurposeEditor({ roomKey, subPurpose, dispatch }: RoomSubPurposeEditorProps) {
  const [text, setText] = useState(subPurpose ?? '')

  function commit() {
    dispatch(setRoomSubPurpose(roomKey, text === '' ? undefined : text))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commit()
    }
  }

  return (
    <label>
      Sub-purpose
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}
