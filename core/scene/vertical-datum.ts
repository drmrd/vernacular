/** Local-Y span of a wall: base on the finished floor, top at its height
 *  (foundation spec section 2.2). */
export function wallVerticalSpan(height: number): { base: number; top: number } {
  return { base: 0, top: height }
}

/** Local-Y span of a floor slab: top flush with the finished floor (Y = 0),
 *  thickness extending below (foundation spec section 2.2). */
export function floorSlabVerticalSpan(thickness: number): { top: number; bottom: number } {
  return { top: 0, bottom: -thickness }
}
