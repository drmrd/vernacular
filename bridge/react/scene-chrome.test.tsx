import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneChrome, SceneChromeProvider } from './scene-chrome'
import { SceneFailureHost } from './scene-failure-host'

const PLAIN_CANNOT_RENDER = 'This browser cannot render the 3D view.'

function ChromeBesideFailure({ failed }: { failed: boolean }) {
  return (
    <SceneChromeProvider>
      <SceneChrome>
        <button type="button">Top view</button>
      </SceneChrome>
      {failed ? <SceneFailureHost kind="start" /> : null}
    </SceneChromeProvider>
  )
}

describe('SceneChrome', () => {
  it('shows its children while no failure view is mounted', () => {
    render(<ChromeBesideFailure failed={false} />)

    expect(screen.getByRole('button', { name: 'Top view' })).toBeInTheDocument()
  })

  it('removes its children while a failure view is mounted under the same provider', () => {
    render(<ChromeBesideFailure failed />)

    expect(screen.queryByRole('button', { name: 'Top view' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(PLAIN_CANNOT_RENDER)
  })

  it('shows its children again once the failure view unmounts', () => {
    const { rerender } = render(<ChromeBesideFailure failed />)

    rerender(<ChromeBesideFailure failed={false} />)

    expect(screen.getByRole('button', { name: 'Top view' })).toBeInTheDocument()
  })

  it('shows its children beside a failure view when there is no provider', () => {
    render(
      <>
        <SceneChrome>
          <button type="button">Top view</button>
        </SceneChrome>
        <SceneFailureHost kind="start" />
      </>,
    )

    expect(screen.getByRole('button', { name: 'Top view' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(PLAIN_CANNOT_RENDER)
  })
})
