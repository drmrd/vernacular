import { DEFAULT_FURNITURE_FOOTPRINT_MM } from '../../core'
import type { LibraryItem, UserSource } from '../../storage'

const GLTF_MAGIC = 'glTF'

/** Whether the bytes start with the glTF binary container magic ('glTF'). */
export function isGlb(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, GLTF_MAGIC.length)) === GLTF_MAGIC
}

function nameFromFileName(fileName: string): string {
  return fileName.replace(/\.glb$/i, '')
}

function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Reads a chosen GLB file, verifies its signature, and stores it in the user's
 * asset source as a furniture LibraryItem (name from the file name, default
 * footprint, empty eras/categories). Rejects a non-GLB file.
 */
export async function importFurnitureGlb(file: File, userSource: UserSource): Promise<LibraryItem> {
  const bytes = await readFileBytes(file)
  if (!isGlb(bytes)) {
    throw new Error(`"${file.name}" is not a GLB (glTF binary) file`)
  }
  return userSource.put(bytes, {
    name: nameFromFileName(file.name),
    footprint: DEFAULT_FURNITURE_FOOTPRINT_MM,
    kind: 'furniture',
    eras: [],
    categories: [],
  })
}
