// Physical constants, unit conversions, and reference-frame rotations shared by the model.

export type Vec3 = readonly [number, number, number]

export const TAU = 2 * Math.PI
export const RAD = Math.PI / 180

// Reid et al. (2019): distance to the Galactic Center and circular speed at the Sun.
export const SOLAR_RADIUS_KPC = 8.15
export const CIRCULAR_SPEED_KMS = 236
// Bennett & Bovy (2019): the Sun sits slightly north of the mid-plane.
export const SOLAR_HEIGHT_KPC = 0.0208
// Schönrich, Binney & Dehnen (2010): solar motion relative to the Local Standard of Rest,
// as (toward the Galactic Center, along rotation, toward the north Galactic pole).
export const SOLAR_PECULIAR_KMS: Vec3 = [11.1, 12.24, 7.25]
// Binney & Tremaine (2008), Table 1.2: vertical oscillation frequency near the Sun.
export const VERTICAL_FREQUENCY = 70
// Dias et al. (2019) for the spiral pattern, Portail et al. (2017) for the bar. Both in km/s/kpc.
export const SPIRAL_PATTERN_SPEED = 28.2
export const BAR_PATTERN_SPEED = 39

export const LY_PER_KPC = 3261.5638
const MYR_PER_KPC_PER_KMS = 977.7922

// Scene scale: the Sun starts 132 units from the center and a circular orbit moves 5.3 units per second.
export const SOLAR_AZIMUTH = 5.8
export const UNITS_PER_KPC = 132 / SOLAR_RADIUS_KPC
export const GALACTIC_SPEED = 5.3
export const UNITS_PER_KMS = GALACTIC_SPEED / CIRCULAR_SPEED_KMS
/** Converts an angular frequency in km/s/kpc to radians per simulation second. */
export const FREQUENCY_SCALE = UNITS_PER_KMS / UNITS_PER_KPC
export const MYR_PER_SECOND = FREQUENCY_SCALE * MYR_PER_KPC_PER_KMS
export const LY_PER_UNIT = LY_PER_KPC / UNITS_PER_KPC

// IAU Galactic frame expressed in ICRS (J2000). Rows: toward the center, along rotation, north pole.
const EQUATORIAL_TO_GALACTIC: readonly Vec3[] = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
]
const OBLIQUITY = 23.4392911 * RAD

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const scale = (a: Vec3, factor: number): Vec3 => [a[0] * factor, a[1] * factor, a[2] * factor]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2])
  return length > 0 ? scale(a, 1 / length) : a
}

/** Unit vector for a longitude and latitude in degrees, in whichever frame they are measured. */
export function sphericalDirection(longitude: number, latitude: number): Vec3 {
  const cosLatitude = Math.cos(latitude * RAD)
  return [Math.cos(longitude * RAD) * cosLatitude, Math.sin(longitude * RAD) * cosLatitude, Math.sin(latitude * RAD)]
}

export function equatorialToGalactic(v: Vec3): Vec3 {
  return [dot(EQUATORIAL_TO_GALACTIC[0], v), dot(EQUATORIAL_TO_GALACTIC[1], v), dot(EQUATORIAL_TO_GALACTIC[2], v)]
}

export function eclipticToEquatorial(v: Vec3): Vec3 {
  const cos = Math.cos(OBLIQUITY)
  const sin = Math.sin(OBLIQUITY)
  return [v[0], v[1] * cos - v[2] * sin, v[1] * sin + v[2] * cos]
}

/**
 * Rotates a Galactic vector (center, rotation, north) into scene axes. The scene keeps the disk in XZ
 * with +Y toward Galactic north, and the Sun starts at SOLAR_AZIMUTH.
 */
export function galacticToScene([center, rotation, north]: Vec3): Vec3 {
  const cos = Math.cos(SOLAR_AZIMUTH)
  const sin = Math.sin(SOLAR_AZIMUTH)
  return [-cos * center - sin * rotation, north, -sin * center + cos * rotation]
}

export const equatorialToScene = (v: Vec3): Vec3 => galacticToScene(equatorialToGalactic(v))
export const eclipticToScene = (v: Vec3): Vec3 => equatorialToScene(eclipticToEquatorial(v))

export function galacticCoordinates(ra: number, dec: number): { l: number, b: number } {
  const [center, rotation, north] = equatorialToGalactic(sphericalDirection(ra, dec))
  return {
    l: (Math.atan2(rotation, center) / RAD + 360) % 360,
    b: Math.asin(Math.min(1, Math.max(-1, north))) / RAD,
  }
}

/** Local sky axes at a position: celestial north, east, and the line of sight away from the Sun. */
export function skyAxes(ra: number, dec: number): { north: Vec3, east: Vec3, away: Vec3 } {
  const a = ra * RAD
  const d = dec * RAD
  return {
    north: [-Math.cos(a) * Math.sin(d), -Math.sin(a) * Math.sin(d), Math.cos(d)],
    east: [-Math.sin(a), Math.cos(a), 0],
    away: sphericalDirection(ra, dec),
  }
}

/**
 * Periapsis direction P and the in-plane direction Q a quarter turn ahead of it, from the classical
 * angles (degrees) measured in a reference frame whose z axis is the reference pole.
 */
export function orbitalAxes(inclination: number, node: number, periapsis: number): { p: Vec3, q: Vec3 } {
  const cosI = Math.cos(inclination * RAD)
  const sinI = Math.sin(inclination * RAD)
  const cosN = Math.cos(node * RAD)
  const sinN = Math.sin(node * RAD)
  const cosW = Math.cos(periapsis * RAD)
  const sinW = Math.sin(periapsis * RAD)
  return {
    p: [cosN * cosW - sinN * sinW * cosI, sinN * cosW + cosN * sinW * cosI, sinW * sinI],
    q: [-cosN * sinW - sinN * cosW * cosI, -sinN * sinW + cosN * cosW * cosI, cosW * sinI],
  }
}

/** Newton steps used for Kepler's equation, on the CPU and in the shaders. Ample for e ≤ 0.6. */
export const KEPLER_ITERATIONS = 5

/** Solves Kepler's equation E − e·sin E = M for the eccentric anomaly. */
export function eccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
  const mean = meanAnomaly - TAU * Math.floor(meanAnomaly / TAU)
  let anomaly = mean + eccentricity * Math.sin(mean)
  for (let i = 0; i < KEPLER_ITERATIONS; i++) {
    anomaly -= (anomaly - eccentricity * Math.sin(anomaly) - mean) / (1 - eccentricity * Math.cos(anomaly))
  }
  return anomaly
}

/** sRGB hex color of a black body at the given temperature (kelvin), after Tanner Helland's fit. */
export function blackbodyColor(kelvin: number): string {
  const t = Math.min(400, Math.max(10, kelvin / 100))
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
  return `#${channel(red)}${channel(green)}${channel(blue)}`
}
