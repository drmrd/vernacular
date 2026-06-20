import { Button, useMenuButton } from '../design-system'
import './export-menu.css'

interface ExportMenuProps {
  onExportBundle?: (() => void) | undefined
  onExportPlan?: (() => void) | undefined
  onExportImage?: (() => void) | undefined
  onExportPdf?: (() => void) | undefined
}

interface ExportItem {
  label: string
  onSelect: () => void
}

// Build the export targets from the wired handlers, in display order.
function exportMenuItems({
  onExportBundle,
  onExportPlan,
  onExportImage,
  onExportPdf,
}: ExportMenuProps): ExportItem[] {
  const candidates: { label: string; onSelect: (() => void) | undefined }[] = [
    { label: 'Project bundle', onSelect: onExportBundle },
    { label: 'Plan (SVG)', onSelect: onExportPlan },
    { label: 'PNG image', onSelect: onExportImage },
    { label: 'PDF', onSelect: onExportPdf },
  ]
  return candidates.filter(
    (item): item is ExportItem => item.onSelect !== undefined,
  )
}

// The single brass Export control. It collapses the four export targets into one
// dropdown, rendering only the targets whose handler is wired and nothing at all
// when none are.
export function ExportMenu(props: ExportMenuProps) {
  const menu = useMenuButton<HTMLDivElement>()
  const items = exportMenuItems(props)
  if (items.length === 0) {
    return null
  }
  return (
    <div className="export-menu" ref={menu.containerRef}>
      <Button variant="primary" {...menu.triggerProps}>
        Export
        <span aria-hidden="true"> ▾</span>
      </Button>
      {menu.open ? (
        <ul className="export-menu__list" {...menu.menuProps}>
          {items.map((item) => (
            <li key={item.label} role="none">
              <Button
                role="menuitem"
                className="export-menu__row"
                onClick={() => {
                  item.onSelect()
                  menu.close()
                }}
              >
                {item.label}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
