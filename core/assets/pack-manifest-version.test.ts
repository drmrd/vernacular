import { describe, expect, it } from 'vitest'
import { validatePackManifest } from './pack-manifest'
import { validManifest } from './pack-manifest-test-support'

describe('validatePackManifest - version', () => {
  it.each(['1.0.0+build.5', '01.0.0'])(
    'rejects the version %s, which is not a strict version without build metadata',
    (version) => {
      const result = validatePackManifest({ ...validManifest(), version })

      expect(result.valid).toBe(false)
      expect(result.errors.join(' ')).toContain('version')
    },
  )
})
