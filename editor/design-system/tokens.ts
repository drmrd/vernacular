export interface Token {
  readonly name: `--${string}`
  readonly variable: string
}

function token(name: `--${string}`): Token {
  return { name, variable: `var(${name})` }
}

export const tokens = {
  colorText: token('--color-text'),
  colorTextMuted: token('--color-text-muted'),
  colorSurface: token('--color-surface'),
  colorSurfaceRaised: token('--color-surface-raised'),
  colorBorder: token('--color-border'),
  colorAccent: token('--color-accent'),
  colorAccentStrong: token('--color-accent-strong'),
  colorOnAccent: token('--color-on-accent'),
  colorFocusRing: token('--color-focus-ring'),
  colorSurfaceActive: token('--color-surface-active'),
  colorIndicator: token('--color-indicator'),
  space1: token('--space-1'),
  space2: token('--space-2'),
  space3: token('--space-3'),
  space4: token('--space-4'),
  space5: token('--space-5'),
  radiusSm: token('--radius-sm'),
  radiusMd: token('--radius-md'),
  fontSizeSm: token('--font-size-sm'),
  fontSizeMd: token('--font-size-md'),
  fontSizeLg: token('--font-size-lg'),
  fontFamilyUi: token('--font-family-ui'),
  fontFamilyHeading: token('--font-family-heading'),
  fontFamilyMono: token('--font-family-mono'),
  elevationRaised: token('--elevation-raised'),
  elevationOverlay: token('--elevation-overlay'),
  motionDuration: token('--motion-duration'),
} as const

export const tokenList: readonly Token[] = Object.values(tokens)
