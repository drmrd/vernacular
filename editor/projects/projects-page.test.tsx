import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup, fireEvent, within } from '@testing-library/react'
import type { ProjectCardModel } from '../../session'
import { cardOf, linkNamed, renderPage } from './projects-page-test-support'

afterEach(cleanup)

const CHANGED_AT = '2026-03-04T10:15:00.000Z'
const TWO_FLOORS = 2
const TWO_CARDS = 2
const STORED_MARKER = 'stored-drawing-marker'
const STORED_DRAWING = `<svg xmlns="http://www.w3.org/2000/svg"><rect id="${STORED_MARKER}" width="4" height="4"/></svg>`

describe('ProjectsPage landmarks and cards', () => {
  it('is a main landmark named Projects with a first-level heading Projects', () => {
    renderPage()
    expect(screen.getByRole('main', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
  })

  it('shows each card as a list item that holds one link to the address of its project', () => {
    renderPage({ cards: [cardOf(), cardOf({ id: 'queen-anne', name: 'Queen Anne Cottage' })] })
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(TWO_CARDS)
    for (const item of items) expect(within(item).getAllByRole('link')).toHaveLength(1)
    expect(linkNamed('Hubbard House')).toHaveAttribute('href', '#/project/hubbard')
    expect(linkNamed('Queen Anne Cottage')).toHaveAttribute('href', '#/project/queen-anne')
  })

  it('reaches the links with Tab in the order of the cards', async () => {
    const user = renderPage({ cards: [cardOf(), cardOf({ id: 'queen-anne', name: 'Queen Anne' })] })
    await user.tab()
    expect(linkNamed('Hubbard House')).toHaveFocus()
    await user.tab()
    expect(linkNamed('Queen Anne')).toHaveFocus()
  })

  it('shows the name, the change time, the floors, and the location inside the link', () => {
    const time = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(CHANGED_AT))
    renderPage({ cards: [cardOf({ lastChangedAt: CHANGED_AT, floorCount: TWO_FLOORS })] })
    const link = linkNamed('Hubbard House')
    expect(within(link).getByText(`Changed ${time}`)).toBeInTheDocument()
    expect(within(link).getByText('2 floors')).toBeInTheDocument()
    expect(within(link).getByText('In this browser.')).toBeInTheDocument()
  })

  it('says where a project is for a tab-only project and for a folder project', () => {
    renderPage({
      cards: [
        cardOf({ location: 'tab' }),
        cardOf({ id: 'old', name: 'Old', location: { folderName: 'Old house' } }),
      ],
    })
    expect(within(linkNamed('Hubbard House')).getByText('In this tab only.')).toBeInTheDocument()
    expect(within(linkNamed('Old')).getByText('Folder: Old house')).toBeInTheDocument()
  })

  it('shows neither a change time nor a floor count when the card has none', () => {
    renderPage({ cards: [cardOf()] })
    const link = linkNamed('Hubbard House')
    expect(within(link).queryByText(/^Changed/)).toBeNull()
    expect(within(link).queryByText(/floor/)).toBeNull()
  })
})

describe('ProjectsPage previews', () => {
  it('shows a stored drawing as an image with an empty alt and a data address', () => {
    renderPage({ cards: [cardOf({ preview: { svg: STORED_DRAWING } })] })
    const image = linkNamed('Hubbard House').querySelector('img')
    expect(image).not.toBeNull()
    expect(image).toHaveAttribute('alt', '')
    expect(image?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it('never puts an element of the stored drawing into the page', () => {
    renderPage({ cards: [cardOf({ preview: { svg: STORED_DRAWING } })] })
    expect(document.getElementById(STORED_MARKER)).toBeNull()
  })

  it('says a project did not open, in place of an image', () => {
    renderPage({ cards: [cardOf({ preview: 'did-not-open' })] })
    const link = linkNamed('Hubbard House')
    expect(within(link).getByText('This project did not open.')).toBeInTheDocument()
    expect(link.querySelector('img')).toBeNull()
  })

  it('shows an empty frame, with no image and no sentence, for a project with no drawing', () => {
    renderPage({ cards: [cardOf({ preview: 'none' })] })
    const link = linkNamed('Hubbard House')
    expect(link.querySelector('img')).toBeNull()
    expect(within(link).queryByText('This project did not open.')).toBeNull()
  })
})

describe('ProjectsPage state lines', () => {
  const lines = [
    'Already open in this tab.',
    'Already open in another tab.',
    'This folder needs permission again.',
  ]
  const stateLines: ProjectCardModel['stateLines'] = [
    'open-here',
    'open-elsewhere',
    'needs-permission',
  ]

  it('shows each state line as plain text that cannot take focus', () => {
    renderPage({ cards: [cardOf({ stateLines })] })
    const link = linkNamed('Hubbard House')
    for (const line of lines) {
      const text = within(link).getByText(line)
      expect(text).not.toHaveAttribute('tabindex')
      expect(text.closest('button')).toBeNull()
      expect(screen.queryByRole('button', { name: line })).toBeNull()
    }
  })

  it('describes the link with its facts, its state lines, and the did-not-open sentence', () => {
    renderPage({
      cards: [
        cardOf({ floorCount: TWO_FLOORS, stateLines }),
        cardOf({ id: 'failed', name: 'Failed', preview: 'did-not-open' }),
      ],
    })
    const described = linkNamed('Hubbard House')
    for (const line of [...lines, '2 floors', 'In this browser.']) {
      expect(described).toHaveAccessibleDescription(expect.stringContaining(line))
    }
    expect(linkNamed('Failed')).toHaveAccessibleDescription(
      expect.stringContaining('This project did not open.'),
    )
  })
})

describe('ProjectsPage empty and loading states', () => {
  it('says there are no saved projects and still offers the page actions', () => {
    renderPage({ cards: [], onNewProject: vi.fn() })
    expect(screen.getByText('There are no saved projects yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument()
  })

  it('shows neither a card nor the empty sentence before the first read ends', () => {
    renderPage({ cards: undefined, onNewProject: vi.fn() })
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('There are no saved projects yet.')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument()
  })
})

describe('ProjectsPage actions', () => {
  const handlers = () => ({ onNewProject: vi.fn(), onImportFile: vi.fn(), onOpenFolder: vi.fn() })
  const buttonNames = () => screen.getAllByRole('button').map((button) => button.textContent)

  it('shows New project, Import file, and Open folder in that order', () => {
    renderPage(handlers())
    expect(buttonNames()).toEqual(['New project', 'Import file', 'Open folder'])
  })

  it('leaves out each action that has no handler', () => {
    const { onNewProject, onImportFile } = handlers()
    renderPage({ onNewProject, onImportFile })
    expect(buttonNames()).toEqual(['New project', 'Import file'])
  })

  it('calls the handler of the action that is clicked, once', async () => {
    const all = handlers()
    const user = renderPage(all)
    await user.click(screen.getByRole('button', { name: 'Import file' }))
    expect(all.onImportFile).toHaveBeenCalledOnce()
    expect(all.onNewProject).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.click(screen.getByRole('button', { name: 'Open folder' }))
    expect(all.onNewProject).toHaveBeenCalledOnce()
    expect(all.onOpenFolder).toHaveBeenCalledOnce()
  })
})

describe('ProjectsPage return to the open project', () => {
  it('shows Back to the project before the cards and the actions, and calls onBack once', async () => {
    const onBack = vi.fn()
    const user = renderPage({
      cards: [cardOf()],
      openProject: { name: 'Old house', onBack },
      onNewProject: vi.fn(),
    })
    const back = screen.getByRole('button', { name: 'Back to Old house' })
    const before = Node.DOCUMENT_POSITION_FOLLOWING
    expect(back.compareDocumentPosition(linkNamed('Hubbard House')) & before).toBeTruthy()
    expect(back.compareDocumentPosition(screen.getByRole('button', { name: 'New project' }))).toBe(
      before,
    )
    await user.click(back)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows no Back button without an open project', () => {
    renderPage({ cards: [cardOf()], onNewProject: vi.fn() })
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull()
  })
})

describe('ProjectsPage notice', () => {
  it('shows the sentence in one alert', () => {
    renderPage({ notice: 'Could not open the project: the file is damaged.' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not open the project: the file is damaged.',
    )
  })

  it('shows no alert without a notice', () => {
    renderPage({ cards: [cardOf()] })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ProjectsPage card actions control', () => {
  const control = { name: 'Actions for Hubbard House' }

  it('puts the control beside the link, never inside it, when onCardAction is given', () => {
    renderPage({ cards: [cardOf()], onCardAction: vi.fn() })
    const actions = screen.getByRole('button', control)
    expect(linkNamed('Hubbard House').contains(actions)).toBe(false)
    expect(screen.getByRole('listitem')).toContainElement(actions)
  })

  it('shows no control without onCardAction', () => {
    renderPage({ cards: [cardOf()] })
    expect(screen.queryByRole('button', control)).toBeNull()
  })
})

describe('ProjectsPage file drop', () => {
  it('calls onDropFile once with the first file that is dropped on the page', () => {
    const onDropFile = vi.fn()
    const first = new File(['first'], 'first.building')
    const second = new File(['second'], 'second.building')
    renderPage({ onDropFile })
    const heading = screen.getByRole('heading', { level: 1, name: 'Projects' })

    fireEvent.dragEnter(heading, { dataTransfer: { types: ['Files'] } })
    fireEvent.drop(heading, { dataTransfer: { files: [first, second] } })

    expect(onDropFile.mock.calls).toEqual([[first]])
  })
})
