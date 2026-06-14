import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ProjectControls, RecoveryPrompt } from './project-controls'

afterEach(cleanup)

describe('ProjectControls', () => {
  it('renders the project actions as neutral design-system buttons', () => {
    render(<ProjectControls onNewProject={() => {}} onSave={() => {}} onOpenFolder={() => {}} />)
    for (const name of ['New', 'Save', 'Open folder']) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveClass('ds-button')
      expect(button).toHaveClass('ds-button--neutral')
    }
  })
})

describe('RecoveryPrompt', () => {
  it('renders Restore and Discard as design-system buttons', () => {
    render(<RecoveryPrompt onRestore={() => {}} onDiscard={() => {}} />)
    for (const name of ['Restore', 'Discard']) {
      expect(screen.getByRole('button', { name })).toHaveClass('ds-button')
    }
  })
})
