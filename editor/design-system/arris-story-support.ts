import { expect } from 'storybook/test'
import { ARRIS_SCOPE } from './css-token-test-support'

/**
 * Shared `play`-function assertion for a migrated family's Arris states sheet.
 *
 * Each `ArrisLight`/`ArrisDark` story pair renders a compact, static states
 * sheet for the Arris visual tier: two representative instances side by side,
 * so a single frame captures both states at once. This confirms the Arris
 * token layer's wrapper actually mounted around that sheet, using the same
 * scope attribute selector the token layer's own stylesheet is scoped under
 * (ARRIS_SCOPE), rather than each story file re-deriving its own copy.
 */
export async function expectArrisWrapper(canvasElement: HTMLElement) {
  const wrapper = canvasElement.querySelector(ARRIS_SCOPE)
  await expect(wrapper).toBeInTheDocument()
}
