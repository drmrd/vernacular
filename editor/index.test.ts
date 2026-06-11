import { describe, expect, it } from 'vitest'
import { ColorPicker, FinishPicker, SiteEditor } from './index'

describe('editor barrel', () => {
  it('re-exports the paint pickers and the site editor', () => {
    for (const component of [FinishPicker, ColorPicker, SiteEditor]) {
      expect(typeof component).toBe('function')
    }
  })
})
