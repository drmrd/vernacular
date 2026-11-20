import { groupedNumber } from './grouped-number'

/** The sentence for an opened file that lacked some of the assets its project uses. */
export function importMissingAssetsText(count: number): string {
  const lacked = `The file did not include ${groupedNumber(count)} of the assets this project uses.`
  return count === 1 ? `${lacked} It shows as missing.` : `${lacked} They show as missing.`
}
