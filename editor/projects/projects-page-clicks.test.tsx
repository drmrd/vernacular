import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent } from '@testing-library/react'
import { cardOf, linkNamed, renderPage } from './projects-page-test-support'

afterEach(cleanup)

const MIDDLE_BUTTON = 1

describe('ProjectsPage clicks on a card', () => {
  it('calls onOpen once with the id and stops the browser move on a plain click', () => {
    const onOpen = vi.fn()
    renderPage({ cards: [cardOf()], onOpen })
    const notPrevented = fireEvent.click(linkNamed('Hubbard House'))
    expect(onOpen.mock.calls).toEqual([['hubbard']])
    expect(notPrevented).toBe(false)
  })

  it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }])(
    'leaves a click with %o to the browser',
    (modifier) => {
      const onOpen = vi.fn()
      renderPage({ cards: [cardOf()], onOpen })
      const notPrevented = fireEvent.click(linkNamed('Hubbard House'), modifier)
      expect(onOpen).not.toHaveBeenCalled()
      expect(notPrevented).toBe(true)
    },
  )

  it('leaves a click of a button other than the primary one to the browser', () => {
    const onOpen = vi.fn()
    renderPage({ cards: [cardOf()], onOpen })
    const notPrevented = fireEvent.click(linkNamed('Hubbard House'), { button: MIDDLE_BUTTON })
    expect(onOpen).not.toHaveBeenCalled()
    expect(notPrevented).toBe(true)
  })

  it('treats Enter on the focused link as a plain click', async () => {
    const onOpen = vi.fn()
    const user = renderPage({ cards: [cardOf()], onOpen })
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onOpen.mock.calls).toEqual([['hubbard']])
  })

  it('stops nothing when no onOpen is given', () => {
    renderPage({ cards: [cardOf()] })
    expect(fireEvent.click(linkNamed('Hubbard House'))).toBe(true)
  })
})
