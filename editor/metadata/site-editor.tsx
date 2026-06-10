import { useState, type KeyboardEvent } from 'react'
import { setSiteLocation, type Command, type Site } from '../../core'
import { Stack } from '../design-system'

export interface SiteEditorProps {
  site: Site
  dispatch: (command: Command) => void
}

interface LabeledNumberInputProps {
  label: string
  value: number
  onValueChange: (value: number) => void
  onCommit: (event: KeyboardEvent<HTMLInputElement>) => void
}

function LabeledNumberInput({ label, value, onValueChange, onCommit }: LabeledNumberInputProps) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onValueChange(event.target.valueAsNumber)}
        onKeyDown={onCommit}
      />
    </label>
  )
}

export function SiteEditor({ site, dispatch }: SiteEditorProps) {
  const [latitude, setLatitude] = useState(site.latLong?.latitude ?? 0)
  const [longitude, setLongitude] = useState(site.latLong?.longitude ?? 0)

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      dispatch(setSiteLocation({ latitude, longitude }))
    }
  }

  return (
    <Stack>
      <LabeledNumberInput
        label="Latitude"
        value={latitude}
        onValueChange={setLatitude}
        onCommit={onKeyDown}
      />
      <LabeledNumberInput
        label="Longitude"
        value={longitude}
        onValueChange={setLongitude}
        onCommit={onKeyDown}
      />
    </Stack>
  )
}
