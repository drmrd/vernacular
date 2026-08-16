import type { Decorator, StoryContext } from '@storybook/react-vite'
import type { GlobalTypes, Globals } from 'storybook/internal/csf'
import {
  DEFAULT_DESIGN_LANGUAGE,
  resolveDesignLanguage,
} from '../editor/design-system/design-language'
import { ThemeProvider } from '../editor/design-system/theme-provider'
import type { ThemeChoice } from '../editor/design-system/theme'

const APPEARANCE_CHOICES: ThemeChoice[] = ['system', 'light', 'dark']
const DEFAULT_APPEARANCE: ThemeChoice = 'system'

function resolveAppearance(appearance: unknown): ThemeChoice {
  return APPEARANCE_CHOICES.find((choice) => choice === appearance) ?? DEFAULT_APPEARANCE
}

/**
 * Opt-in Storybook decorator for the parallel design-language theme (ADR-0162).
 * When the resolved language is the shipped default, the story renders exactly as
 * it always has, with no wrapper element, so committed visual baselines stay valid.
 * Only an explicit `arris` selection mounts `ThemeProvider`.
 */
export const withDesignLanguage: Decorator = (story, context: StoryContext) => {
  const designLanguage = resolveDesignLanguage(context.globals.designLanguage)
  if (designLanguage === DEFAULT_DESIGN_LANGUAGE) {
    return story()
  }
  return (
    <ThemeProvider
      designLanguage={designLanguage}
      defaultChoice={resolveAppearance(context.globals.appearance)}
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
