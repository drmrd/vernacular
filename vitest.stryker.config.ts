import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// The Vitest config for mutation runs (the Stryker `vitest` runner). Vitest appends this
// exclude list to the one in vite.config.ts.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [
        // These need a real browser and fail under jsdom; the storage-browser project runs them.
        '**/*.browser.test.ts',
        // Stryker instruments core/, so the schema built from it looks like drift to this test.
        'tests/format/current-schema-validator.test.ts',
      ],
    },
  }),
)
