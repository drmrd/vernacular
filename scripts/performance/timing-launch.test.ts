import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { timingLaunchArgs } from './timing-launch.mjs'

const WINDOW_SIZE_FLAG = '--window-size=1280,900'
const EXPOSE_GC_FLAG = '--js-flags=--expose-gc'
const METAL_FLAG = '--use-angle=metal'
const MINIMUM_MACOS_FLAGS = 3

/**
 * The flags that playwright.config.ts gives the scene-webgl project on macOS, read from the text
 * of the configuration so that the timing command and the scene project cannot drift apart. They
 * are the quoted flags of the array after `process.platform === 'darwin' ?` in the declaration of
 * SCENE_WEBGL_LAUNCH_ARGS.
 */
function sceneWebglMacOsFlags(): string[] {
  const text = readFileSync(resolve('playwright.config.ts'), 'utf8')
  const declaration = text.slice(text.indexOf('const SCENE_WEBGL_LAUNCH_ARGS'))
  const macOsArray = /process\.platform === 'darwin'\s*\?\s*\[([^\]]*)\]/.exec(declaration)
  const arrayBody = macOsArray?.[1] ?? ''
  return [...arrayBody.matchAll(/'(--[^']+)'/g)].map((match) => match[1] ?? '')
}

describe('the macOS flags read from the scene-webgl configuration', () => {
  it('are found, so that the comparison below cannot pass with nothing to compare', () => {
    expect(sceneWebglMacOsFlags().length).toBeGreaterThanOrEqual(MINIMUM_MACOS_FLAGS)
  })
})

describe('the browser launch flags of a timing run on macOS', () => {
  it('hold every flag that the scene-webgl project launches with', () => {
    const flags = timingLaunchArgs('darwin')

    for (const sceneFlag of sceneWebglMacOsFlags()) {
      expect(flags).toContain(sceneFlag)
    }
  })

  it('set the window size to 1280 x 900', () => {
    expect(timingLaunchArgs('darwin')).toContain(WINDOW_SIZE_FLAG)
  })

  it('expose the garbage collector to the page', () => {
    expect(timingLaunchArgs('darwin')).toContain(EXPOSE_GC_FLAG)
  })
})

describe('the browser launch flags of a timing run on linux', () => {
  it('do not select the Metal backend', () => {
    expect(timingLaunchArgs('linux')).not.toContain(METAL_FLAG)
  })

  it('still set the window size and expose the garbage collector', () => {
    const flags = timingLaunchArgs('linux')

    expect(flags).toContain(WINDOW_SIZE_FLAG)
    expect(flags).toContain(EXPOSE_GC_FLAG)
  })
})
