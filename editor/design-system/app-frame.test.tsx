import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppFrame } from './app-frame'

afterEach(cleanup)

function renderFrame() {
  render(
    <AppFrame
      header={<h1>Vernacular</h1>}
      rail={<p>rail content</p>}
      railLabel="Tools"
      main={<p>canvas content</p>}
      mainLabel="Viewport"
      inspector={<p>inspector content</p>}
      inspectorLabel="Inspector"
    />,
  )
}

describe('AppFrame', () => {
  it('renders a banner header with its content', () => {
    renderFrame()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Vernacular' })).toBeInTheDocument()
  })

  it('renders the rail as a labeled complementary region with its content', () => {
    renderFrame()
    expect(screen.getByRole('complementary', { name: 'Tools' })).toBeInTheDocument()
    expect(screen.getByText('rail content')).toBeInTheDocument()
  })

  it('renders the central area as a labeled main with its content', () => {
    renderFrame()
    expect(screen.getByRole('main', { name: 'Viewport' })).toBeInTheDocument()
    expect(screen.getByText('canvas content')).toBeInTheDocument()
  })

  it('renders the inspector as a labeled complementary region with its content', () => {
    renderFrame()
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument()
    expect(screen.getByText('inspector content')).toBeInTheDocument()
  })

  it('always renders an unsupported-width notice element so narrow widths read as a defined state', () => {
    renderFrame()
    const notice = screen.getByRole('note')
    expect(notice).toBeInTheDocument()
    expect(notice).toHaveTextContent(/wider screen/i)
  })
})

describe('AppFrame collapse', () => {
  it('exposes an expanded rail toggle that collapses the rail when pressed', async () => {
    const user = userEvent.setup()
    render(
      <AppFrame
        header={<h1>Vernacular</h1>}
        rail={<p>rail content</p>}
        railLabel="Tools"
        main={<p>canvas</p>}
        mainLabel="Viewport"
        inspector={<p>inspector content</p>}
        inspectorLabel="Inspector"
      />,
    )
    const toggle = screen.getByRole('button', { name: /collapse tools/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(screen.getByRole('complementary', { name: 'Tools' })).toHaveAttribute(
      'data-collapsed',
      'true',
    )
    expect(screen.getByRole('button', { name: /collapse tools/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('collapses the inspector independently of the rail', async () => {
    const user = userEvent.setup()
    render(
      <AppFrame
        header={<h1>Vernacular</h1>}
        rail={<p>rail</p>}
        railLabel="Tools"
        main={<p>canvas</p>}
        mainLabel="Viewport"
        inspector={<p>inspector</p>}
        inspectorLabel="Inspector"
      />,
    )
    await user.click(screen.getByRole('button', { name: /collapse inspector/i }))
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toHaveAttribute(
      'data-collapsed',
      'true',
    )
    expect(screen.getByRole('complementary', { name: 'Tools' })).toHaveAttribute(
      'data-collapsed',
      'false',
    )
  })
})

describe('AppFrame rail disclosure', () => {
  it('opens the rail through a Tools disclosure that flips aria-expanded and data-rail-open', async () => {
    const user = userEvent.setup()
    renderFrame()

    const toggle = screen.getByRole('button', { name: /show tools/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'ds-app-frame-rail')
    expect(screen.getByRole('complementary', { name: 'Tools' })).toHaveAttribute(
      'id',
      'ds-app-frame-rail',
    )

    await user.click(toggle)

    const opened = screen.getByRole('button', { name: /hide tools/i })
    expect(opened).toHaveAttribute('aria-expanded', 'true')
    expect(opened.closest('.ds-app-frame')).toHaveAttribute('data-rail-open', 'true')
  })
})

describe('AppFrame statusBar', () => {
  it('renders the optional statusBar slot spanning the full width', () => {
    render(
      <AppFrame
        header={<div>header</div>}
        rail={<div>rail</div>}
        railLabel="Rail"
        main={<div>main</div>}
        mainLabel="Main"
        inspector={<div>inspector</div>}
        inspectorLabel="Inspector"
        statusBar={<div data-testid="status">status content</div>}
      />,
    )
    expect(screen.getByTestId('status')).toBeInTheDocument()
  })

  it('renders without a status bar when the prop is omitted', () => {
    renderFrame()
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })
})

describe('AppFrame resize', () => {
  it('exposes a keyboard-operable vertical separator for the rail', async () => {
    const user = userEvent.setup()
    render(
      <AppFrame
        header={<h1>Vernacular</h1>}
        rail={<p>rail</p>}
        railLabel="Tools"
        main={<p>canvas</p>}
        mainLabel="Viewport"
        inspector={<p>inspector</p>}
        inspectorLabel="Inspector"
      />,
    )
    const separator = screen.getByRole('separator', { name: /resize tools/i })
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
    const before = Number(separator.getAttribute('aria-valuenow'))
    separator.focus()
    await user.keyboard('{ArrowRight}')
    const after = Number(
      screen.getByRole('separator', { name: /resize tools/i }).getAttribute('aria-valuenow'),
    )
    expect(after).toBeGreaterThan(before)
  })

  it('exposes a separate resize separator for the inspector', () => {
    render(
      <AppFrame
        header={<h1>Vernacular</h1>}
        rail={<p>rail</p>}
        railLabel="Tools"
        main={<p>canvas</p>}
        mainLabel="Viewport"
        inspector={<p>inspector</p>}
        inspectorLabel="Inspector"
      />,
    )
    expect(screen.getByRole('separator', { name: /resize inspector/i })).toBeInTheDocument()
  })
})
