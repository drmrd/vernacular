import type { ReactElement } from 'react'
import {
  surfaceKey,
  type Color,
  type Command,
  type PaintableSurface,
  type SurfaceRef,
  type SurfaceTreatment,
} from '../../core'
import { ColorPicker } from './color-picker'
import { FinishPicker } from './finish-picker'
import { Stack } from '../design-system'

export interface PaintPanelProps {
  surfaces: readonly PaintableSurface[]
  activeSurface: SurfaceRef | null
  treatmentFor: (ref: SurfaceRef) => SurfaceTreatment | undefined
  recent: Color[]
  onSelectSurface: (ref: SurfaceRef) => void
  dispatch: (command: Command) => void
}

const UNPAINTED = 'none'

function paintHex(treatment: SurfaceTreatment | undefined): string {
  return treatment?.kind === 'solid' ? treatment.color.srgbHex : UNPAINTED
}

function isSurfaceActive(active: SurfaceRef | null, surface: SurfaceRef): boolean {
  return active !== null && surfaceKey(active) === surfaceKey(surface)
}

interface SurfaceRowProps {
  surface: PaintableSurface
  isActive: boolean
  hex: string
  onSelect: () => void
}

function SurfaceRow({ surface, isActive, hex, onSelect }: SurfaceRowProps): ReactElement {
  const isPainted = hex !== UNPAINTED
  return (
    <button type="button" aria-pressed={isActive} data-paint={hex} onClick={onSelect}>
      <span aria-hidden style={{ background: isPainted ? hex : 'transparent' }} />
      {surface.label}
    </button>
  )
}

interface SurfaceSectionProps {
  heading: string
  surfaces: readonly PaintableSurface[]
  activeSurface: SurfaceRef | null
  treatmentFor: (ref: SurfaceRef) => SurfaceTreatment | undefined
  onSelectSurface: (ref: SurfaceRef) => void
}

function SurfaceSection(props: SurfaceSectionProps): ReactElement | null {
  if (props.surfaces.length === 0) {
    return null
  }
  return (
    <Stack>
      <h3>{props.heading}</h3>
      {props.surfaces.map((surface) => (
        <SurfaceRow
          key={surfaceKey(surface.ref)}
          surface={surface}
          isActive={isSurfaceActive(props.activeSurface, surface.ref)}
          hex={paintHex(props.treatmentFor(surface.ref))}
          onSelect={() => props.onSelectSurface(surface.ref)}
        />
      ))}
    </Stack>
  )
}

function ActiveSurfaceEditor(props: PaintPanelProps & { activeSurface: SurfaceRef }): ReactElement {
  const treatment = props.treatmentFor(props.activeSurface)
  const finishId = treatment?.kind === 'solid' ? treatment.finishId : 'matte'
  return (
    <Stack>
      <ColorPicker
        surface={props.activeSurface}
        finishId={finishId}
        recent={props.recent}
        dispatch={props.dispatch}
      />
      {treatment?.kind === 'solid' ? (
        <FinishPicker
          surface={props.activeSurface}
          color={treatment.color}
          finishId={treatment.finishId}
          dispatch={props.dispatch}
        />
      ) : null}
    </Stack>
  )
}

export function PaintPanel(props: PaintPanelProps): ReactElement {
  const walls = props.surfaces.filter((surface) => surface.group === 'wall')
  const floorCeiling = props.surfaces.filter((surface) => surface.group === 'floor-ceiling')
  return (
    <Stack>
      <SurfaceSection
        heading="Walls"
        surfaces={walls}
        activeSurface={props.activeSurface}
        treatmentFor={props.treatmentFor}
        onSelectSurface={props.onSelectSurface}
      />
      <SurfaceSection
        heading="Floor & ceiling"
        surfaces={floorCeiling}
        activeSurface={props.activeSurface}
        treatmentFor={props.treatmentFor}
        onSelectSurface={props.onSelectSurface}
      />
      {props.activeSurface !== null ? (
        <ActiveSurfaceEditor {...props} activeSurface={props.activeSurface} />
      ) : (
        <p>Select a surface to paint</p>
      )}
    </Stack>
  )
}
