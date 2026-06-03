/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'e2e/**'],
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
        'src/setupTests.ts',
        'engine/renderer/create-renderer.ts',
        'bridge/react/webgpu-scene-view.tsx',
        'bridge/react/use-scene-graph.ts',
        'bridge/react/use-autosave.ts',
        'editor/plan/plan-view.tsx',
        'storage/indexeddb/indexeddb-project-store.ts',
      ],
    },
  },
})
