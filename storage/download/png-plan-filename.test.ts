import { describe, expect, it } from 'vitest'
import { pngPlanFilename } from './png-plan-filename'

describe('pngPlanFilename', () => {
  it('lowercases the name and joins words with a single hyphen', () => {
    expect(pngPlanFilename('Untitled project')).toBe('untitled-project.png')
  })

  it('collapses punctuation and trailing spaces with no leading or trailing hyphen', () => {
    expect(pngPlanFilename('My House!!  ')).toBe('my-house.png')
  })

  it('falls back to a fixed stem when the name is whitespace only', () => {
    expect(pngPlanFilename('   ')).toBe('project.png')
  })

  it('falls back to a fixed stem when the name is empty', () => {
    expect(pngPlanFilename('')).toBe('project.png')
  })
})
