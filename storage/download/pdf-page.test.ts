import { describe, expect, it } from 'vitest'
import { pdfPageSize } from './pdf-page'

describe('pdfPageSize', () => {
  it('returns US Letter portrait dimensions for imperial units', () => {
    expect(pdfPageSize('imperial')).toEqual({ width: 612, height: 792 })
  })

  it('returns ISO A4 portrait dimensions for metric units', () => {
    expect(pdfPageSize('metric')).toEqual({ width: 595.28, height: 841.89 })
  })
})
