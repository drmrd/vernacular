import { describe, expect, it } from 'vitest'
import { bundleFilename } from './bundle-filename'

describe('bundleFilename', () => {
  it('lowercases the name and joins words with a single hyphen', () => {
    expect(bundleFilename('My House')).toBe('my-house.building')
  })

  it('collapses punctuation and double spaces to single hyphens with no leading or trailing hyphen', () => {
    expect(bundleFilename('  Cozy   Cabin!! ')).toBe('cozy-cabin.building')
  })

  it('falls back to a fixed stem when the name is empty or whitespace only', () => {
    expect(bundleFilename('   ')).toBe('project.building')
  })

  it('falls back to a fixed stem when the name has only unsafe characters', () => {
    expect(bundleFilename('///')).toBe('project.building')
  })
})
