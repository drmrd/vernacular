/// <reference types="vitest" />
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        serviceWorker: resolve(rootDir, 'src/service-worker.ts'),
      },
      output: {
        // Emit the worker at a stable root path (/service-worker.js) so its scope
        // covers the whole app; hash every other entry as usual.
        entryFileNames: (chunk) =>
          chunk.name === 'serviceWorker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'e2e/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/**/*.{ts,tsx}',
        'core/**/*.{ts,tsx}',
        'storage/**/*.{ts,tsx}',
        'engine/**/*.{ts,tsx}',
        'bridge/**/*.{ts,tsx}',
        'editor/**/*.{ts,tsx}',
        'app/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.stories.tsx',
        'src/main.tsx',
        'src/service-worker.ts',
        'src/setupTests.ts',
        'engine/renderer/create-renderer.ts',
        'bridge/react/webgpu-scene-view.tsx',
        'bridge/react/use-scene-graph.ts',
        'bridge/react/use-autosave.ts',
        'editor/plan/plan-view.tsx',
        'editor/plan/use-viewport-controls.ts',
        'editor/plan/use-wall-editing.ts',
        'editor/plan/selected-wall.ts',
        'storage/indexeddb/indexeddb-project-store.ts',
      ],
    },
  },
})
