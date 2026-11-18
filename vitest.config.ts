import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    projects: [
      {
        extends: './vite.config.ts',
        // Vitest appends this to the exclude list of vite.config.ts. The files need a real
        // browser, and the storage-browser project runs them.
        test: { name: 'unit', exclude: ['**/*.browser.test.ts'] },
      },
      {
        extends: './vite.config.ts',
        test: {
          name: 'storage-browser',
          include: ['**/*.browser.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        extends: './vite.config.ts',
        plugins: [storybookTest({ configDir: join(rootDir, '.storybook') })],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          // Storybook 10.3+ (@storybook/addon-vitest) auto-applies the preview and
          // a11y annotations to the browser project, so no setupFiles entry is needed.
        },
      },
    ],
  },
})
