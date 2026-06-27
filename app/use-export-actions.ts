import { useCallback } from 'react'
import { SvgPlanExporter } from '../core'
import {
  exportProjectBundle,
  bundleFilename,
  downloadBytes,
  downloadText,
  pngPlanFilename,
  pdfPlanFilename,
  rasterizeSvgToPng,
  svgPlanFilename,
  svgPlanToPdf,
  DEFAULT_RASTER_MAX_EDGE,
  PRINT_RASTER_MAX_EDGE,
} from '../storage'
import { type NotificationApi } from '../editor/design-system'
import { failureMessage } from './failure-message'
import type { ProjectActionsContext } from './use-project-actions'

/** A no-op reporter used until the toast hands back its real one synchronously. */
const NO_PROGRESS = (): void => {}

/** Map completed-of-total counts to a fraction in [0, 1], treating zero work as no progress. */
function progressFraction(completed: number, total: number): number {
  return total === 0 ? 0 : completed / total
}

/**
 * Wrap an async export in a promise toast: a pending toast while it runs, a success toast naming
 * the file, or an error toast whose Retry re-runs the export. The toast starts indeterminate and
 * becomes a determinate bar once `run` reports progress through its `onProgress` argument.
 */
export function runExportWithToast(
  notifications: NotificationApi,
  name: string,
  run: (onProgress: (completed: number, total: number) => void) => Promise<unknown>,
): void {
  const attempt = (): void => {
    let report: (fraction: number) => void = NO_PROGRESS
    const task = run((completed, total) => {
      report(progressFraction(completed, total))
    })
    void notifications.promise(
      task,
      {
        pending: `Exporting ${name}...`,
        success: () => `Exported ${name}`,
        error: (error) => ({
          message: failureMessage('Export', error),
          actions: [{ label: 'Retry', onAction: attempt }],
        }),
      },
      (reporter) => {
        report = reporter
      },
    )
  }
  attempt()
}

export function useExportBundleAction(context: ProjectActionsContext): () => void {
  const { session, projectId, assets, notifications } = context
  return useCallback(() => {
    const project = session.getProject()
    const name = bundleFilename(project.meta.name)
    runExportWithToast(notifications, name, (onProgress) =>
      exportProjectBundle(projectId, project, { assets, onProgress }).then((bytes) =>
        downloadBytes(bytes, name),
      ),
    )
  }, [session, projectId, assets, notifications])
}

export function useExportPlanAction(context: ProjectActionsContext): () => void {
  const { session, notifications } = context
  return useCallback(() => {
    const project = session.getProject()
    const name = svgPlanFilename(project.meta.name)
    try {
      const { content } = new SvgPlanExporter().export(project)
      downloadText(content, name, 'image/svg+xml')
      notifications.success(`Exported ${name}`)
    } catch (error) {
      notifications.error(failureMessage('Export', error))
    }
  }, [session, notifications])
}

export function useExportImageAction(context: ProjectActionsContext): () => void {
  const { session, notifications } = context
  return useCallback(() => {
    const project = session.getProject()
    const name = pngPlanFilename(project.meta.name)
    const { content } = new SvgPlanExporter().export(project)
    runExportWithToast(notifications, name, () =>
      rasterizeSvgToPng(content, DEFAULT_RASTER_MAX_EDGE).then((png) => downloadBytes(png, name)),
    )
  }, [session, notifications])
}

export function useExportPdfAction(context: ProjectActionsContext): () => void {
  const { session, notifications } = context
  return useCallback(() => {
    const project = session.getProject()
    const name = pdfPlanFilename(project.meta.name)
    const { content } = new SvgPlanExporter().export(project)
    runExportWithToast(notifications, name, () =>
      svgPlanToPdf(content, { units: project.meta.units, maxEdge: PRINT_RASTER_MAX_EDGE }).then(
        (pdf) => downloadBytes(pdf, name),
      ),
    )
  }, [session, notifications])
}
