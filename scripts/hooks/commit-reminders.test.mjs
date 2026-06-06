import { describe, expect, it } from 'vitest'
import { reminderMessages } from './commit-reminders.mjs'

describe('reminderMessages', () => {
  it('returns no reminders when only unrelated files are staged', () => {
    expect(reminderMessages(['package.json', 'README.md'])).toEqual([])
  })

  it('reminds about clean-code review and the knowledge graph for a source-layer change', () => {
    const joined = reminderMessages(['core/model/types.ts']).join('\n')

    expect(joined.toLowerCase()).toContain('clean-code')
    expect(joined.toLowerCase()).toContain('knowledge')
  })

  it('reminds about both clean-code and the knowledge graph for any source layer', () => {
    const joined = reminderMessages(['engine/scene/build-scene.ts']).join('\n')

    expect(joined.toLowerCase()).toContain('clean-code')
    expect(joined.toLowerCase()).toContain('knowledge')
  })

  it('reminds about the knowledge graph but not clean-code for a design-spec-only change', () => {
    const joined = reminderMessages(['docs/specs/2026-06-01-vernacular-design.md']).join('\n')

    expect(joined.toLowerCase()).toContain('knowledge')
    expect(joined.toLowerCase()).not.toContain('clean-code')
  })
})
