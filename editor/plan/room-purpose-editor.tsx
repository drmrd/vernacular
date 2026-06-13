import { builtinRoomPurposes, setRoomPurpose, type RoomPurposeId } from '../../core'

export interface RoomPurposeEditorProps {
  roomKey: string
  purpose: RoomPurposeId | undefined
  dispatch: (command: unknown) => void
}

/**
 * Tags a room with a primary purpose drawn from the built-in room-purpose
 * registry. The controlled select reflects the stored override directly, with a
 * leading "Untagged" option that clears the purpose, and dispatches a
 * set-purpose command on change.
 */
export function RoomPurposeEditor({ roomKey, purpose, dispatch }: RoomPurposeEditorProps) {
  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value
    dispatch(setRoomPurpose(roomKey, value === '' ? undefined : value))
  }

  return (
    <label>
      Purpose
      <select value={purpose ?? ''} onChange={handleChange}>
        <option value="">Untagged</option>
        {Object.values(builtinRoomPurposes.entries).map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.displayName['en-US']}
          </option>
        ))}
      </select>
    </label>
  )
}
