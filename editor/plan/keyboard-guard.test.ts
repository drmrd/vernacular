import { afterEach, describe, expect, it } from 'vitest'
import { isTextEntry, ownsKeystroke } from './keyboard-guard'

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

describe('isTextEntry', () => {
  it('claims every field that swallows what is typed into it', () => {
    expect(isTextEntry(mount('<input />'))).toBe(true)
    expect(isTextEntry(mount('<textarea></textarea>'))).toBe(true)
    expect(isTextEntry(mount('<select><option>a</option></select>'))).toBe(true)
    expect(isTextEntry(mount('<div contenteditable="true">note</div>'))).toBe(true)
  })

  it('leaves the drawing surface, buttons, and other elements to the tools', () => {
    expect(isTextEntry(mount('<canvas></canvas>'))).toBe(false)
    expect(isTextEntry(mount('<div>plain</div>'))).toBe(false)
    expect(isTextEntry(mount('<button type="button">Draw wall</button>'))).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
})

describe('ownsKeystroke', () => {
  it('gives a focused field every key, whatever was pressed', () => {
    const field = mount('<input />')

    expect(ownsKeystroke(field, 'Escape')).toBe(true)
    expect(ownsKeystroke(field, 'ArrowRight')).toBe(true)
    expect(ownsKeystroke(field, 'Delete')).toBe(true)
  })

  it('gives a focused button only the keys it navigates with', () => {
    const chip = mount('<button type="button" role="radio">Draw wall</button>')

    expect(ownsKeystroke(chip, 'ArrowRight')).toBe(true)
    expect(ownsKeystroke(chip, 'ArrowUp')).toBe(true)
    expect(ownsKeystroke(chip, 'Home')).toBe(true)
  })

  it('leaves a focused button the editor-wide shortcuts it never handles', () => {
    const chip = mount('<button type="button" role="radio">Draw wall</button>')

    expect(ownsKeystroke(chip, 'Escape')).toBe(false)
    expect(ownsKeystroke(chip, 'Delete')).toBe(false)
    expect(ownsKeystroke(chip, 'Backspace')).toBe(false)
  })
})
