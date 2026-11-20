import { describe, expect, it } from 'vitest'
import { importMissingAssetsText } from './asset-report-text'

describe('importMissingAssetsText', () => {
  it('says that the one asset the file lacked shows as missing', () => {
    expect(importMissingAssetsText(1)).toBe(
      'The file did not include 1 of the assets this project uses. It shows as missing.',
    )
  })

  it('says that the 2 assets the file lacked show as missing', () => {
    expect(importMissingAssetsText(2)).toBe(
      'The file did not include 2 of the assets this project uses. They show as missing.',
    )
  })

  it('says that the 5 assets the file lacked show as missing', () => {
    expect(importMissingAssetsText(5)).toBe(
      'The file did not include 5 of the assets this project uses. They show as missing.',
    )
  })

  it('writes a count of 1,200 with its thousands separator', () => {
    expect(importMissingAssetsText(1200)).toBe(
      'The file did not include 1,200 of the assets this project uses. They show as missing.',
    )
  })
})
