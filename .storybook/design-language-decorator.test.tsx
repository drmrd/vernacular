import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  designLanguageGlobalTypes,
  designLanguageInitialGlobals,
  withDesignLanguage,
} from './design-language-decorator'

afterEach(() => {
  cleanup()
})

function DummyStory() {
  return <p>story content</p>
}

interface ToolbarLikeGlobal {
  toolbar?: { items?: (string | { value?: string })[] }
}

/** A globalTypes toolbar item may be a bare string or an object naming its `value`. */
function toolbarValues(global: ToolbarLikeGlobal): (string | undefined)[] {
  return (global.toolbar?.items ?? []).map((item) => (typeof item === 'string' ? item : item.value))
}

describe('withDesignLanguage', () => {
  it('renders the story with no data-design-language element when globals carry no design-language preview', () => {
    const { container } = render(withDesignLanguage(DummyStory, { globals: {} }))

    expect(screen.getByText('story content')).toBeInTheDocument()
    expect(container.querySelector('[data-design-language]')).toBeNull()
  })

  it('wraps the story in a data-design-language="arris" element carrying a data-theme attribute when arris is previewed', () => {
    const { container } = render(
      withDesignLanguage(DummyStory, { globals: { designLanguage: 'arris' } }),
    )

    const wrapper = container.querySelector('[data-design-language="arris"]')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.hasAttribute('data-theme')).toBe(true)
  })

  it('stamps data-theme="dark" on the wrapper when the appearance global is dark', () => {
    const { container } = render(
      withDesignLanguage(DummyStory, {
        globals: { designLanguage: 'arris', appearance: 'dark' },
      }),
    )

    const wrapper = container.querySelector('[data-design-language="arris"]')
    expect(wrapper?.getAttribute('data-theme')).toBe('dark')
  })

  it.each(['ARRIS', 'arris-preview'])(
    'treats the unrecognized design-language value %s as the no-op default, mirroring resolveDesignLanguage',
    (unrecognizedValue) => {
      const { container } = render(
        withDesignLanguage(DummyStory, { globals: { designLanguage: unrecognizedValue } }),
      )

      expect(container.querySelector('[data-design-language]')).toBeNull()
    },
  )
})

describe('designLanguageGlobalTypes', () => {
  it('declares a designLanguage toolbar global offering draughtsmans-restraint and arris', () => {
    expect(toolbarValues(designLanguageGlobalTypes.designLanguage)).toEqual([
      'draughtsmans-restraint',
      'arris',
    ])
  })

  it('declares an appearance toolbar global offering system, light, and dark', () => {
    expect(toolbarValues(designLanguageGlobalTypes.appearance)).toEqual(['system', 'light', 'dark'])
  })
})

describe('designLanguageInitialGlobals', () => {
  it('defaults to the shipped design language and the system appearance', () => {
    expect(designLanguageInitialGlobals).toEqual({
      designLanguage: 'draughtsmans-restraint',
      appearance: 'system',
    })
  })
})
