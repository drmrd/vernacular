import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'editor/design-system/design-system.stories.tsx'),
  'utf8',
)

describe('design-system stories', () => {
  it('exports DraughtsmansRestraint in place of the DraftingTable placeholder', () => {
    expect(source).toContain('export const DraughtsmansRestraint')
    expect(source).not.toContain('export const DraftingTable')
  })
})
