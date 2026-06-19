import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    projects: [
      { extends: './vite.config.ts', test: { name: 'unit' } },
      {
        extends: './vite.config.ts',
        plugins: [storybookTest({ configDir: join(rootDir, '.storybook') })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [{ browser: 'chromium' }],
          },
          // Storybook 10.3+ (@storybook/addon-vitest) auto-applies the preview and
          // a11y annotations to the browser project, so no setupFiles entry is needed.
        },
      },
    ],
  },
})
