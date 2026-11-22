import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { Button, Field, isComposingKey } from '../design-system'

export interface CardRenameFormProps {
  readonly name: string
  /** Resolves true when the name is stored. False keeps the form open with the typed text. */
  readonly onSave: (name: string) => Promise<boolean>
  readonly onCancel: () => void
}

/**
 * The submit of the form. A blank or unchanged name cancels. While a save runs, a second submit
 * does nothing.
 */
function useSubmit(
  draft: string,
  { name, onSave, onCancel }: CardRenameFormProps,
): (event: FormEvent) => void {
  const saving = useRef(false)
  return (event) => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (trimmed === '' || trimmed === name) {
      onCancel()
      return
    }
    if (saving.current) {
      return
    }
    saving.current = true
    void onSave(trimmed).finally(() => {
      saving.current = false
    })
  }
}

/** The form that renames a project on its card. It closes through its parent. */
export function CardRenameForm(props: CardRenameFormProps): ReactElement {
  const { name, onCancel } = props
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(name)
  const submit = useSubmit(draft, props)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  return (
    <form
      className="card-rename-form"
      onSubmit={submit}
      onKeyDown={(event) => {
        // An Escape that cancels an input method candidate is not a cancel of the rename.
        if (event.key === 'Escape' && !isComposingKey(event)) {
          onCancel()
        }
      }}
    >
      <Field htmlFor={inputId} label="Project name">
        <input
          id={inputId}
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </Field>
      <div className="card-rename-form__buttons">
        <Button type="submit">Save name</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
