import { describe, expect, it } from 'vitest'
import { searchColorNames } from './color-name-search'
import { colorFromHex, type NamedColor } from '../../core'

const CANDIDATES: NamedColor[] = [
  { name: 'Sage Green', color: colorFromHex('#9aa583') },
  { name: 'Slate Blue', color: colorFromHex('#5b6e7a') },
  { name: 'Warm White', color: colorFromHex('#f4efe6') },
]

describe('searchColorNames', () => {
  it('ranks a matching color first', () => {
    expect(searchColorNames('sage', CANDIDATES)[0]?.name).toBe('Sage Green')
  })

  it('returns every candidate for an empty query', () => {
    expect(searchColorNames('', CANDIDATES)).toHaveLength(CANDIDATES.length)
  })

  it('returns nothing for a query that matches no name', () => {
    expect(searchColorNames('zzz', CANDIDATES)).toHaveLength(0)
  })
})
