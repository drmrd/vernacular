import { describe, expect, it } from 'vitest'
import { humanMessage } from './human-message'

describe('humanMessage', () => {
  it('uses an Error message', () => {
    expect(humanMessage(new Error('disk full'))).toBe('disk full')
  })

  it('passes a thrown string through', () => {
    expect(humanMessage('boom')).toBe('boom')
  })

  it('stringifies a thrown non-error value', () => {
    expect(humanMessage({ code: 42 })).toBe('[object Object]')
  })
})
