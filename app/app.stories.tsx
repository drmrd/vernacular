import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, fireEvent, expect, waitFor } from 'storybook/test'
import { App } from './app'
import { InMemoryProjectStore } from '../storage'

const meta: Meta<typeof App> = {
  title: 'App/Shell',
  component: App,
  // The shell stories mount the whole application, including the WebGPU scene,
  // and replay the same flows the end-to-end suite already covers. The '!test'
  // tag keeps them out of the browser-mode component-test run so the harness
  // stays focused on isolated components.
  tags: ['!test'],
}

export default meta

type Story = StoryObj<typeof App>

export const Default: Story = {}

// A fresh in-memory store per mount keeps the demo repeatable and avoids touching
// the durable IndexedDB store. useState seeds it once so App does not re-boot.
function DemoApp() {
  const [store] = useState(() => new InMemoryProjectStore())
  return <App store={store} />
}

const SLOW_MO_MS = 800

// Canvas-relative click points (px). The wall runs left to right; its midpoint is
// where the Select step clicks to pick it. These match the end-to-end spec.
const WALL_START_X = 120
const WALL_END_X = 520
const WALL_MID_X = 320
const WALL_Y = 200

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function clickCanvasAt(canvas: HTMLElement, x: number, y: number) {
  const rect = canvas.getBoundingClientRect()
  fireEvent.pointerDown(canvas, { clientX: rect.left + x, clientY: rect.top + y })
}

function moveCanvasTo(canvas: HTMLElement, x: number, y: number) {
  const rect = canvas.getBoundingClientRect()
  fireEvent.pointerMove(canvas, { clientX: rect.left + x, clientY: rect.top + y })
}

export const DrawWallSlowMotion: Story = {
  name: 'Draw wall (slow motion)',
  render: () => <DemoApp />,
  play: async ({ canvasElement, step }) => {
    const screen = within(canvasElement)
    const canvas = await screen.findByLabelText('Floor plan')

    await step('Draw a wall with two clicks', async () => {
      await wait(SLOW_MO_MS)
      clickCanvasAt(canvas, WALL_START_X, WALL_Y)
      // Sweep the cursor between the clicks so the rubber-band preview is visible.
      await wait(SLOW_MO_MS)
      moveCanvasTo(canvas, WALL_MID_X, WALL_Y)
      await wait(SLOW_MO_MS)
      moveCanvasTo(canvas, WALL_END_X, WALL_Y)
      await wait(SLOW_MO_MS)
      clickCanvasAt(canvas, WALL_END_X, WALL_Y)
    })

    await waitFor(() => expect(screen.getByText('Walls: 1')).toBeInTheDocument())

    await step('Switch to Select and pick the wall', async () => {
      await wait(SLOW_MO_MS)
      fireEvent.click(screen.getByRole('button', { name: 'Select' }))
      await wait(SLOW_MO_MS)
      clickCanvasAt(canvas, WALL_MID_X, WALL_Y)
    })

    await waitFor(() => expect(screen.getByText('Wall selected')).toBeInTheDocument())
  },
}
