/**
 * A readable label from an element-type id: kebab-case to Title Case so the
 * plan, the inspector, and the accessibility proxies all read the same English
 * name for a type without each layer keeping its own copy of the conversion.
 */
export function humanizeElementTypeId(id: string): string {
  return id
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}
