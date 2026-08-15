import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_DESIGN_LANGUAGE, type DesignLanguage } from './design-language'
import { resolveTheme, type ResolvedTheme, type ThemeChoice } from './theme'
import './tokens.css'
// Scoped entirely under [data-design-language='arris'], so loading it changes nothing
// until the attribute above selects it. It must come after tokens.css: the Arris light
// block and the shipped dark block have equal specificity, so source order decides.
import './tokens-arris.css'

interface ThemeContextValue {
  choice: ThemeChoice
  resolved: ResolvedTheme
  setChoice: (choice: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const DARK_QUERY = '(prefers-color-scheme: dark)'

// Tracks the OS dark-mode preference live so a "system" choice follows it without
// a reload. matchMedia is mocked under jsdom; the listener is a no-op there.
function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(
    () => globalThis.matchMedia?.(DARK_QUERY).matches ?? false,
  )
  useEffect(() => {
    const query = globalThis.matchMedia?.(DARK_QUERY)
    if (!query) {
      return
    }
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return prefersDark
}

export interface ThemeProviderProps {
  children: ReactNode
  defaultChoice?: ThemeChoice
  /** The visual language to mount. Defaults to the shipped one; see ADR-0154. */
  designLanguage?: DesignLanguage
}

export function ThemeProvider({
  children,
  defaultChoice = 'system',
  designLanguage = DEFAULT_DESIGN_LANGUAGE,
}: ThemeProviderProps) {
  const [choice, setChoice] = useState<ThemeChoice>(defaultChoice)
  const resolved = resolveTheme(choice, usePrefersDark())
  return (
    <ThemeContext.Provider value={{ choice, resolved, setChoice }}>
      {/* Both theming axes ride this one wrapper: the appearance (light or dark) and
          the design language. Swapping either attribute retargets the CSS custom-property
          layer beneath it, so no component reads or branches on the language itself. */}
      <div
        className="design-system-theme"
        data-theme={resolved}
        data-design-language={designLanguage}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook is the read half of this provider's public contract and ships beside it; the codebase keeps context hooks in a separate .ts file, but this slice's test imports useTheme from ./theme-provider.
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (value === null) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return value
}
