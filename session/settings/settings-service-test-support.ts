import type { SettingKey } from './settings-service'

/** Shared set-up of the tests of the settings service: a text setting and its checks. */

/** The name of the text setting of the tests. */
export const TEXT_NAME = 'text'

/** The value of the text setting when nothing valid is stored. */
export const TEXT_DEFAULT = 'fallback'

/** Accepts a stored text and refuses every other stored value. */
export function parseText(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined
}

/** A key of the text setting whose check is `parse`, under `name` if one is given. */
export function textKeyWith(
  parse: (raw: unknown) => string | undefined,
  name = TEXT_NAME,
): SettingKey<string> {
  return { name, defaultValue: TEXT_DEFAULT, parse }
}
