import type { ReactElement } from 'react'
import type { EnvironmentState, LightingMode, Site } from '../../core'
import { Segmented, Stack, type SegmentedOption } from '../design-system'

const LIGHTING_MODES: readonly LightingMode[] = ['schematic', 'realistic']

const LIGHTING_MODE_LABELS: Record<LightingMode, string> = {
  schematic: 'Schematic',
  realistic: 'Realistic',
}

const LIGHTING_MODE_OPTIONS: SegmentedOption[] = LIGHTING_MODES.map((value) => ({
  value,
  label: LIGHTING_MODE_LABELS[value],
}))

function isLightingMode(value: string): value is LightingMode {
  return (LIGHTING_MODES as readonly string[]).includes(value)
}

// Shown when realistic lighting is requested but the site has no coordinates to
// place the sun; the bridge falls back to schematic lighting until they are set.
const MISSING_LOCATION_NOTICE =
  'Realistic lighting needs the site location. Set latitude and longitude in the Site panel; until then the view falls back to schematic lighting.'

// Shown when the site has coordinates but no timezone; solar time is then
// estimated from the longitude alone, which is close but not exact.
const MISSING_TIMEZONE_NOTICE =
  'The site has no timezone, so solar time is estimated from its longitude. Set the timezone in the Site panel for exact sun angles.'

export interface EnvironmentPanelProps {
  site: Site | undefined
  environment: EnvironmentState
  onEnvironmentChange: (next: EnvironmentState) => void
}

function LocationReadout({ site }: { site: Site | undefined }): ReactElement {
  const latLong = site?.latLong
  if (latLong === undefined) {
    return <p>Location: not set</p>
  }
  const zone = site?.timezone === undefined ? '' : `, timezone ${site.timezone}`
  return (
    <p>
      Latitude {latLong.latitude}, longitude {latLong.longitude}
      {zone}
    </p>
  )
}

function EnvironmentNotices({
  mode,
  site,
}: {
  mode: LightingMode
  site: Site | undefined
}): ReactElement | null {
  if (mode !== 'realistic') {
    return null
  }
  if (site?.latLong === undefined) {
    return (
      <p role="status" aria-live="polite">
        {MISSING_LOCATION_NOTICE}
      </p>
    )
  }
  if (site.timezone === undefined) {
    return (
      <p role="status" aria-live="polite">
        {MISSING_TIMEZONE_NOTICE}
      </p>
    )
  }
  return null
}

export function EnvironmentPanel({
  site,
  environment,
  onEnvironmentChange,
}: EnvironmentPanelProps): ReactElement {
  const handleModeSelect = (value: string) => {
    if (isLightingMode(value)) onEnvironmentChange({ ...environment, mode: value })
  }
  return (
    <Stack>
      <Segmented
        label="Lighting mode"
        options={LIGHTING_MODE_OPTIONS}
        value={environment.mode}
        onSelect={handleModeSelect}
      />
      <LocationReadout site={site} />
      <EnvironmentNotices mode={environment.mode} site={site} />
    </Stack>
  )
}
