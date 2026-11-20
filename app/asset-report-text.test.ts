import { describe, expect, it } from 'vitest'
import { exportMissingAssetsText, importMissingAssetsText } from './asset-report-text'

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

describe('exportMissingAssetsText', () => {
  it('says that the export leaves out the one asset this browser lacks', () => {
    expect(exportMissingAssetsText(1)).toBe(
      'The export does not include 1 asset, because this browser does not have it.',
    )
  })

  it('says that the export leaves out the 2 assets this browser lacks', () => {
    expect(exportMissingAssetsText(2)).toBe(
      'The export does not include 2 assets, because this browser does not have them.',
    )
  })

  it('says that the export leaves out the 5 assets this browser lacks', () => {
    expect(exportMissingAssetsText(5)).toBe(
      'The export does not include 5 assets, because this browser does not have them.',
    )
  })

  it('writes a count of 1,200 with its thousands separator', () => {
    expect(exportMissingAssetsText(1200)).toBe(
      'The export does not include 1,200 assets, because this browser does not have them.',
    )
  })
})
