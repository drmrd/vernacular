import {
  DESIGN_LANGUAGE_PREVIEW_PARAM,
  resolveDesignLanguage,
  type DesignLanguage,
} from '../editor/design-system'

/** The value of a query parameter of the address of the window, or null when it is absent. */
export function searchParam(name: string): string | null {
  return new URLSearchParams(globalThis.location?.search ?? '').get(name)
}

// Preview seam for the in-progress Arris visual language (ADR-0154): `?theme-preview=arris`
// mounts the Arris token layer instead of the shipped one. A normal page load carries no
// such parameter, so the shipped language is what every real user gets; the migration plan
// flips the default only once every component family has moved.
export function requestedDesignLanguage(): DesignLanguage {
  return resolveDesignLanguage(searchParam(DESIGN_LANGUAGE_PREVIEW_PARAM))
}
