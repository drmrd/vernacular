import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDiscardPrompt } from './use-discard-prompt'
import type { WorkspaceState } from './use-workspace-state'

function workspace(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    discardRequest: null,
    recovery: null,
    resolveDiscard: vi.fn(),
    ...overrides,
  } as WorkspaceState
}

describe('useDiscardPrompt', () => {
  it('labels the prompt the recovery banner opens', () => {
    const onDiscard = vi.fn()
    const { result } = renderHook(() =>
      useDiscardPrompt(workspace({ recovery: { onRestore: vi.fn(), onDiscard } }), 'Hubbard House'),
    )

    expect(result.current.message).toBeUndefined()

    act(() => {
      result.current.recovery?.onDiscard()
    })

    expect(onDiscard).toHaveBeenCalledOnce()
    expect(result.current.message).toBe('Delete the recovered copy of Hubbard House?')
    expect(result.current.confirmLabel).toBe('Delete recovered copy')
  })

  it('never relabels a prompt that is already open', () => {
    // The confirm seam turns away a second request rather than opening a second
    // prompt, so a Discard click while one is up changes nothing on screen. Staging
    // the wording anyway would rewrite the question the live prompt is asking, and
    // the live prompt may be the one guarding the open document: the user would be
    // told they are deleting a recovered copy while the button throws away their
    // unsaved work instead.
    const onDiscard = vi.fn()
    const { result } = renderHook(() =>
      useDiscardPrompt(
        workspace({
          discardRequest: { resolve: vi.fn() },
          recovery: { onRestore: vi.fn(), onDiscard },
        }),
        'Hubbard House',
      ),
    )

    act(() => {
      result.current.recovery?.onDiscard()
    })

    expect(result.current.message).toBeUndefined()
  })

  it('drops the staged wording once the prompt is answered', () => {
    const resolveDiscard = vi.fn()
    const { result } = renderHook(() =>
      useDiscardPrompt(
        workspace({ recovery: { onRestore: vi.fn(), onDiscard: vi.fn() }, resolveDiscard }),
        'Hubbard House',
      ),
    )

    act(() => {
      result.current.recovery?.onDiscard()
    })
    expect(result.current.message).toBe('Delete the recovered copy of Hubbard House?')

    act(() => {
      result.current.answer(false)
    })

    expect(resolveDiscard).toHaveBeenCalledWith(false)
    expect(result.current.message).toBeUndefined()
    expect(result.current.confirmLabel).toBeUndefined()
  })
})
