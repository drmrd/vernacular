import { useCallback, useEffect, useRef, useState } from 'react'
import { listProjectCards, type ProjectCardModel, type SessionPorts } from '../session'

/** The cards of the ports, and a way to read them again. */
export interface ProjectCards {
  readonly cards: readonly ProjectCardModel[] | undefined
  readonly refresh: () => void
}

/** The cards of the ports, read again on demand and when the tab becomes visible. */
export function useProjectCards(
  ports: SessionPorts | null,
  openId: string | undefined,
): ProjectCards {
  const [cards, setCards] = useState<readonly ProjectCardModel[] | undefined>(undefined)
  // The read that runs last. A read that ends after a newer one began sets nothing.
  const latestRead = useRef<object | null>(null)
  // A try that ends after the page is gone reads nothing.
  const mounted = useRef(false)
  const refresh = useCallback(() => {
    if (ports === null || !mounted.current) {
      return
    }
    const read = {}
    latestRead.current = read
    void listProjectCards(ports, openId).then((listed) => {
      if (latestRead.current === read) {
        setCards(listed)
      }
    })
  }, [ports, openId])
  useEffect(() => {
    mounted.current = true
    refresh()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      mounted.current = false
      latestRead.current = null
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refresh])
  return { cards, refresh }
}
