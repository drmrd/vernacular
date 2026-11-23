export const SCENE_FAILURE_COPY = {
  load: {
    title: 'Could not load the 3D view',
    description:
      'Check your network connection, then reload the page. After the reload, open the 3D view again.',
  },
  start: {
    title: 'This browser cannot render the 3D view',
    description: 'Your plan and the 2D editor are unaffected.',
  },
} as const
