import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'
import { ARRIS_DARK_SCOPE, ARRIS_SCOPE, blockBodies, stripComments } from './css-token-test-support'
import { tokenList } from './tokens'

// The Arris token layer is the alternate design language (ADR-0154) delivered as
// values for the same custom-property names components already consume, so flipping
// the preview flag retargets the whole system without a component rewrite. Two
// contracts matter here: the layer is complete (every semantic token the shipped
// layer declares has an Arris value in both appearances) and the layer is scoped
// (nothing it declares reaches a page that has not asked for it).

const designSystem = resolve(process.cwd(), 'editor/design-system')
const shippedCss = readFileSync(resolve(designSystem, 'tokens.css'), 'utf8')
const arrisCss = readFileSync(resolve(designSystem, 'tokens-arris.css'), 'utf8')

// Semantic tokens are the vocabulary components reach for; the raw ramps beneath
// them (--vellum-*, --umber-*, --rag-vellum, and friends) live in one file each and
// are deliberately not part of the cross-language contract.
const SEMANTIC_PREFIXES = [
  '--color-',
  '--space-',
  '--size-',
  '--radius-',
  '--font-',
  '--line-height-',
  '--letter-spacing-',
  '--elevation-',
  '--motion-',
  '--border-width-',
  '--stroke-',
  '--texture-',
]

function declaredNames(body: string): string[] {
  return [...body.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1] ?? '')
}

function isSemantic(name: string): boolean {
  return SEMANTIC_PREFIXES.some((prefix) => name.startsWith(prefix))
}

const shippedRoot = declaredNames(blockBodies(shippedCss, ':root')[0] ?? '')
const shippedSemantic = shippedRoot.filter(isSemantic)
const arrisLight = declaredNames(blockBodies(arrisCss, ARRIS_SCOPE)[0] ?? '')
const arrisDark = declaredNames(blockBodies(arrisCss, ARRIS_DARK_SCOPE)[0] ?? '')

describe('Arris token layer scoping', () => {
  it('declares nothing at :root, so a page without the flag is untouched', () => {
    expect(blockBodies(arrisCss, ':root')).toEqual([])
  })

  it('opens every rule inside the Arris design-language scope', () => {
    const selectors = [...stripComments(arrisCss).matchAll(/(^|\})\s*([^{}@]+?)\s*\{/g)].map(
      (match) => (match[2] ?? '').trim(),
    )
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector).toContain(ARRIS_SCOPE)
    }
  })

  it('reaches the dark appearance through both attributes on one element', () => {
    expect(stripComments(arrisCss)).toContain(ARRIS_DARK_SCOPE)
  })
})

describe('Arris token layer completeness', () => {
  it('gives every registered token an Arris value', () => {
    const missing = tokenList
      .map((token) => token.name)
      .filter((name) => !arrisLight.includes(name))
    expect(missing, `Registered tokens with no Arris value: ${missing.join(', ')}`).toEqual([])
  })

  it('gives every semantic token the shipped layer declares an Arris value', () => {
    const missing = shippedSemantic.filter((name) => !arrisLight.includes(name))
    expect(
      missing,
      `Shipped semantic tokens absent from the Arris layer: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('keeps every registered token declared in the shipped layer too', () => {
    const missing = tokenList
      .map((token) => token.name)
      .filter((name) => !shippedRoot.includes(name))
    expect(missing, `Registered tokens absent from tokens.css: ${missing.join(', ')}`).toEqual([])
  })

  it('re-resolves every Arris color for the dark appearance', () => {
    const colors = arrisLight.filter((name) => name.startsWith('--color-'))
    const missing = colors.filter((name) => !arrisDark.includes(name))
    expect(missing, `Arris colors with no dark-appearance value: ${missing.join(', ')}`).toEqual([])
  })

  it('holds the WCAG target-size floor rather than shrinking it to the control height', () => {
    const light = blockBodies(arrisCss, ARRIS_SCOPE)[0] ?? ''
    expect(light).toMatch(/--size-target-min:\s*2\.5rem/)
    expect(light).toMatch(/--size-target-min-touch:\s*2\.75rem/)
  })
})

describe('Arris palette', () => {
  const light = blockBodies(arrisCss, ARRIS_SCOPE)[0] ?? ''
  const dark = blockBodies(arrisCss, ARRIS_DARK_SCOPE)[0] ?? ''

  it('names the six palette colors as raw values in this file alone', () => {
    for (const hex of ['#f7f6f2', '#dfd9ce', '#23272b', '#16202c', '#2e55c4', '#a6402f']) {
      expect(arrisCss.toLowerCase()).toContain(hex)
    }
  })

  it('puts the sheet above the bench in the light appearance', () => {
    // Rag Vellum canvas over Beech chrome: the plan sheet is the brightest surface.
    expect(light).toMatch(/--color-surface:\s*var\(--rag-vellum\)/)
    expect(light).toMatch(/--color-surface-panel:\s*var\(--beech\)/)
    expect(light).toMatch(/--color-text:\s*var\(--japanned-iron\)/)
  })

  it('lays the sheet on Blued Steel over an iron bench in the dark appearance', () => {
    expect(dark).toMatch(/--color-surface:\s*var\(--blued-steel\)/)
    expect(dark).toMatch(/--color-surface-panel:\s*var\(--japanned-iron\)/)
    expect(dark).toMatch(/--color-text:\s*var\(--bone\)/)
  })

  it('lifts the accent and the destructive color for the dark appearance', () => {
    expect(light).toMatch(/--color-accent:\s*var\(--layout-blue\)/)
    expect(dark).toMatch(/--color-accent:\s*var\(--layout-blue-lifted\)/)
    expect(arrisCss.toLowerCase()).toContain('#7e98e6')
    expect(arrisCss.toLowerCase()).toContain('#ce7b63')
  })

  it('publishes the eight ink-ramp roles by name', () => {
    for (const role of [
      '--color-ink-body',
      '--color-ink-emphasis',
      '--color-ink-label',
      '--color-ink-secondary',
      '--color-ink-instrument',
      '--color-ink-engraved',
      '--color-ink-dormant',
      '--color-ink-ghost',
    ]) {
      expect(arrisLight).toContain(role)
      expect(arrisDark).toContain(role)
      expect(shippedRoot).toContain(role)
    }
  })
})

describe('Arris shape, type, and motion', () => {
  const light = blockBodies(arrisCss, ARRIS_SCOPE)[0] ?? ''

  it('machines every interactive corner to 2px and squares the docked panels', () => {
    expect(light).toMatch(/--radius-sm:\s*0\.125rem/)
    expect(light).toMatch(/--radius-md:\s*0\.125rem/)
    expect(light).toMatch(/--radius-square:\s*0/)
  })

  it('retires the pill, which the language refuses outright', () => {
    expect(light).toMatch(/--radius-pill:\s*var\(--radius-sm\)/)
    expect(light).not.toMatch(/--radius-pill:\s*9999px/)
  })

  it('lays out the published type scale from 11px to 28px', () => {
    expect(light).toMatch(/--font-size-xs:\s*0\.6875rem/)
    expect(light).toMatch(/--font-size-sm:\s*0\.75rem/)
    expect(light).toMatch(/--font-size-md:\s*0\.8125rem/)
    expect(light).toMatch(/--font-size-lg:\s*0\.9375rem/)
    expect(light).toMatch(/--font-size-xl:\s*1\.25rem/)
    expect(light).toMatch(/--font-size-2xl:\s*1\.375rem/)
    expect(light).toMatch(/--font-size-3xl:\s*1\.75rem/)
  })

  it('holds the line-height and weight floors the language sets', () => {
    expect(light).toMatch(/--line-height-panel:\s*1\.35/)
    expect(light).toMatch(/--line-height-prose:\s*1\.5/)
    expect(light).toMatch(/--font-weight-regular:\s*400/)
    expect(light).not.toMatch(/--font-weight-[\w-]+:\s*[123]00/)
  })

  it('sets the control heights the density stance calls for', () => {
    expect(light).toMatch(/--size-control-height:\s*1\.75rem/)
    expect(light).toMatch(/--size-row-compact:\s*1\.5rem/)
    expect(light).toMatch(/--size-panel-docked-width:\s*17\.5rem/)
  })

  it('carries one border weight for resting controls and a heavier one for active', () => {
    expect(light).toMatch(/--border-width-resting:\s*1px/)
    expect(light).toMatch(/--border-width-active:\s*1\.5px/)
  })

  it('strokes icons at the weight the language owns, not the plan canvas weight', () => {
    // ADR-0159 decoupled icon stroke from plan ink; the design language in force owns it.
    expect(light).toMatch(/--stroke-icon:\s*1\.5px/)
    const shipped = blockBodies(shippedCss, ':root')[0] ?? ''
    expect(shipped).toMatch(/--stroke-icon:\s*2px/)
  })

  it('flattens the bench and gives raised objects the one shadow tier', () => {
    expect(light).toMatch(/--elevation-flat:\s*none/)
    expect(light).toMatch(/--elevation-raised:\s*0 2px 8px/)
    expect(light).toMatch(/--elevation-overlay:\s*var\(--elevation-raised\)/)
  })

  it('seats motion at 90ms on the single easing curve', () => {
    expect(light).toMatch(/--motion-duration:\s*90ms/)
    expect(light).toMatch(/--motion-duration-max:\s*140ms/)
    expect(light).toMatch(/--motion-duration-detent:\s*50ms/)
    expect(light).toMatch(/--motion-easing:\s*cubic-bezier\(0\.2, 0, 0, 1\)/)
  })
})
