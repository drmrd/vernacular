import {
  createContext,
  createElement,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { Point } from '../../core'

const PointerReadoutValueContext = createContext<Point | null>(null)
const ReportPointerContext = createContext<Dispatch<SetStateAction<Point | null>> | null>(null)

/** The world point under the cursor, or null when the pointer is off the canvas. */
export function usePointerReadout(): Point | null {
  return useContext(PointerReadoutValueContext)
}

/** The stable setter the plan calls to report (or clear, with null) the cursor's world point. */
export function useReportPointer(): Dispatch<SetStateAction<Point | null>> {
  const report = useContext(ReportPointerContext)
  if (report === null) {
    throw new Error('useReportPointer must be used within a PointerReadoutProvider')
  }
  return report
}

/**
 * Shares the cursor's world point between the plan (which reports it on every move)
 * and the status-bar readout (which displays it). The value and its setter live in
 * separate contexts so the reporter subscribes only to the stable setter: a move
 * re-renders the readout, never the canvas that set it.
 */
export function PointerReadoutProvider({ children }: { children: ReactNode }) {
  const [world, setWorld] = useState<Point | null>(null)
  return createElement(
    ReportPointerContext.Provider,
    { value: setWorld },
    createElement(PointerReadoutValueContext.Provider, { value: world }, children),
  )
}
