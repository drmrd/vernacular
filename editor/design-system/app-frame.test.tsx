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
