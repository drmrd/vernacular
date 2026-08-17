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
  it('renders Restore and the delete action as design-system buttons', () => {
    render(<RecoveryPrompt onRestore={() => {}} onDiscard={() => {}} />)
    for (const name of ['Restore', 'Delete recovered copy']) {
      expect(screen.getByRole('button', { name })).toHaveClass('ds-button')
    }
  })

  it('says what each answer does to the open document', () => {
    // A bare "Discard" read as though it threw away the changes in the open
    // document. What it deletes is the recovered copy, and Restore is the answer
    // that replaces what is open, which the banner never said either.
    render(<RecoveryPrompt onRestore={() => {}} onDiscard={() => {}} />)

    const prompt = screen.getByRole('alert')
    expect(prompt).toHaveTextContent(/unsaved changes were recovered/i)
    expect(prompt).toHaveTextContent(/restore replaces the document you have open/i)
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull()
  })
})
