export interface RegistryEntry {
  id: string
}

export interface Registry<T extends RegistryEntry> {
  version: number
  entries: Readonly<Record<string, T>>
}

export function createRegistry<T extends RegistryEntry>(
  version: number,
  entries: readonly T[],
): Registry<T> {
  const indexed: Record<string, T> = {}
  for (const entry of entries) {
    indexed[entry.id] = entry
  }
  return { version, entries: indexed }
}

export function getEntry<T extends RegistryEntry>(
  registry: Registry<T>,
  id: string,
): T | undefined {
  return registry.entries[id]
}

/** Overlay entries win on id collision; the merged version is the higher of the two. */
export function mergeRegistries<T extends RegistryEntry>(
  base: Registry<T>,
  overlay: Registry<T>,
): Registry<T> {
  return {
    version: Math.max(base.version, overlay.version),
    entries: { ...base.entries, ...overlay.entries },
  }
}
