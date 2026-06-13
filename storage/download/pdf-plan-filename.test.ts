import { describe, expect, it } from 'vitest'
import { pdfPlanFilename } from './pdf-plan-filename'

describe('pdfPlanFilename', () => {
  it('lowercases the name and joins words with a single hyphen', () => {
    expect(pdfPlanFilename('Untitled project')).toBe('untitled-project.pdf')
  })

  it('collapses punctuation and trailing spaces with no leading or trailing hyphen', () => {
    expect(pdfPlanFilename('My House!!  ')).toBe('my-house.pdf')
  })

  it('falls back to a fixed stem when the name is whitespace only', () => {
    expect(pdfPlanFilename('   ')).toBe('project.pdf')
  })

  it('falls back to a fixed stem when the name is empty', () => {
    expect(pdfPlanFilename('')).toBe('project.pdf')
  })
})
