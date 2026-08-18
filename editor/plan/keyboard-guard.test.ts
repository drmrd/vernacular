import { afterEach, describe, expect, it } from 'vitest'
import { isInteractiveTarget } from './keyboard-guard'

const mounted: HTMLElement[] = []

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  const element = host.firstElementChild as HTMLElement
  document.body.appendChild(host)
  mounted.push(host)
  return element
}

afterEach(() => {
  for (const host of mounted.splice(0)) {
    host.remove()
  }
})

describe('isInteractiveTarget', () => {
  it('claims every control that owns its own keystrokes', () => {
    expect(isInteractiveTarget(mount('<input />'))).toBe(true)
    expect(isInteractiveTarget(mount('<textarea></textarea>'))).toBe(true)
    expect(isInteractiveTarget(mount('<select><option>a</option></select>'))).toBe(true)
    expect(isInteractiveTarget(mount('<button type="button">Draw wall</button>'))).toBe(true)
    expect(isInteractiveTarget(mount('<div contenteditable="true">note</div>'))).toBe(true)
  })

  it('leaves the drawing surface and other plain elements to the tools', () => {
    expect(isInteractiveTarget(mount('<canvas></canvas>'))).toBe(false)
    expect(isInteractiveTarget(mount('<div>plain</div>'))).toBe(false)
    expect(isInteractiveTarget(null)).toBe(false)
  })
})
