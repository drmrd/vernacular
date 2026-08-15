import { describe, it, expect, afterEach } from 'vitest'
import { requestedDesignLanguage } from './app'

// The preview flag is a URL seam read at exactly one site, like the `fixture`
// harness seam beside it. A normal page load carries no query string, so the
// shipped language is what real users get; this pins that default rather than
// trusting it.

function visit(search: string): void {
  globalThis.history.replaceState({}, '', search === '' ? '/' : `/?${search}`)
}

afterEach(() => {
  visit('')
})

describe('design-language preview seam', () => {
  it('resolves the shipped language on a plain page load', () => {
    visit('')
    expect(requestedDesignLanguage()).toBe('draughtsmans-restraint')
  })

  it('resolves Arris when the preview flag asks for it', () => {
    visit('theme-preview=arris')
    expect(requestedDesignLanguage()).toBe('arris')
  })

  it('ignores an unrecognized preview value', () => {
    visit('theme-preview=sideboard')
    expect(requestedDesignLanguage()).toBe('draughtsmans-restraint')
  })

  it('leaves the language alone for unrelated query parameters', () => {
    visit('fixture=scene-harness&temp=2700')
    expect(requestedDesignLanguage()).toBe('draughtsmans-restraint')
  })

  it('reads the flag alongside other parameters', () => {
    visit('e2e=1&theme-preview=arris')
    expect(requestedDesignLanguage()).toBe('arris')
  })
})
