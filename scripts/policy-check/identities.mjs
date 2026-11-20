export const OWNER_IDENTITY = {
  name: 'Dan Moore',
  email: '9156191+drmrd@users.noreply.github.com',
}

/** Bot authors allowed only on the branches their tooling creates. */
export const BOT_IDENTITIES = Object.freeze([
  Object.freeze({
    email: '41898282+github-actions[bot]@users.noreply.github.com',
    branchPrefix: 'release-please--branches--',
  }),
  Object.freeze({
    email: '49699333+dependabot[bot]@users.noreply.github.com',
    branchPrefix: 'dependabot/',
  }),
])
