import { describe, expect, it } from 'vitest'
import { svgPlanFilename } from './svg-plan-filename'

describe('svgPlanFilename', () => {
  it('lowercases the name and joins words with a single hyphen', () => {
    expect(svgPlanFilename('Untitled project')).toBe('untitled-project.svg')
  })

  it('collapses punctuation and trailing spaces with no leading or trailing hyphen', () => {
    expect(svgPlanFilename('My House!!  ')).toBe('my-house.svg')
  })

  it('falls back to a fixed stem when the name is whitespace only', () => {
    expect(svgPlanFilename('   ')).toBe('project.svg')
  })

  it('falls back to a fixed stem when the name is empty', () => {
    expect(svgPlanFilename('')).toBe('project.svg')
  })
})
