import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SceneNavToolbar } from './scene-nav-toolbar'

afterEach(cleanup)

describe('SceneNavToolbar', () => {
  it('renders orbit, walk, and reset controls inside a navigation toolbar', () => {
    render(<SceneNavToolbar mode="orbit" onModeChange={vi.fn()} onReset={vi.fn()} />)

    const toolbar = screen.getByRole('toolbar', { name: /navigation/i })
    expect(toolbar).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Walk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument()
  })

  it('marks the active mode button as pressed and the inactive one as not pressed', () => {
    render(<SceneNavToolbar mode="walk" onModeChange={vi.fn()} onReset={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Orbit' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports a mode change when an inactive mode button is clicked', async () => {
    const onModeChange = vi.fn()
    render(<SceneNavToolbar mode="orbit" onModeChange={onModeChange} onReset={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Walk' }))

    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange).toHaveBeenCalledWith('walk')
  })

  it('reports a reset when the reset control is clicked', async () => {
    const onReset = vi.fn()
    render(<SceneNavToolbar mode="orbit" onModeChange={vi.fn()} onReset={onReset} />)

    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }))

    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
