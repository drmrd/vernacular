import { describe, expect, it } from 'vitest'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { UNNAMED_PROJECT, displayNameOf } from '..'

describe('the name shown for a project record', () => {
  it('a record with a name shows it', () => {
    expect(displayNameOf(sampleRecord({ name: 'The parlour house' }))).toBe('The parlour house')
  })

  it('a record with no name shows Unnamed project', () => {
    expect(UNNAMED_PROJECT).toBe('Unnamed project')
    expect(displayNameOf(sampleRecord({ name: undefined }))).toBe('Unnamed project')
  })
})
