/**
 * The active edit layer scopes which plan elements are selectable. `'all'`
 * leaves every element selectable (today's behavior); a specific layer narrows
 * selection to that layer's elements while the rest stay visible but inert.
 */
export type EditLayer = 'all' | 'walls' | 'openings' | 'furniture' | 'annotations'
