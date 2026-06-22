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
import { humanMessage, type NotificationApi } from '../editor/design-system'
import type { ProjectActionsContext } from './use-project-actions'

// Wrap an async export in a promise toast: an indeterminate pending toast while it runs, a success
// toast naming the file, or an error toast whose Retry re-runs the export.
function runExportWithToast(
  notifications: NotificationApi,
  name: string,
  run: () => Promise<unknown>,
): void {
  const attempt = (): void => {
    void notifications.promise(run(), {
      pending: `Exporting ${name}...`,
      success: () => `Exported ${name}`,
      error: (error) => ({
        message: `Export failed: ${humanMessage(error)}`,
        actions: [{ label: 'Retry', onAction: attempt }],
      }),
    })
  }
  attempt()
}

export function useExportBundleAction(context: ProjectActionsContext): () => void {
  const { session, projectId, assets, notifications } = context
  return useCallback(() => {
    const project = session.getProject()
    const name = bundleFilename(project.meta.name)
    runExportWithToast(notifications, name, () =>
      exportProjectBundle(projectId, project, assets).then((bytes) => downloadBytes(bytes, name)),
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
      notifications.error(`Export failed: ${humanMessage(error)}`)
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
