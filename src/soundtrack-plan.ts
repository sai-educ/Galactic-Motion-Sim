/** Which system's theme is audible, and which system the camera is flying to. -1 means none. */
export interface MusicState {
  readonly playing: number
  readonly pending: number
}

export type MusicEvent =
  | { readonly type: 'select', readonly system: number }
  | { readonly type: 'arrive', readonly system: number }

/**
 * - `zoom`: play a swell while the camera flies in from outside the systems.
 * - `theme`: the camera arrived from outside; let the swell ring out and bring in the system's theme.
 * - `crossfade`: the camera arrived from another system; ease the old theme out and the new one in.
 * - `fade-out`: the view left the systems; ease every sound out.
 */
export type MusicAction = 'zoom' | 'theme' | 'crossfade' | 'fade-out'

/** A gain change that eases from one level to another, in AudioContext seconds. */
export interface Fade {
  readonly from: number
  readonly to: number
  readonly start: number
  readonly duration: number
}

export const SILENT: MusicState = { playing: -1, pending: -1 }

/** Picks a random index below `count`, never the `previous` one when another is available. */
export function pickWithoutRepeat(count: number, previous: number, random: () => number = Math.random): number {
  if (!Number.isInteger(count) || count <= 0) throw new RangeError(`Expected a positive track count, got ${count}`)
  if (count === 1) return 0
  const hasPrevious = previous >= 0 && previous < count
  const choices = hasPrevious ? count - 1 : count
  const pick = Math.min(choices - 1, Math.floor(random() * choices))
  return hasPrevious && pick >= previous ? pick + 1 : pick
}

/** Sine ease-in-out: starts and ends gently. */
export function easeInOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return (1 - Math.cos(Math.PI * clamped)) / 2
}

export function levelAt(fade: Fade, time: number): number {
  if (fade.duration <= 0) return fade.to
  return fade.from + (fade.to - fade.from) * easeInOut((time - fade.start) / fade.duration)
}

/** Decides what the music does when a system is chosen or the camera reaches it. */
export function reduceMusic(state: MusicState, event: MusicEvent): { state: MusicState, actions: MusicAction[] } {
  if (event.type === 'select') return select(state, event.system)
  if (event.system !== state.pending) return { state, actions: [] }
  const next = { playing: event.system, pending: -1 }
  if (state.playing === event.system) return { state: next, actions: [] }
  return { state: next, actions: [state.playing < 0 ? 'theme' : 'crossfade'] }
}

function select(state: MusicState, system: number): { state: MusicState, actions: MusicAction[] } {
  if (system < 0) {
    const audible = state.playing >= 0 || state.pending >= 0
    return { state: SILENT, actions: audible ? ['fade-out'] : [] }
  }
  if (system === state.playing) return { state: { ...state, pending: -1 }, actions: [] }
  // A theme or a swell is already sounding, so the music carries on until the camera arrives.
  if (state.playing >= 0 || state.pending >= 0) return { state: { ...state, pending: system }, actions: [] }
  return { state: { ...state, pending: system }, actions: ['zoom'] }
}
