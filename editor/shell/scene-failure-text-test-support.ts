// The visible and announced text of the 3D pane failure views, stated once for the tests and
// stories that check it. Production code owns its own copy; these literals pin it down.
export const LOAD_TITLE = 'Could not load the 3D view'
export const LOAD_DESCRIPTION =
  'Check your network connection, then reload the page. After the reload, open the 3D view again.'
export const START_TITLE = 'This browser cannot render the 3D view'
export const START_DESCRIPTION = 'Your plan and the 2D editor are unaffected.'

export const LOAD_ANNOUNCEMENT = `${LOAD_TITLE}. ${LOAD_DESCRIPTION}`
export const START_ANNOUNCEMENT = `${START_TITLE}. ${START_DESCRIPTION}`

export const TITLE_FOR_KIND = { load: LOAD_TITLE, start: START_TITLE } as const
