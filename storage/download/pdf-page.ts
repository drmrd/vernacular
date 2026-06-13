import { PageSizes } from 'pdf-lib'

import type { UnitSystem } from '../../core'

/**
 * The portrait page size, in PDF points, for a project's unit system. Imperial
 * projects export onto US Letter and metric projects onto ISO A4, the default
 * stationery for each system. Each result is portrait (width before height);
 * the placement rule applies the final orientation later.
 */
const PAGE_SIZE_BY_UNIT_SYSTEM: Record<UnitSystem, readonly [number, number]> = {
  imperial: PageSizes.Letter,
  metric: PageSizes.A4,
}

/**
 * The portrait PDF page dimensions for the given unit system, in PDF points.
 */
export function pdfPageSize(units: UnitSystem): {
  width: number
  height: number
} {
  const [width, height] = PAGE_SIZE_BY_UNIT_SYSTEM[units]
  return { width, height }
}
