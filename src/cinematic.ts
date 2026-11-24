/** One framing of the idle camera around a tracked system. */
export interface Shot {
  /** Angle from galactic north in radians: small values look down on the disk, π/2 looks along it. */
  readonly polar: number
  /** Camera distance as a multiple of the distance at which the camera arrived. */
  readonly distance: number
  /** Orbit speed around the system in radians per second. The sign sets the direction. */
  readonly drift: number
}

/** A slow sequence of angles, opening on the arrival framing, that shows each system from every side. */
export const SHOTS: readonly Shot[] = [
  { polar: 0.99, distance: 1, drift: 0.045 },
  { polar: 0.38, distance: 1.18, drift: 0.03 },
  { polar: 1.5, distance: 0.82, drift: -0.05 },
  { polar: 0.72, distance: 0.64, drift: 0.06 },
  { polar: 1.86, distance: 0.95, drift: -0.04 },
  { polar: 1.18, distance: 1.32, drift: 0.035 },
]

/** How long each shot holds before the camera eases toward the next. */
export const SHOT_SECONDS = 14
/** After the viewer moves the camera, how long it stays still before the shots resume. */
export const IDLE_SECONDS = 9
/** How quickly the camera settles into a new shot, per second. */
export const SETTLE_RATE = 0.28

export function shotAt(time: number): Shot {
  const index = Math.floor(time / SHOT_SECONDS) % SHOTS.length
  return SHOTS[(index + SHOTS.length) % SHOTS.length]
}

/** Moves `current` toward `target` with an exponential ease that does not depend on the frame rate. */
export function approach(current: number, target: number, rate: number, delta: number): number {
  return target + (current - target) * Math.exp(-rate * delta)
}

/** Quintic ease that starts and ends with zero velocity and acceleration. */
export function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}
