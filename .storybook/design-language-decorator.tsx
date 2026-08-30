import type { Decorator, StoryContext } from '@storybook/react-vite'
import type { GlobalTypes, Globals } from 'storybook/internal/csf'
import {
  DEFAULT_DESIGN_LANGUAGE,
  resolveDesignLanguage,
} from '../editor/design-system/design-language'
import { ThemeProvider } from '../editor/design-system/theme-provider'
import { resolveThemeChoice } from '../editor/design-system/theme'

/**
 * Opt-in Storybook decorator for the parallel design-language theme (ADR-0162).
 * When the resolved language is the shipped default, the story renders with no
 * wrapper element. Only an explicit `arris` selection mounts `ThemeProvider`.
 * Importing that provider pulls the token layer into every story, which is
 * deliberate: the running editor always mounts it, so a story without the
 * tokens shows a state the app cannot produce (see ADR-0162's addendum).
 */
export const withDesignLanguage: Decorator = (story, context: StoryContext) => {
  const designLanguage = resolveDesignLanguage(context.globals.designLanguage)
  if (designLanguage === DEFAULT_DESIGN_LANGUAGE) {
    return story()
  }
  return (
    <ThemeProvider
      designLanguage={designLanguage}
      defaultChoice={resolveThemeChoice(context.globals.appearance)}
    >
      {story()}
    </ThemeProvider>
  )
}

export const designLanguageGlobalTypes: GlobalTypes = {
  designLanguage: {
    name: 'Design language',
    description: 'The visual design language a story previews',
    toolbar: {
      title: 'Design language',
      icon: 'paintbrush',
      items: ['draughtsmans-restraint', 'arris'],
      dynamicTitle: true,
    },
  },
  appearance: {
    name: 'Appearance',
    description: 'The light/dark appearance a story previews',
    toolbar: {
      title: 'Appearance',
      icon: 'circlehollow',
      items: ['system', 'light', 'dark'],
      dynamicTitle: true,
    },
  },
}

export const designLanguageInitialGlobals: Globals = {
  designLanguage: 'draughtsmans-restraint',
  appearance: 'system',
}
