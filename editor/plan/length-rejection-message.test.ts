import { describe, it, expect } from 'vitest'
import { InvalidLengthError } from '../../core'
import { lengthRejectionMessage } from './length-rejection-message'

describe('lengthRejectionMessage', () => {
  it('returns the domain message when the rejection carries an InvalidLengthError cause', () => {
    const cause = new InvalidLengthError('Width', -5)
    const rejection = new Error('Command "resize-opening" failed and was rolled back', { cause })

    expect(lengthRejectionMessage(rejection)).toBe(cause.message)
  })

  it('returns a hint about the accepted formats for a bare Error with no domain cause', () => {
    const rejection = new Error('Unrecognized length value: "twelve"')

    expect(lengthRejectionMessage(rejection)).toBe(
      'Enter a number, or a length such as 2.4 m or 8 ft 6 in.',
    )
  })

  it('returns a hint about the accepted formats for a thrown value that is not an Error', () => {
    expect(lengthRejectionMessage('nope')).toBe(
      'Enter a number, or a length such as 2.4 m or 8 ft 6 in.',
    )
  })

  it('blames the application, not the entry, when the dispatcher-wrapped cause is not an InvalidLengthError', () => {
    const cause = new TypeError('Cannot read properties of undefined')
    const rejection = new Error('Command "resize-opening" failed and was rolled back', { cause })

    const message = lengthRejectionMessage(rejection)

    expect(message).not.toBe('Enter a number, or a length such as 2.4 m or 8 ft 6 in.')
    expect(message).toBe('That change could not be applied. Your entry was not saved.')
  })
})
