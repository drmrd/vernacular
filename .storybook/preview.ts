import type { Preview } from '@storybook/react-vite'
import { initialize, mswLoader } from 'msw-storybook-addon'

// Start the Mock Service Worker before any story renders, so data-driven
// components resolve their fetch calls against per-story handlers
// (parameters.msw.handlers) instead of the real network. Unhandled requests
// pass through, which keeps the Storybook runtime's own asset requests working;
// each networked story proves it hit no real network by asserting a result only
// its mocked handler can produce.
initialize({ onUnhandledRequest: 'bypass', quiet: true })

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'fullscreen',
    // The a11y addon runs axe-core against every story during the browser-mode
    // component test. 'todo' reports violations without failing, which keeps the
    // suite green while the story backfill is still in progress; a story that
    // should gate on accessibility opts in with parameters.a11y.test = 'error'.
    a11y: {
      test: 'todo',
    },
  },
  loaders: [mswLoader],
}

export default preview
