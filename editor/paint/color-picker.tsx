import { useState } from 'react'
import {
  assignSurfacePaint,
  builtinPalettes,
  readableTextColor,
  type Color,
  type Command,
  type NamedColor,
  type SurfaceRef,
} from '../../core'
import { SectionLabel, Stack } from '../design-system'
import { searchColorNames } from './color-name-search'

export interface ColorPickerProps {
  surface: SurfaceRef
  finishId: string
  recent: Color[]
  dispatch: (command: Command) => void
}

function paletteColors(): NamedColor[] {
  return Object.values(builtinPalettes.entries).flatMap((palette) => palette.colors)
}

// Candidate label colors for a swatch chip: the readable-text helper picks
// whichever reads better on the chip's variable fill.
const SWATCH_LABEL_LIGHT = '#fbf7ef' // vellum-50
const SWATCH_LABEL_DARK = '#2f2615' // umber-900

interface ColorChipProps {
  label: string
  srgbHex: string
  onSelect: () => void
}

function ColorChip({ label, srgbHex, onSelect }: ColorChipProps) {
  const labelColor = readableTextColor(srgbHex, {
    light: SWATCH_LABEL_LIGHT,
    dark: SWATCH_LABEL_DARK,
  })
  return (
    <button
      type="button"
      aria-label={label}
      style={{ background: srgbHex, color: labelColor }}
      onClick={onSelect}
    >
      {label}
    </button>
  )
}

export function ColorPicker({ surface, finishId, recent, dispatch }: ColorPickerProps) {
  const [query, setQuery] = useState('')
  const matches = searchColorNames(query, paletteColors())

  function choose(color: Color) {
    dispatch(assignSurfacePaint(surface, color, finishId))
  }

  return (
    <Stack>
      <label>
        Search colors
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <Stack direction="horizontal">
        {matches.map((named) => (
          <ColorChip
            key={named.name}
            label={named.name}
            srgbHex={named.color.srgbHex}
            onSelect={() => choose(named.color)}
          />
        ))}
      </Stack>
      {recent.length > 0 && (
        <Stack>
          <SectionLabel>Recent colors</SectionLabel>
          <Stack direction="horizontal">
            {recent.map((color) => (
              <ColorChip
                key={color.srgbHex}
                label={color.originalSpec ?? color.srgbHex}
                srgbHex={color.srgbHex}
                onSelect={() => choose(color)}
              />
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}
