import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
}

export default config
