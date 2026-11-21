import { useCallback } from 'react'
import { SvgPlanExporter } from '../core'
import { exportArchive } from '../session'
import {
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
import { exportMissingAssetsText } from './asset-report-text'
import { failureMessage } from './failure-message'
import { loadPackSupplies } from './pack-supplies'
import type { ProjectActionsContext } from './use-project-actions'

/** A no-op reporter used until the toast hands back its real one synchronously. */
const NO_PROGRESS = (): void => {}

/** Map completed-of-total counts to a fraction in [0, 1], treating zero work as no progress. */
function progressFraction(completed: number, total: number): number {
  return total === 0 ? 0 : completed / total
}

/**
 * Wrap an async export in a promise toast: a pending toast while it runs, a success toast naming
 * the file (the name that `run` resolves with, else `name`), or an error toast whose Retry re-runs
 * the export. The toast starts indeterminate and becomes a determinate bar once `run` reports
 * progress through its `onProgress` argument.
 */
export function runExportWithToast(
  notifications: NotificationApi,
  name: string,
  run: (onProgress: (completed: number, total: number) => void) => Promise<string | void>,
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
        success: (made) => `Exported ${made ?? name}`,
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

// The archive export stores a pending change first, so the archive holds the last edit. It reads
// the open project of the latest render.
export function useExportBundleAction(context: ProjectActionsContext): () => void {
  const { handle, notifications, packs } = context
  return useCallback(() => {
    const name = bundleFilename(handle.session.getProject().meta.name)
    runExportWithToast(notifications, name, async (onProgress) => {
      const packSupplies = await loadPackSupplies(packs)
      const result = await exportArchive(handle, {
        onProgress,
        ...(packSupplies === undefined ? {} : { packSupplies }),
      })
      if (!result.ok) {
        throw new Error(result.message)
      }
      downloadBytes(result.bytes, result.fileName)
      if (result.missingAssets.length > 0) {
        notifications.warning(exportMissingAssetsText(result.missingAssets.length))
      }
    })
  }, [handle, notifications, packs])
}

export function useExportPlanAction(context: ProjectActionsContext): () => void {
  const { handle, notifications } = context
  return useCallback(() => {
    const project = handle.session.getProject()
    const name = svgPlanFilename(project.meta.name)
    try {
      const { content } = new SvgPlanExporter().export(project)
      downloadText(content, name, 'image/svg+xml')
      notifications.success(`Exported ${name}`)
    } catch (error) {
      notifications.error(failureMessage('Export', error))
    }
  }, [handle, notifications])
}

export function useExportImageAction(context: ProjectActionsContext): () => void {
  const { handle, notifications } = context
  return useCallback(() => {
    const project = handle.session.getProject()
    const name = pngPlanFilename(project.meta.name)
    const { content } = new SvgPlanExporter().export(project)
    runExportWithToast(notifications, name, () =>
      rasterizeSvgToPng(content, DEFAULT_RASTER_MAX_EDGE).then((png) => downloadBytes(png, name)),
    )
  }, [handle, notifications])
}

export function useExportPdfAction(context: ProjectActionsContext): () => void {
  const { handle, notifications } = context
  return useCallback(() => {
    const project = handle.session.getProject()
    const name = pdfPlanFilename(project.meta.name)
    const { content } = new SvgPlanExporter().export(project)
    runExportWithToast(notifications, name, () =>
      svgPlanToPdf(content, { units: project.meta.units, maxEdge: PRINT_RASTER_MAX_EDGE }).then(
        (pdf) => downloadBytes(pdf, name),
      ),
    )
  }, [handle, notifications])
}
