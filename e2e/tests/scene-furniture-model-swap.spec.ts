import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

import { settledSceneCanvas } from './scene-helpers'
import { canvasBox, selectors } from './journeys/support'

// Proves a placed furniture piece swaps its massing box for the real GLB mesh in the live 3D
// preview. Runs only in the GPU `scene-webgl` Playwright project (the config routes
// `scene-*.spec.ts` there, and CI's chromium e2e job ignores that pattern), and self-skips
// without WebGPU, because the live pane renders through the WebGPU backend.

// The committed untextured cube GLB, imported as a user asset so the swap runs against a real
// model. The bundled starter pack ships a placeholder stub for its example chair, so it can never
// parse into a mesh; a user import is the path that resolves to real GLB bytes.
const cubeFixture = fileURLToPath(new URL('../fixtures/cube.glb', import.meta.url))

// The overall budget for the asynchronous library write to list and for the model to load and
// swap in; generous because both cross an async boundary (the user-source write, then the load).
const SWAP_TIMEOUT_MS = 15_000

// Opens the furniture library and imports the cube GLB. The panel re-lists the
// library after a successful import, so the stored "cube" item appears in place.
async function importCubeFurniture(page: Page) {
  const furniture = page.getByRole('button', { name: 'Furniture' })
  await furniture.click()

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import a 3D model' }).click()
  await (await chooser).setFiles(cubeFixture)

  const cube = page.getByRole('button', { name: 'cube' })
  await expect(cube).toBeVisible({ timeout: SWAP_TIMEOUT_MS })
  return cube
}

test('a placed user-imported model swaps its box for the real mesh in 3D', async ({ page }) => {
  await page.goto('/?e2e=1')
  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
  test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')
  await expect(selectors.planCanvas(page)).toBeVisible()

  const cube = await importCubeFurniture(page)

  // Picking the item arms it and switches to the place-furniture tool; a canvas click drops a
  // piece centered on the cursor, the same placement the furniture journey exercises.
  await cube.click()
  const box = await canvasBox(page)
  await selectors.planCanvas(page).click({ position: { x: box.width * 0.5, y: box.height * 0.5 } })

  // Enter the live 3D preview, where the model loads behind the content-hash cache and the
  // reconciler swaps the now-ready piece's massing box for its mesh.
  await settledSceneCanvas(page)

  // The flag-gated swap signal sets data-model-loaded-<id>=true once a piece shows its real
  // mesh. Wait on that committed swap rather than the network: poll the signal node for any
  // loaded-model attribute, which the one placed piece sets after it swaps in.
  const signals = page.locator('[data-testid="furniture-model-signals"]')
  await expect(async () => {
    const swapped = await signals.evaluate((element) =>
      element
        .getAttributeNames()
        .some(
          (name) => name.startsWith('data-model-loaded-') && element.getAttribute(name) === 'true',
        ),
    )
    expect(swapped).toBe(true)
  }).toPass({ timeout: SWAP_TIMEOUT_MS })
})
