import {
  blackbodyColor, cross, eccentricAnomaly, eclipticToScene, equatorialToScene, galacticToScene, LY_PER_UNIT, normalize,
  orbitalAxes, RAD, scale, skyAxes, sphericalDirection, TAU, add, type Vec3,
} from './astro'
import { kinematics } from './astrometry'
import { closestApproach, type Encounter } from './encounters'
import {
  galacticOrbit, radialRange, sampleGalacticOrbit, SUN, type GalacticOrbit, type Settable,
} from './galactic-orbit'
import { neighborStars, type NeighborGroup, type NeighborStar } from './neighbors'
import { formatLightYears, formatWhen } from './timeline'

/** A Keplerian ellipse about the system's center of mass, oriented in scene axes. */
export interface LocalOrbit {
  radius: number
  rate: number
  phase: number
  eccentricity: number
  /** Unit vectors toward periapsis and a quarter turn ahead of it. */
  p: Vec3
  q: Vec3
}

export type Surface = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'rocky'
export const SURFACES: Surface[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'rocky']

export interface Body {
  name: string
  color: string
  size: number
  glow: number
  orbit: LocalOrbit
  outer?: LocalOrbit
  surface?: Surface
  spin?: number
  spinAxis?: Vec3
}

export interface Fact {
  label: string
  value: string
}

export interface System {
  id: string
  name: string
  kind: string
  description: string
  color: string
  /** Color of the light that falls on the system's planets. */
  light: string
  path: GalacticOrbit
  viewDistance: number
  facts: Fact[]
  bodies: Body[]
  /** Set on the neighboring stars, which are drawn quietly and listed apart from the featured systems. */
  neighbor?: { group: NeighborGroup, encounter: Encounter }
}

const AXIS: Vec3 = [1, 0, 0]
export const EMPTY_ORBIT: LocalOrbit = { radius: 0, rate: 0, phase: 0, eccentricity: 0, p: AXIS, q: AXIS }

function star(name: string, kelvin: number, size: number, glow: number, orbit = EMPTY_ORBIT, outer?: LocalOrbit): Body {
  return { name, color: blackbodyColor(kelvin), size, glow, orbit, outer }
}

const opposite = (orbit: LocalOrbit, radius: number): LocalOrbit =>
  ({ ...orbit, radius, p: scale(orbit.p, -1), q: scale(orbit.q, -1) })

// ── Solar System ──────────────────────────────────────────────────────────────────────────────
// JPL approximate elements at J2000 (Standish): eccentricity, inclination, mean longitude,
// longitude of perihelion, and longitude of the ascending node, all relative to the ecliptic.
// North poles are the IAU directions (right ascension, declination). Venus and Uranus spin backwards.
const EARTH_PERIOD = 3.6
const EARTH_RADIUS = 3
const planets = [
  { name: 'Mercury', color: '#a9a29b', size: 5.2, radius: 1.4, e: 0.2056, i: 7.005, L: 252.250, peri: 77.458, node: 48.331,
    pole: [281.01, 61.41], spin: 0.35, surface: 'mercury' },
  { name: 'Venus', color: '#ecd9ad', size: 6.9, radius: 2.1, e: 0.0068, i: 3.395, L: 181.979, peri: 131.602, node: 76.680,
    pole: [272.76, 67.16], spin: -0.2, surface: 'venus' },
  { name: 'Earth', color: '#5b9cf0', size: 7.2, radius: EARTH_RADIUS, e: 0.0167, i: 0, L: 100.465, peri: 102.938, node: 0,
    pole: [0, 90], spin: 1.7, surface: 'earth' },
  { name: 'Mars', color: '#e2714f', size: 6.1, radius: 3.9, e: 0.0934, i: 1.850, L: -4.553, peri: -23.944, node: 49.560,
    pole: [317.68, 52.89], spin: 1.65, surface: 'mars' },
  { name: 'Jupiter', color: '#e0b98f', size: 11, radius: 5.5, e: 0.0484, i: 1.304, L: 34.396, peri: 14.728, node: 100.474,
    pole: [268.06, 64.50], spin: 2.9, surface: 'jupiter' },
  { name: 'Saturn', color: '#ecd9a4', size: 10, radius: 7.0, e: 0.0539, i: 2.486, L: 49.954, peri: 92.599, node: 113.662,
    pole: [40.59, 83.54], spin: 2.7, surface: 'saturn' },
  { name: 'Uranus', color: '#a8e6ea', size: 8.2, radius: 8.5, e: 0.0473, i: 0.773, L: 313.238, peri: 170.954, node: 74.017,
    pole: [257.31, -15.18], spin: -2.1, surface: 'uranus' },
  { name: 'Neptune', color: '#6f95f2', size: 8.1, radius: 10.0, e: 0.0086, i: 1.770, L: -55.120, peri: 44.965, node: 131.784,
    pole: [299.36, 43.46], spin: 2.2, surface: 'neptune' },
] as const

const solarBodies: Body[] = [
  star('The Sun', 5772, 18, 3.4),
  ...planets.map((planet): Body => {
    const axes = orbitalAxes(planet.i, planet.node, planet.peri - planet.node)
    const pole = equatorialToScene(sphericalDirection(planet.pole[0], planet.pole[1]))
    return {
      name: planet.name, color: planet.color, size: planet.size, glow: 1.25, surface: planet.surface,
      // The radii are compressed, so the periods follow Kepler's third law for the drawn spacing.
      orbit: {
        radius: planet.radius, rate: TAU / (EARTH_PERIOD * (planet.radius / EARTH_RADIUS) ** 1.5),
        phase: (planet.L - planet.peri) * RAD, eccentricity: planet.e,
        p: eclipticToScene(axes.p), q: eclipticToScene(axes.q),
      },
      spin: Math.abs(planet.spin), spinAxis: scale(pole, Math.sign(planet.spin)),
    }
  }),
]

// ── Binary stars ──────────────────────────────────────────────────────────────────────────────
// Visual-binary angles are measured on the plane of the sky: x toward celestial north, y toward
// east, z away from the Sun. Binary motion is drawn at one second per decade.
const SECONDS_PER_YEAR = 0.1

function skyOrbit(ra: number, dec: number, inclination: number, node: number, periapsis: number) {
  const { north, east, away } = skyAxes(ra, dec)
  const toScene = (v: Vec3) => equatorialToScene(add(add(scale(north, v[0]), scale(east, v[1])), scale(away, v[2])))
  const axes = orbitalAxes(inclination, node, periapsis)
  return { p: toScene(axes.p), q: toScene(axes.q) }
}

interface Binary {
  ra: number
  dec: number
  years: number
  periastron: number
  eccentricity: number
  inclination: number
  node: number
  periapsis: number
  masses: [number, number]
  /** Drawn semi-major axis of the secondary's orbit around the primary. */
  separation: number
}

/** Orbits of both stars about their center of mass. Each radius is set by the other star's mass. */
function binaryOrbits(binary: Binary): [LocalOrbit, LocalOrbit] {
  const [primaryMass, secondaryMass] = binary.masses
  const total = primaryMass + secondaryMass
  const secondary: LocalOrbit = {
    radius: binary.separation * primaryMass / total,
    rate: TAU / (binary.years * SECONDS_PER_YEAR),
    phase: TAU * (2000 - binary.periastron) / binary.years,
    eccentricity: binary.eccentricity,
    ...skyOrbit(binary.ra, binary.dec, binary.inclination, binary.node, binary.periapsis),
  }
  return [opposite(secondary, binary.separation * secondaryMass / total), secondary]
}

// Akeson et al. (2021) for the A–B orbit and masses.
const ALPHA_AB: Binary = {
  ra: 219.9, dec: -60.83, years: 79.762, periastron: 1955.564, eccentricity: 0.5195,
  inclination: 79.243, node: 205.073, periapsis: 231.519, masses: [1.0788, 0.9092], separation: 5.4,
}
// Bond et al. (2017).
const SIRIUS_AB: Binary = {
  ra: 101.2872, dec: -16.7161, years: 50.1284, periastron: 1994.5715, eccentricity: 0.5914,
  inclination: 136.336, node: 45.4, periapsis: 149.161, masses: [2.063, 1.018], separation: 8.4,
}

// Kervella et al. (2017): Proxima's offset (pc) and velocity (km/s) from the A–B pair in Galactic
// axes, with a = 8,700 au, e = 0.50, a 547,000-year period, and periastron 283,000 years from now.
function proximaOrbits(): { proxima: LocalOrbit, pair: LocalOrbit } {
  const offset: Vec3 = [-0.05622, -0.00198, -0.02785]
  const velocity: Vec3 = [-0.099, 0.173, 0.187]
  const eccentricity = 0.5
  const pairMass = ALPHA_AB.masses[0] + ALPHA_AB.masses[1]
  const total = pairMass + 0.1221
  const separation = 10
  const meanAnomaly = -TAU * 283 / 547
  const anomaly = eccentricAnomaly(meanAnomaly, eccentricity)
  const trueAnomaly = Math.atan2(Math.sqrt(1 - eccentricity ** 2) * Math.sin(anomaly), Math.cos(anomaly) - eccentricity)
  const normal = normalize(cross(offset, velocity))
  const toward = normalize(offset)
  const ahead = cross(normal, toward)
  // Step back along the orbit from Proxima's present direction to its periastron direction.
  const p = add(scale(toward, Math.cos(trueAnomaly)), scale(ahead, -Math.sin(trueAnomaly)))
  const proxima: LocalOrbit = {
    radius: separation * pairMass / total,
    // Kepler's third law for the drawn separations keeps the outer orbit slower than the inner pair.
    rate: TAU / (ALPHA_AB.years * SECONDS_PER_YEAR)
      * Math.sqrt(total / pairMass * (ALPHA_AB.separation / separation) ** 3),
    phase: meanAnomaly, eccentricity,
    p: galacticToScene(p), q: galacticToScene(cross(normal, p)),
  }
  return { proxima, pair: opposite(proxima, separation * 0.1221 / total) }
}

const [alphaA, alphaB] = binaryOrbits(ALPHA_AB)
const { proxima, pair } = proximaOrbits()
const [siriusA, siriusB] = binaryOrbits(SIRIUS_AB)

// ── TRAPPIST-1 ────────────────────────────────────────────────────────────────────────────────
// Agol et al. (2021): periods in days, semi-major axes in hundredths of an au, radii in Earth radii.
// The orbits are drawn to scale with one another and nearly edge-on to the Sun. The position angle
// of the orbital plane on the sky has not been measured, and the planets' colors are for identification.
const TRAPPIST = { ra: 346.6223, dec: -5.0414, secondsPerDay: 0.57, unitsPerAxis: 1.7 / 1.154 }
const trappistPlanets = [
  { letter: 'b', days: 1.510826, axis: 1.154, radius: 1.116, color: '#ff9f8a' },
  { letter: 'c', days: 2.421937, axis: 1.580, radius: 1.097, color: '#ffc27a' },
  { letter: 'd', days: 4.049219, axis: 2.227, radius: 0.788, color: '#f2e089' },
  { letter: 'e', days: 6.101013, axis: 2.925, radius: 0.920, color: '#9fe3a2' },
  { letter: 'f', days: 9.207540, axis: 3.849, radius: 1.045, color: '#7fd6e6' },
  { letter: 'g', days: 12.352446, axis: 4.683, radius: 1.129, color: '#8fb0ff' },
  { letter: 'h', days: 18.772866, axis: 6.189, radius: 0.755, color: '#c7a6ff' },
]
const trappistPlane = skyOrbit(TRAPPIST.ra, TRAPPIST.dec, 89.8, 0, 0)
const trappistPole = normalize(cross(trappistPlane.p, trappistPlane.q))

// ── Neighboring stars ─────────────────────────────────────────────────────────────────────────
const SOLAR_PATH = galacticOrbit(SUN)
const NEIGHBOR_VIEW_DISTANCE = 34
const NEIGHBOR_GLOW = 2.4
const kelvinFormat = new Intl.NumberFormat('en-US')

function neighborSystem(entry: NeighborStar): System {
  const measured = kinematics(entry.astrometry)
  const path = galacticOrbit(measured)
  const encounter = closestApproach(path, SOLAR_PATH)
  const { inner, outer } = radialRange(path)
  const color = blackbodyColor(entry.kelvin)
  return {
    id: entry.id, name: entry.name, kind: entry.type,
    description: entry.story, color, light: color, path, viewDistance: NEIGHBOR_VIEW_DISTANCE,
    facts: [
      { label: 'Star', value: `${entry.spectralType} · about ${kelvinFormat.format(entry.kelvin)} K` },
      { label: 'Speed past the Sun', value: `${Math.round(Math.hypot(...measured.velocity))} km/s` },
      { label: 'Distance from the center',
        value: `${formatLightYears(inner * LY_PER_UNIT).replace(' ly', '')} to ${formatLightYears(outer * LY_PER_UNIT)}` },
      { label: 'Closest to the Sun',
        value: `${formatLightYears(encounter.distance * LY_PER_UNIT)} · ${formatWhen(encounter.time)}` },
    ],
    bodies: [star(entry.name, entry.kelvin, entry.size, NEIGHBOR_GLOW)],
    neighbor: { group: entry.group, encounter },
  }
}

export const systems: System[] = [
  {
    id: 'sol', name: 'Solar System', kind: '1 star · 8 planets',
    description: 'Eight planets circle the Sun on a plane tipped 60° to the Galaxy’s disk, so their paths wind into helices.',
    color: '#ffe2ae', light: blackbodyColor(5772), path: SOLAR_PATH, viewDistance: 47,
    facts: [
      { label: 'Star', value: 'G2V · 5,772 K' },
      { label: 'One lap of the Galaxy', value: '≈ 220 million years' },
      { label: 'Planets shown', value: 'J2000 positions' },
    ],
    bodies: solarBodies,
  },
  {
    id: 'alpha', name: 'Alpha Centauri', kind: 'Triple star system',
    description: 'Two Sun-like stars swing around each other every 80 years while the red dwarf Proxima circles them both.',
    color: '#ffc98f', light: blackbodyColor(5790), viewDistance: 50,
    path: galacticOrbit({ l: 315.73, b: -0.68, distance: 4.344, velocity: [-29.3, 1.7, 13.6] }),
    facts: [
      { label: 'Stars', value: 'G2V · K1V · M5.5V' },
      { label: 'A–B orbit', value: '79.8 years · e 0.52' },
      { label: 'Proxima’s orbit', value: '≈ 547,000 years' },
    ],
    bodies: [
      star('Alpha Centauri A', 5790, 19, 3.2, alphaA, pair),
      star('Alpha Centauri B', 5260, 15.5, 2.9, alphaB, pair),
      star('Proxima Centauri', 3000, 8.5, 2, proxima),
    ],
  },
  {
    id: 'sirius', name: 'Sirius', kind: 'Binary star system',
    description: 'The brightest star in Earth’s night sky and its white-dwarf companion trace a stretched 50-year orbit.',
    color: '#a9c8ff', light: blackbodyColor(9940), viewDistance: 43,
    path: galacticOrbit({ l: 227.23, b: -8.89, distance: 8.60, velocity: [14.4, -0.3, -11.5] }),
    facts: [
      { label: 'Sirius A', value: 'A1V · 9,940 K' },
      { label: 'Sirius B', value: 'White dwarf · 25,000 K' },
      { label: 'Orbit', value: '50.1 years · e 0.59' },
    ],
    bodies: [
      star('Sirius A', 9940, 21, 4, siriusA),
      star('Sirius B', 25000, 7, 2.6, siriusB),
    ],
  },
  {
    id: 'trappist', name: 'TRAPPIST-1', kind: '1 star · 7 planets',
    description: 'Seven Earth-sized planets orbit a dim red dwarf in a resonant chain, all closer in than Mercury is to the Sun.',
    color: '#ffab6b', light: blackbodyColor(2566), viewDistance: 42,
    path: galacticOrbit({ l: 69.71, b: -56.64, distance: 40.66, velocity: [-44.0, -66.7, 10.7] }),
    facts: [
      { label: 'Star', value: 'M8V · 2,566 K' },
      { label: 'Planet years', value: '1.5 to 18.8 days' },
      { label: 'Speed past the Sun', value: '81 km/s' },
    ],
    bodies: [
      star('TRAPPIST-1', 2566, 9, 2.7),
      ...trappistPlanets.map((planet, index): Body => {
        const rate = TAU / (planet.days * TRAPPIST.secondsPerDay)
        return {
          name: `TRAPPIST-1 ${planet.letter}`, color: planet.color, size: 5 * planet.radius, glow: 1.25,
          orbit: { radius: planet.axis * TRAPPIST.unitsPerAxis, rate, phase: index * 1.54, eccentricity: 0, ...trappistPlane },
          // Planets this close to their star are expected to keep one face toward it.
          surface: 'rocky', spin: rate, spinAxis: trappistPole,
        }
      }),
    ],
  },
  ...neighborStars.map(neighborSystem),
]

export function randomSequence(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 0x100000000
  }
}

/** Center of mass of a system. The camera, labels, and GPU all evaluate this same path. */
export function sampleSystem(system: System, time: number, position: Settable, velocity?: Settable) {
  sampleGalacticOrbit(system.path, time, position, velocity)
}

/** Offset of a body from its system's center of mass, in scene axes. */
export function bodyOffset(body: Body, time: number): Vec3 {
  const inner = orbitOffset(body.orbit, time)
  return body.outer ? add(inner, orbitOffset(body.outer, time)) : inner
}

export function orbitOffset(orbit: LocalOrbit, time: number): Vec3 {
  if (orbit.radius === 0) return [0, 0, 0]
  const anomaly = eccentricAnomaly(orbit.rate * time + orbit.phase, orbit.eccentricity)
  const along = orbit.radius * (Math.cos(anomaly) - orbit.eccentricity)
  const across = orbit.radius * Math.sqrt(1 - orbit.eccentricity ** 2) * Math.sin(anomaly)
  return add(scale(orbit.p, along), scale(orbit.q, across))
}
