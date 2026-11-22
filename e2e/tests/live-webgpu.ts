import {
  test,
  expect,
  type FullProject,
  type Page,
  type PlaywrightWorkerOptions,
  type WorkerFixture,
  type WorkerInfo,
} from '@playwright/test'

// Shared by the journeys that drive the live 3D pane on a real WebGPU adapter. They need one
// because they assert the WebGPU path, so they self-skip on the linux runners, which have no
// adapter. The WebGL 2 path of the pane is pinned by scene-live-view-webgl-fallback.spec.ts.
// Where one must run, E2E_REQUIRE_WEBGPU=1 turns that skip into a failure. The macOS
// live-view CI job sets it, so a runner image that loses its adapter fails the job instead
// of passing it with a silent skip.

// Set where the journey must run rather than skip: the guard then fails when the runner lacks a
// WebGPU adapter or a WebGL 2 context.
const LIVE_SCENE_REQUIRED = process.env.E2E_REQUIRE_WEBGPU === '1'

// The `chromium` project launches the stripped-down headless shell, which exposes
// navigator.gpu but refuses every adapter. On macOS a live-pane journey takes the browser
// channel and the launch options of the scene-webgl project from the loaded Playwright
// configuration, which give the pane a Metal-backed WebGPU adapter, so the two cannot drift
// apart. Other browsers and other platforms keep their own project settings and fall through to
// the guard.
const GPU_PROJECT = 'scene-webgl'

type BrowserName = PlaywrightWorkerOptions['browserName']

function wantsGpuChromium(browserName: BrowserName): boolean {
  return browserName === 'chromium' && process.platform === 'darwin'
}

function workerUse(browserName: BrowserName, workerInfo: WorkerInfo): FullProject['use'] {
  if (!wantsGpuChromium(browserName)) return workerInfo.project.use
  const gpuProject = workerInfo.config.projects.find((project) => project.name === GPU_PROJECT)
  if (gpuProject === undefined) {
    throw new Error(`the Playwright configuration has no ${GPU_PROJECT} project to borrow from`)
  }
  return gpuProject.use
}

// Playwright reads a fixture's dependencies from the destructured first argument, so each
// fixture names browserName there.
const gpuChannel: WorkerFixture<
  PlaywrightWorkerOptions['channel'],
  PlaywrightWorkerOptions
> = async ({ browserName }, provide, workerInfo) => {
  await provide(workerUse(browserName, workerInfo).channel)
}

const gpuLaunchOptions: WorkerFixture<
  PlaywrightWorkerOptions['launchOptions'],
  PlaywrightWorkerOptions
> = async ({ browserName }, provide, workerInfo) => {
  await provide(workerUse(browserName, workerInfo).launchOptions ?? {})
}

// Call once at the top level of a journey spec, so that the whole file runs on the GPU browser.
export function configureGpuChromiumOnMac(): void {
  test.use({
    channel: [gpuChannel, { scope: 'worker' }],
    launchOptions: [gpuLaunchOptions, { scope: 'worker' }],
  })
}

// The live pane renders only where WebGPU exists, and a journey reads a real 3D drawing buffer,
// so both capabilities gate it. Presence of navigator.gpu is not enough: headless builds can
// expose the API while refusing every adapter, which mounts a pane that never renders a frame,
// so the guard asks for a real adapter. The subject names the journey in the skip message.
export async function guardLiveSceneSupport(page: Page, subject: string): Promise<void> {
  const support = await page.evaluate(async () => {
    const probe = document.createElement('canvas')
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu
    const adapter = gpu === undefined ? null : await gpu.requestAdapter().catch(() => null)
    return { webGpuAdapter: adapter !== null, webGl2: probe.getContext('webgl2') !== null }
  })
  if (LIVE_SCENE_REQUIRED) {
    expect(
      support,
      'E2E_REQUIRE_WEBGPU is set, so this runner must provide a WebGPU adapter and a WebGL 2 context',
    ).toEqual({ webGpuAdapter: true, webGl2: true })
  }
  test.skip(
    !support.webGpuAdapter,
    `The live 3D preview requires a working WebGPU adapter; ${subject} self-skips without one.`,
  )
  test.skip(!support.webGl2, `No WebGL 2 context on this runner; ${subject} self-skips here.`)
}
