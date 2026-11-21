import { useState, type ReactElement } from 'react'
import { createNewProject, openRecent, type SessionPorts, type SwitchFailure } from '../session'
import { ThemeProvider, ToastRegion } from '../editor/design-system'
import { ProjectsPage, type OpenProjectLink } from '../editor/projects'
import type { AssetCache } from '../storage'
import { addressFor } from './address'
import { createInitialProject } from './create-initial-project'
import { pageNoticeText } from './page-notice-text'
import type { PageNotice, PageScreen } from './resolve-place'
import type { HistoryNavigation } from './use-history-navigation'
import type { Flow } from './use-open-project'
import { usePageActions } from './use-page-actions'
import { requestedDesignLanguage } from './url-seams'
import { useProjectCards } from './use-project-cards'

export interface ProjectsScreenProps {
  readonly navigation: HistoryNavigation
  readonly screen: PageScreen
  readonly ports: SessionPorts | null
  /** The library whose packs supply assets, for an import. */
  readonly libraryAssets?: AssetCache | null
}

/**
 * The notice of a try from the page. It stands while the screen shows the failure that it replaced
 * or its own failure; a newer failure of the screen replaces it.
 */
interface TriedNotice {
  readonly replacedFailure: SwitchFailure | undefined
  readonly notice: PageNotice | undefined
}

/** The one notice to show: the latest try's while it stands, else the screen's. */
function shownNotice(
  screenNotice: PageNotice | undefined,
  tried: TriedNotice | null,
): PageNotice | undefined {
  if (tried === null) {
    return screenNotice
  }
  const shown = screenNotice?.failure
  const stands = shown === tried.replacedFailure || shown === tried.notice?.failure
  return stands ? tried.notice : screenNotice
}

function hrefFor(id: string): string {
  return addressFor({ kind: 'project', id })
}

function openProjectLink(navigation: HistoryNavigation): OpenProjectLink | undefined {
  const { handle } = navigation
  if (handle === null) {
    return undefined
  }
  return { name: handle.session.getProject().meta.name, onBack: navigation.leavePage }
}

/** What a try from the page needs: the navigation, the screen it starts on, and the cards' reader. */
interface PageTries {
  readonly navigation: HistoryNavigation
  readonly screen: PageScreen
  readonly refresh: () => void
}

/** The notice of the page, and the tries of the page that open a project in place of the page. */
function usePageTries({ navigation, screen, refresh }: PageTries) {
  const [tried, setTried] = useState<TriedNotice | null>(null)
  // The notice clears while the try runs. A try that gives a project leaves the page, and a try
  // that is refused because another runs changed nothing, so only a try that fails sets the notice
  // again and reads the cards again.
  const runTry = (id: string, flow: Flow) => {
    const replacedFailure = screen.notice?.failure
    setTried({ replacedFailure, notice: undefined })
    void navigation.runPageFlow(flow).then((result) => {
      if (result === undefined || result.ok) {
        return
      }
      setTried({ replacedFailure, notice: { id, failure: result.failure } })
      refresh()
    })
  }
  const openId = navigation.handle?.id
  const onOpen = (id: string) => {
    if (id === openId) {
      navigation.leavePage()
      return
    }
    runTry(id, (ports, current) => openRecent(ports, current, id))
  }
  const newProject: Flow = (ports, current) =>
    createNewProject(ports, current, createInitialProject)
  const onNewProject =
    openId === undefined ? navigation.startFresh : () => runTry(openId, newProject)
  return { notice: shownNotice(screen.notice, tried), onOpen, onNewProject }
}

/**
 * The Projects page in the application: the stored projects, a click that opens each, and the
 * actions that start, import, or open a project.
 */
export function ProjectsScreen(props: ProjectsScreenProps): ReactElement {
  const { navigation, screen, ports, libraryAssets } = props
  const { cards, refresh } = useProjectCards(ports, navigation.handle?.id)
  const tries = usePageTries({ navigation, screen, refresh })
  const actions = usePageActions({ navigation, ports, libraryAssets })
  const openProject = openProjectLink(navigation)
  const notice = pageNoticeText(tries.notice, cards)
  return (
    <ThemeProvider designLanguage={requestedDesignLanguage()}>
      <ProjectsPage
        cards={cards}
        hrefFor={hrefFor}
        onOpen={tries.onOpen}
        onNewProject={tries.onNewProject}
        {...actions}
        {...(openProject === undefined ? {} : { openProject })}
        {...(notice === undefined ? {} : { notice })}
      />
      <ToastRegion />
    </ThemeProvider>
  )
}
