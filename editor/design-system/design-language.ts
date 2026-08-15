/**
 * The design-language axis of the theme: which visual language the token layer
 * resolves to. It is independent of the light/dark appearance axis in `theme.ts`.
 *
 * `draughtsmans-restraint` is the shipped language (ADR-0069) and the default.
 * `arris` is the migration target (ADR-0154), reachable only behind the preview
 * flag while its component families are still being built, so the running editor
 * is never left visibly half-migrated.
 */
export type DesignLanguage = 'draughtsmans-restraint' | 'arris'

/** The shipped language. Every unrecognized flag input resolves back to this. */
export const DEFAULT_DESIGN_LANGUAGE: DesignLanguage = 'draughtsmans-restraint'

/**
 * Preview seam: `?theme-preview=arris` selects the Arris token layer. A normal page
 * load carries no such parameter, so the flag is a provable no-op for real users
 * (mirrors the `fixture` harness seam in `app/app.tsx`).
 */
export const DESIGN_LANGUAGE_PREVIEW_PARAM = 'theme-preview'

/** The one value that selects Arris. */
export const ARRIS_PREVIEW_VALUE = 'arris'

const PREVIEWABLE: Record<string, DesignLanguage> = {
  [ARRIS_PREVIEW_VALUE]: 'arris',
  [DEFAULT_DESIGN_LANGUAGE]: DEFAULT_DESIGN_LANGUAGE,
}

/**
 * Resolves the raw preview-flag value to a design language. The match is exact:
 * case variants and prefixes fall back to the shipped default rather than guessing,
 * so a typo shows the language the user already knows.
 */
export function resolveDesignLanguage(preview: string | null | undefined): DesignLanguage {
  if (preview === null || preview === undefined) {
    return DEFAULT_DESIGN_LANGUAGE
  }
  return PREVIEWABLE[preview] ?? DEFAULT_DESIGN_LANGUAGE
}
