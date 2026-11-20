import { groupedNumber } from './grouped-number'

/** The sentence for an opened file that lacked some of the assets its project uses. */
export function importMissingAssetsText(count: number): string {
  const lacked = `The file did not include ${groupedNumber(count)} of the assets this project uses.`
  return count === 1 ? `${lacked} It shows as missing.` : `${lacked} They show as missing.`
}

/** The sentence for an export that left out some of the assets its project uses. */
export function exportMissingAssetsText(count: number): string {
  const left = `The export does not include ${groupedNumber(count)}`
  return count === 1
    ? `${left} asset, because this browser does not have it.`
    : `${left} assets, because this browser does not have them.`
}
