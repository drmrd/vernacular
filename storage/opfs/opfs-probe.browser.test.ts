import { expect, it } from 'vitest'
import { opfsUsable } from './opfs-probe'

it('finds the origin private file system of the test browser usable', async () => {
  await expect(opfsUsable()).resolves.toBe(true)
})
