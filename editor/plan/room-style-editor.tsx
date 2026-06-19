import { builtinStyles, setRoomStyle, type StyleTag } from '../../core'
import { Field } from '../design-system'

export interface RoomStyleEditorProps {
  roomKey: string
  style: StyleTag | undefined
  dispatch: (command: unknown) => void
}

/**
 * Tags a room with a style drawn from the built-in style registry. The
 * controlled select reflects the stored style override's id directly, with a
 * leading "Inherit" option that clears the override so the room inherits its
 * style, and dispatches a set-style command on change.
 */
export function RoomStyleEditor({ roomKey, style, dispatch }: RoomStyleEditorProps) {
  const selectId = `room-style-${roomKey}`

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value
    dispatch(setRoomStyle(roomKey, value === '' ? undefined : { styleId: value }))
  }

  return (
    <Field htmlFor={selectId} label="Style">
      <select id={selectId} value={style?.styleId ?? ''} onChange={handleChange}>
        <option value="">Inherit</option>
        {Object.values(builtinStyles.entries).map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.displayName['en-US']}
          </option>
        ))}
      </select>
    </Field>
  )
}
