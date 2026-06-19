import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: [
    '../src/**/*.stories.@(ts|tsx)',
    '../app/**/*.stories.@(ts|tsx)',
    '../editor/**/*.stories.@(ts|tsx)',
    '../bridge/**/*.stories.@(ts|tsx)',
  ],
  addons: ['@storybook/addon-vitest', '@storybook/addon-a11y'],
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
}

export default config
