import { describe, expect, it, vi } from 'vitest'
import { runIntegrationAudit } from './integration-audit.mjs'

function deps({ capabilities, titles }) {
  return {
    readMatrix: async () => ({ capabilities }),
    readJourneyTitles: async () => titles,
    log: vi.fn(),
  }
}

describe('runIntegrationAudit', () => {
  it('reports clean when every required capability has a journey test', async () => {
    const d = deps({
      capabilities: [
        { id: 'draw-wall', title: 'draws a wall and shows it on the plan', status: 'required' },
      ],
      titles: ['draws a wall and shows it on the plan'],
    })
    const code = await runIntegrationAudit([], d)
    expect(code).toBe(0)
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('clean'))
  })
})
