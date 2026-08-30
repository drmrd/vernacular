import { describe, expect, it } from 'vitest'
import * as buttonStories from './button.stories'
import * as iconButtonStories from './icon-button.stories'
import * as fieldStories from './field.stories'
import * as segmentedStories from './segmented.stories'

interface ArrisStoryVariant {
  globals?: Record<string, unknown>
  tags?: string[]
}

/**
 * Looks up a named export from a story module by string key, so the migrated-family
 * export names (ArrisLight, ArrisDark) never appear as declared property names and
 * trip the repo's camelCase naming-convention lint rule.
 */
function arrisVariant(storyModule: object, exportName: string): ArrisStoryVariant | undefined {
  return (storyModule as Record<string, unknown>)[exportName] as ArrisStoryVariant | undefined
}

const migratedFamilies: [name: string, storyModule: object][] = [
  ['Button', buttonStories],
  ['IconButton', iconButtonStories],
  ['Field', fieldStories],
  ['Segmented', segmentedStories],
]

describe('migrated design-system families', () => {
  it.each(migratedFamilies)(
    '%s publishes ArrisLight and ArrisDark story variants pinned to the visual tier',
    (_name, storyModule) => {
      const light = arrisVariant(storyModule, 'ArrisLight')
      const dark = arrisVariant(storyModule, 'ArrisDark')

      expect(light?.globals).toMatchObject({ designLanguage: 'arris', appearance: 'light' })
      expect(light?.tags ?? []).not.toContain('!test')

      expect(dark?.globals).toMatchObject({ designLanguage: 'arris', appearance: 'dark' })
      expect(dark?.tags ?? []).not.toContain('!test')
    },
  )
})
