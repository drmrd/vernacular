// The browser flags of a timing run. Pure: the driver passes process.platform.

// The flags of SCENE_WEBGL_LAUNCH_ARGS in playwright.config.ts for macOS, in the same order.
// That constant is not imported because the config file is TypeScript with side effects for the
// test runner; a unit test keeps this list in step with it.
const MACOS_SCENE_WEBGL_FLAGS = [
  '--enable-unsafe-webgpu',
  '--use-angle=metal',
  '--use-gpu-in-tests',
  '--ignore-gpu-blocklist',
]

// Other platforms request no GPU flags, as in SCENE_WEBGL_LAUNCH_ARGS.
const OTHER_PLATFORM_SCENE_WEBGL_FLAGS = []

const WINDOW_SIZE_FLAG = '--window-size=1280,900'
const EXPOSE_GC_FLAG = '--js-flags=--expose-gc'

/**
 * The Chromium flags of a timing run on this platform: the scene-webgl flags, window size, gc.
 * @param {string} platform a value of process.platform
 * @returns {string[]}
 */
export function timingLaunchArgs(platform) {
  const sceneFlags =
    platform === 'darwin' ? MACOS_SCENE_WEBGL_FLAGS : OTHER_PLATFORM_SCENE_WEBGL_FLAGS
  return [...sceneFlags, WINDOW_SIZE_FLAG, EXPOSE_GC_FLAG]
}
