/** The next roving-tabindex focus index for an arrow/Home/End key; clamps at the ends (no wrap). */
export function nextFocusIndex(current: number, key: string, count: number): number {
  if (count === 0) {
    return current
  }
  const target = targetIndex(current, key, count)
  return Math.max(0, Math.min(target, count - 1))
}

function targetIndex(current: number, key: string, count: number): number {
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return current + 1
    case 'ArrowUp':
    case 'ArrowLeft':
      return current - 1
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return current
  }
}
