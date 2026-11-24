import { sampleGalacticOrbit, type GalacticOrbit } from './galactic-orbit'

export interface Encounter {
  /** Simulation time of the closest approach, in seconds from the year 2000. */
  time: number
  /** Separation at that moment, in scene units. */
  distance: number
}

/** Seconds searched either side of today, about four million years. Measured motions cannot be trusted much farther. */
export const ENCOUNTER_WINDOW = 3
// About 5,400 years, far shorter than any of these stars takes to pass the Sun.
const SCAN_STEP = 0.004
const REFINE_STEPS = 48
const GOLDEN = (Math.sqrt(5) - 1) / 2

function point() {
  const value = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { value.x = x; value.y = y; value.z = z } }
  return value
}

/** When two orbits bring their stars closest together between two simulation times, and how close. */
export function closestApproach(a: GalacticOrbit, b: GalacticOrbit, from = -ENCOUNTER_WINDOW, to = ENCOUNTER_WINDOW): Encounter {
  if (!(to > from)) throw new RangeError(`Expected a search window that runs forward, got ${from} to ${to}`)
  const first = point()
  const second = point()
  const separation = (time: number) => {
    sampleGalacticOrbit(a, time, first)
    sampleGalacticOrbit(b, time, second)
    return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z)
  }

  // A pass is a single dip in the separation, so a coarse scan brackets it and a golden-section search pins it down.
  const steps = Math.ceil((to - from) / SCAN_STEP)
  const times = Array.from({ length: steps + 1 }, (_, index) => Math.min(to, from + index * SCAN_STEP))
  const nearest = times.reduce((best, time) => {
    const distance = separation(time)
    return distance < best.distance ? { time, distance } : best
  }, { time: from, distance: Infinity })

  let low = Math.max(from, nearest.time - SCAN_STEP)
  let high = Math.min(to, nearest.time + SCAN_STEP)
  for (let step = 0; step < REFINE_STEPS; step++) {
    const left = high - GOLDEN * (high - low)
    const right = low + GOLDEN * (high - low)
    if (separation(left) < separation(right)) high = right
    else low = left
  }
  const time = (low + high) / 2
  return { time, distance: separation(time) }
}
