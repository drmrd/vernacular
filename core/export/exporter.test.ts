import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../model/factories'
import type { ExportMediaType, ExportResult, Exporter } from './exporter'

describe('Exporter seam', () => {
  it('exposes a conforming exporter whose result carries its media type, extension, and content', () => {
    const svgMedia: ExportMediaType = 'image/svg+xml'
    const exporter: Exporter = {
      media: svgMedia,
      export(): ExportResult {
        return { media: 'image/svg+xml', extension: 'svg', content: '<svg/>' }
      },
    }

    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })

    const result = exporter.export(project)

    expect(result.media).toBe('image/svg+xml')
    expect(result.media).toBe(exporter.media)
    expect(result.extension).toBe('svg')
    expect(result.content).toBe('<svg/>')

    expect(project).toEqual(
      createEmptyProject({
        name: 'House',
        units: 'metric',
        period: 'victorian',
        appVersion: '0.1.0',
      }),
    )
  })
})
