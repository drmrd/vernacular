import type { Preview } from '@storybook/react-vite'

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
}

export default preview
