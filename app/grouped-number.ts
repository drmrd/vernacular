// The locale is named so the grouping is the same in every browser and every test runner: with no
// locale named, the runtime's own locale decides, and 10000 can read "10.000" or "10 000". The
// sentences of the application are English, so the English grouping is the right one.
const GROUPING = new Intl.NumberFormat('en-US')

/** A whole number that is not negative, in groups of three digits with a comma between them. */
export function groupedNumber(value: number): string {
  return GROUPING.format(value)
}
