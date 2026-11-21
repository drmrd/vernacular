import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup, within } from '@testing-library/react'
import { previewSource } from './card-text'
import { cardOf, linkNamed, renderPage } from './projects-page-test-support'

afterEach(cleanup)

const CHANGED_AT = '2026-03-04T10:15:00.000Z'
const STORED_DRAWING = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'

describe('ProjectsPage card menu choices', () => {
  it('calls onCardAction with the id of the card whose menu was used and the chosen action', async () => {
    const onCardAction = vi.fn()
    const user = renderPage({
      cards: [cardOf(), cardOf({ id: 'queen-anne', name: 'Queen Anne Cottage' })],
      onCardAction,
    })
    await user.click(screen.getByRole('button', { name: 'Actions for Hubbard House' }))
    await user.click(screen.getByRole('menuitem', { name: 'Export' }))
    expect(onCardAction.mock.calls).toEqual([['hubbard', 'export']])
  })
})

describe('ProjectsPage card details', () => {
  it('uses exactly the data address of the stored drawing as the image source', () => {
    renderPage({ cards: [cardOf({ preview: { svg: STORED_DRAWING } })] })
    const image = linkNamed('Hubbard House').querySelector('img')
    expect(image).toHaveAttribute('src', previewSource(STORED_DRAWING))
  })

  it('includes the change time in the description of the link', () => {
    const time = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(CHANGED_AT))
    renderPage({ cards: [cardOf({ lastChangedAt: CHANGED_AT })] })
    expect(linkNamed('Hubbard House')).toHaveAccessibleDescription(
      expect.stringContaining(`Changed ${time}`),
    )
  })

  it('keeps one empty frame before the name for a project with no drawing', () => {
    renderPage({ cards: [cardOf({ preview: 'none' })] })
    const link = linkNamed('Hubbard House')
    const frame = link.firstElementChild
    expect(frame).not.toBeNull()
    expect(frame).toBeEmptyDOMElement()
    expect(frame).not.toContainElement(within(link).getByText('Hubbard House'))
  })

  it('puts the image of a stored drawing in the same frame position', () => {
    renderPage({ cards: [cardOf({ preview: { svg: STORED_DRAWING } })] })
    const link = linkNamed('Hubbard House')
    expect(link.firstElementChild?.querySelector('img')).not.toBeNull()
  })
})
