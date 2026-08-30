import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDiscardConfirmation } from './use-discard-confirmation'

describe('useDiscardConfirmation', () => {
  it('answers a second confirmation on the spot and leaves the first one live', async () => {
    // Two guards can ask at once (the recovery banner's Discard and a file-menu
    // New both route through this seam). Adopting the newcomer would strand the
    // first caller's promise forever, so whatever it guards, a project swap or a
    // snapshot prune, would sit half-done with nothing left to answer it.
    const { result } = renderHook(() => useDiscardConfirmation())

    let firstAnswer: boolean | undefined
    let secondAnswer: boolean | undefined

    await act(async () => {
      void result.current.confirmDiscard().then((ok) => {
        firstAnswer = ok
      })
    })
    await act(async () => {
      void result.current.confirmDiscard().then((ok) => {
        secondAnswer = ok
      })
    })

    expect(secondAnswer).toBe(false)
    expect(firstAnswer).toBeUndefined()
    expect(result.current.discardRequest).not.toBeNull()

    await act(async () => {
      result.current.resolveDiscard(true)
    })

    expect(firstAnswer).toBe(true)
    expect(result.current.discardRequest).toBeNull()
  })

  it('opens a fresh request once the previous one has been answered', async () => {
    const { result } = renderHook(() => useDiscardConfirmation())

    let firstAnswer: boolean | undefined
    await act(async () => {
      void result.current.confirmDiscard().then((ok) => {
        firstAnswer = ok
      })
    })
    await act(async () => {
      result.current.resolveDiscard(false)
    })
    expect(firstAnswer).toBe(false)

    let secondAnswer: boolean | undefined
    await act(async () => {
      void result.current.confirmDiscard().then((ok) => {
        secondAnswer = ok
      })
    })
    expect(result.current.discardRequest).not.toBeNull()

    await act(async () => {
      result.current.resolveDiscard(true)
    })
    expect(secondAnswer).toBe(true)
  })
})
