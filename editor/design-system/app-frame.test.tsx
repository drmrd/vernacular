import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
