import { builtinPeriods, setRoomPeriod, type PeriodId } from '../../core'
import { Field } from '../design-system'

export interface RoomPeriodEditorProps {
  roomKey: string
  period: PeriodId | undefined
  dispatch: (command: unknown) => void
}

/**
 * Tags a room with a period drawn from the built-in period registry. The
 * controlled select reflects the stored period override directly, with a leading
 * "Inherit" option that clears the override so the room inherits its period, and
 * dispatches a set-period command on change.
 */
export function RoomPeriodEditor({ roomKey, period, dispatch }: RoomPeriodEditorProps) {
  const selectId = `room-period-${roomKey}`

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value
    dispatch(setRoomPeriod(roomKey, value === '' ? undefined : value))
  }

  return (
    <Field htmlFor={selectId} label="Period">
      <select id={selectId} value={period ?? ''} onChange={handleChange}>
        <option value="">Inherit</option>
        {Object.values(builtinPeriods.entries).map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.displayName['en-US']}
          </option>
        ))}
      </select>
    </Field>
  )
}
