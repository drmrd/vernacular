import { test, expect, type Page } from '@playwright/test'
import { logReading, settledHarnessCanvas } from './scene-helpers'

// The harness draws its ready frame as the first draw of a fresh animation frame of the
// renderer, and reports that frame's render and draw calls on the wrapper. A frame that only
// recomposites the pass textures of an earlier draw makes one render call and one draw call; a
// second draw in the same frame adds its own calls to the count. Either way the count moves.
//
// The window-light state draws through the ambient-occlusion pipeline: the normal and depth
// prepass, the occlusion pass, the sun's shadow map, the scene pass, and the output quad.
const AMBIENT_OCCLUSION_FRAME_RENDER_CALLS = 5
// The default shell draws without the pipeline: the sun's shadow map and the scene.
const PLAIN_FRAME_RENDER_CALLS = 2

async function readyFrameCalls(
  page: Page,
  query: string,
): Promise<{ render: string; draw: string }> {
  await settledHarnessCanvas(page, query, 'the ready-frame check')
  const harness = page.getByTestId('scene-harness')
  const render = (await harness.getAttribute('data-harness-ready-render-calls')) ?? ''
  const draw = (await harness.getAttribute('data-harness-ready-draw-calls')) ?? ''
  logReading(`ready frame of '${query}' (render calls / draw calls)`, `${render} / ${draw}`)
  return { render, draw }
}

test.describe('Scene harness ready frame', () => {
  test('the ready frame of the window-light state runs every pass of the ambient-occlusion pipeline', async ({
    page,
  }) => {
    const calls = await readyFrameCalls(page, '&scene=window-light')

    expect(calls.render).toBe(String(AMBIENT_OCCLUSION_FRAME_RENDER_CALLS))
    expect(Number(calls.draw)).toBeGreaterThan(AMBIENT_OCCLUSION_FRAME_RENDER_CALLS)
  })

  test('the ready frame of the default shell is the only draw of its animation frame', async ({
    page,
  }) => {
    const calls = await readyFrameCalls(page, '')

    expect(calls.render).toBe(String(PLAIN_FRAME_RENDER_CALLS))
  })
})
