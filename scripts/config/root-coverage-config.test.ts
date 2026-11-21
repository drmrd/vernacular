// @vitest-environment node
import { describe, expect, it } from 'vitest'
import rootConfig from '../../vitest.config'
import viteConfig from '../../vite.config'

describe('the root Vitest config', () => {
  it('applies the coverage exclude list of vite.config.ts', () => {
    const expected = viteConfig.test?.coverage?.exclude
    expect(expected).toContain('editor/plan/plan-view.tsx')
    expect(rootConfig.test?.coverage?.exclude).toEqual(expected)
  })

  it('applies the coverage include list of vite.config.ts', () => {
    const expected = viteConfig.test?.coverage?.include
    expect(expected).toContain('core/**/*.{ts,tsx}')
    expect(rootConfig.test?.coverage?.include).toEqual(expected)
  })
})
