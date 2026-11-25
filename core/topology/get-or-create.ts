/** The value `map` keeps for `key`, made by `create` and kept on the first call for that key. */
export function getOrCreate<K extends object, V>(map: WeakMap<K, V>, key: K, create: () => V): V {
  const kept = map.get(key)
  if (kept !== undefined) return kept
  const created = create()
  map.set(key, created)
  return created
}
