import { describe, it, expect } from 'vitest'
import {
  ARRIS_PREVIEW_VALUE,
  DEFAULT_DESIGN_LANGUAGE,
  DESIGN_LANGUAGE_PREVIEW_PARAM,
  resolveDesignLanguage,
} from './design-language'

// The design language is a second theming axis beside light/dark: Draughtsman's
// Restraint is what ships, Arris is the migration target (ADR-0154). The preview
// flag selects Arris; every other input keeps the shipped default, so a normal page
// load can never land on the half-built language.

describe('design-language preview flag', () => {
  it('names the shipped language as the default', () => {
    expect(DEFAULT_DESIGN_LANGUAGE).toBe('draughtsmans-restraint')
  })

  it('reads the preview from the theme-preview query key', () => {
    expect(DESIGN_LANGUAGE_PREVIEW_PARAM).toBe('theme-preview')
  })

  it('selects Arris on the approved preview value', () => {
    expect(resolveDesignLanguage(ARRIS_PREVIEW_VALUE)).toBe('arris')
    expect(resolveDesignLanguage('arris')).toBe('arris')
  })

  it('keeps the shipped default when the flag is absent', () => {
    expect(resolveDesignLanguage(null)).toBe(DEFAULT_DESIGN_LANGUAGE)
    expect(resolveDesignLanguage(undefined)).toBe(DEFAULT_DESIGN_LANGUAGE)
  })

  it('keeps the shipped default for an empty or unrecognized value', () => {
    expect(resolveDesignLanguage('')).toBe(DEFAULT_DESIGN_LANGUAGE)
    expect(resolveDesignLanguage('sideboard')).toBe(DEFAULT_DESIGN_LANGUAGE)
    expect(resolveDesignLanguage('1')).toBe(DEFAULT_DESIGN_LANGUAGE)
  })

  it('matches the preview value exactly rather than by case or prefix', () => {
    expect(resolveDesignLanguage('Arris')).toBe(DEFAULT_DESIGN_LANGUAGE)
    expect(resolveDesignLanguage('arris-preview')).toBe(DEFAULT_DESIGN_LANGUAGE)
  })

  it('accepts the shipped language by name so the flag can pin it explicitly', () => {
    expect(resolveDesignLanguage('draughtsmans-restraint')).toBe('draughtsmans-restraint')
  })
})
