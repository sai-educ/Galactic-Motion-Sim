import {
  CIRCULAR_SPEED_KMS, FREQUENCY_SCALE, LY_PER_KPC, RAD, SOLAR_AZIMUTH, SOLAR_HEIGHT_KPC, SOLAR_PECULIAR_KMS,
  SOLAR_RADIUS_KPC, TAU, UNITS_PER_KMS, UNITS_PER_KPC, VERTICAL_FREQUENCY, type Vec3,
} from './astro'

/** Fourier terms kept for each orbit. Eight reproduce even TRAPPIST-1’s stretched orbit to a fraction of a light-year. */
export const HARMONICS = 8

/**
 * A star's path around the Galaxy. Motion in the plane is integrated in a potential with a flat
 * rotation curve, where it repeats exactly: the radius is periodic and the azimuth is a steady
 * advance plus a periodic wobble, so both are stored as Fourier series in the radial phase.
 * Motion through the disk is a separate harmonic oscillation. Lengths are scene units and rates
 * are radians per simulation second.
 */
export interface GalacticOrbit {
  /** Mean radius, then the cosine and sine coefficients of each radial harmonic. */
  meanRadius: number
  radial: number[]
  /** Azimuth at the phase origin, the mean angular rate, and the wobble's coefficients. */
  azimuth: number
  rate: number
  wobble: number[]
  /** Rate at which the radial phase advances. */
  radialRate: number
  height: number
  heightPhase: number
}

export interface Settable {
  set(x: number, y: number, z: number): unknown
}

/** Vertical oscillation frequency in radians per simulation second. */
export const VERTICAL_RATE = VERTICAL_FREQUENCY * FREQUENCY_SCALE

export interface Kinematics {
  /** Galactic longitude and latitude in degrees, and distance from the Sun in light-years. */
  l: number
  b: number
  distance: number
  /** Heliocentric velocity (toward the center, along rotation, toward the north pole) in km/s. */
  velocity: Vec3
}

export const SUN: Kinematics = { l: 0, b: 0, distance: 0, velocity: [0, 0, 0] }

// Integration works in kpc and km/s, which makes the time unit kpc/(km/s), about 978 million years.
const STEP = 2e-5
const SAMPLES = 256
const SUBSTEPS = 16

interface PlanarState {
  radius: number
  radialSpeed: number
  azimuth: number
}

/** One Runge–Kutta step for a star of angular momentum `momentum` in a flat-rotation-curve potential. */
function advance(state: PlanarState, momentum: number, dt: number): PlanarState {
  const pull = (radius: number) => momentum * momentum / radius ** 3 - CIRCULAR_SPEED_KMS ** 2 / radius
  const turn = (radius: number) => momentum / (radius * radius)
  const { radius, radialSpeed, azimuth } = state
  const r2 = radius + radialSpeed * dt / 2
  const v2 = radialSpeed + pull(radius) * dt / 2
  const r3 = radius + v2 * dt / 2
  const v3 = radialSpeed + pull(r2) * dt / 2
  const r4 = radius + v3 * dt
  const v4 = radialSpeed + pull(r3) * dt
  return {
    radius: radius + (radialSpeed + 2 * v2 + 2 * v3 + v4) * dt / 6,
    radialSpeed: radialSpeed + (pull(radius) + 2 * pull(r2) + 2 * pull(r3) + pull(r4)) * dt / 6,
    azimuth: azimuth + (turn(radius) + 2 * turn(r2) + 2 * turn(r3) + turn(r4)) * dt / 6,
  }
}

/** Time between two successive passages through the orbit's outermost point. */
function radialPeriod(start: PlanarState, momentum: number) {
  const crossings: number[] = []
  let state = start
  let time = 0
  const limit = 40 * TAU * start.radius / CIRCULAR_SPEED_KMS
  while (crossings.length < 2 && time < limit) {
    const next = advance(state, momentum, STEP)
    if (state.radialSpeed > 0 && next.radialSpeed <= 0) {
      crossings.push(time + STEP * state.radialSpeed / (state.radialSpeed - next.radialSpeed))
    }
    state = next
    time += STEP
  }
  // A perfectly circular orbit has no outermost point. Its small oscillations have the epicyclic period.
  if (crossings.length < 2) return TAU * start.radius / (Math.SQRT2 * CIRCULAR_SPEED_KMS)
  return crossings[1] - crossings[0]
}

/** Cosine and sine coefficients of the first harmonics of evenly spaced samples of one period. */
function harmonics(samples: number[]) {
  const coefficients: number[] = []
  for (let k = 1; k <= HARMONICS; k++) {
    let cosine = 0
    let sine = 0
    samples.forEach((value, index) => {
      const angle = TAU * k * index / samples.length
      cosine += value * Math.cos(angle)
      sine += value * Math.sin(angle)
    })
    coefficients.push(2 * cosine / samples.length, 2 * sine / samples.length)
  }
  return coefficients
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

export function galacticOrbit({ l, b, distance, velocity }: Kinematics): GalacticOrbit {
  const kpc = distance / LY_PER_KPC
  const cosLatitude = Math.cos(b * RAD)
  const towardCenter = kpc * cosLatitude * Math.cos(l * RAD)
  const alongRotation = kpc * cosLatitude * Math.sin(l * RAD)
  const heightKpc = SOLAR_HEIGHT_KPC + kpc * Math.sin(b * RAD)
  const start: PlanarState = {
    radius: Math.hypot(SOLAR_RADIUS_KPC - towardCenter, alongRotation),
    radialSpeed: -(velocity[0] + SOLAR_PECULIAR_KMS[0]),
    azimuth: SOLAR_AZIMUTH + Math.atan2(alongRotation, SOLAR_RADIUS_KPC - towardCenter),
  }
  const momentum = start.radius * (CIRCULAR_SPEED_KMS + velocity[1] + SOLAR_PECULIAR_KMS[1])
  const period = radialPeriod(start, momentum)

  const radii: number[] = []
  const azimuths: number[] = []
  const dt = period / (SAMPLES * SUBSTEPS)
  let state = start
  for (let sample = 0; sample < SAMPLES; sample++) {
    radii.push(state.radius)
    azimuths.push(state.azimuth)
    for (let step = 0; step < SUBSTEPS; step++) state = advance(state, momentum, dt)
  }
  // After one radial period the radius repeats and the azimuth has advanced by a fixed angle.
  const rate = (state.azimuth - start.azimuth) / period
  const wobble = azimuths.map((azimuth, index) => azimuth - rate * period * index / SAMPLES)
  const climb = (velocity[2] + SOLAR_PECULIAR_KMS[2]) / VERTICAL_FREQUENCY

  return {
    meanRadius: mean(radii) * UNITS_PER_KPC,
    radial: harmonics(radii).map(value => value * UNITS_PER_KPC),
    azimuth: mean(wobble),
    rate: rate * FREQUENCY_SCALE,
    wobble: harmonics(wobble),
    radialRate: TAU / period * FREQUENCY_SCALE,
    height: Math.hypot(heightKpc, climb) * UNITS_PER_KPC,
    heightPhase: Math.atan2(heightKpc, climb),
  }
}

/** Evaluates the same closed-form path as the vertex shader. */
export function sampleGalacticOrbit(orbit: GalacticOrbit, time: number, position: Settable, velocity?: Settable) {
  const phase = orbit.radialRate * time
  let radius = orbit.meanRadius
  let theta = orbit.azimuth + orbit.rate * time
  let radialSpeed = 0
  let turnRate = orbit.rate
  for (let k = 0; k < HARMONICS; k++) {
    const order = k + 1
    const cos = Math.cos(order * phase)
    const sin = Math.sin(order * phase)
    const pace = order * orbit.radialRate
    radius += orbit.radial[2 * k] * cos + orbit.radial[2 * k + 1] * sin
    theta += orbit.wobble[2 * k] * cos + orbit.wobble[2 * k + 1] * sin
    radialSpeed += pace * (orbit.radial[2 * k + 1] * cos - orbit.radial[2 * k] * sin)
    turnRate += pace * (orbit.wobble[2 * k + 1] * cos - orbit.wobble[2 * k] * sin)
  }
  const vertical = VERTICAL_RATE * time + orbit.heightPhase
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  position.set(radius * cos, orbit.height * Math.sin(vertical), radius * sin)
  if (!velocity) return
  const along = radius * turnRate
  velocity.set(radialSpeed * cos - along * sin, orbit.height * VERTICAL_RATE * Math.cos(vertical), radialSpeed * sin + along * cos)
}

/** Converts a scene speed (units per simulation second) back to km/s. */
export const toKms = (sceneSpeed: number) => sceneSpeed / UNITS_PER_KMS
