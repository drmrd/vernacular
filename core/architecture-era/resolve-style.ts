import type { Project, StyleTag } from '../model/types'

/**
 * The effective style tag of a floor or room:
 * room.styleOverride ?? floor.styleOverride ?? project.style. Returns undefined
 * when no level carries a style (style, unlike period, has no required default).
 */
export function resolveStyle(
  project: Project,
  floorId: string,
  roomKey?: string,
): StyleTag | undefined {
  const roomStyle =
    roomKey === undefined ? undefined : project.roomOverrides?.[roomKey]?.styleOverride
  const floorStyle = project.floors.find((floor) => floor.id === floorId)?.styleOverride
  return roomStyle ?? floorStyle ?? project.meta.style
}
