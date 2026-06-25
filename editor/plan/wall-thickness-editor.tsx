import type { ReactElement } from 'react'
import { setWallThickness, type UnitPreferences } from '../../core'
import { LengthField } from './length-field'

export interface WallThicknessEditorProps {
  floorId: string
  wallId: string
  thickness: number
  dispatch: (command: unknown) => void
  preferences: UnitPreferences
}

export function WallThicknessEditor({
  floorId,
  wallId,
  thickness,
  dispatch,
  preferences,
}: WallThicknessEditorProps): ReactElement {
  return (
    <LengthField
      inputId={`wall-thickness-${wallId}`}
      label="Thickness"
      valueMm={thickness}
      preferences={preferences}
      onCommitMm={(mm) => dispatch(setWallThickness(floorId, wallId, mm))}
    />
  )
}
