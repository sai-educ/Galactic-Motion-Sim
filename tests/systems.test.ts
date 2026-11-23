import { describe, expect, test } from 'vitest'
import {
  add, cross, dot, eclipticToScene, equatorialToScene, galacticToScene, normalize, RAD, scale, skyAxes, TAU, type Vec3,
} from '../src/astro'
import { bodyOffset, orbitOffset, sampleSystem, systems, type Body, type System } from '../src/systems'

const system = (id: string) => systems.find(candidate => candidate.id === id) as System
const body = (id: string, name: string) => system(id).bodies.find(candidate => candidate.name === name) as Body
const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const subtract = (a: Vec3, b: Vec3) => add(a, scale(b, -1))

/** Separation (in units of `scaleLength`) and position angle of `offset` on the sky at a position. */
function onSky(offset: Vec3, ra: number, dec: number) {
  const { north, east } = skyAxes(ra, dec)
  const alongNorth = dot(offset, equatorialToScene(north))
  const alongEast = dot(offset, equatorialToScene(east))
  return { separation: Math.hypot(alongNorth, alongEast), angle: (Math.atan2(alongEast, alongNorth) / RAD + 360) % 360 }
}

describe('Solar System', () => {
  const sol = system('sol')
  const planets = sol.bodies.slice(1)
  const eclipticPole = eclipticToScene([0, 0, 1])

  test('every planet orbits counterclockwise about the ecliptic pole', () => {
    for (const planet of planets) {
      expect(dot(cross(planet.orbit.p, planet.orbit.q), eclipticPole)).toBeGreaterThan(0.99)
    }
  })

  test('Earth starts at its J2000 heliocentric longitude', () => {
    const offset = bodyOffset(body('sol', 'Earth'), 0)
    const equinox = eclipticToScene([1, 0, 0])
    const ahead = eclipticToScene([0, 1, 0])
    expect((Math.atan2(dot(offset, ahead), dot(offset, equinox)) / RAD + 360) % 360).toBeCloseTo(100.4, 0)
  })

  test('periods follow Kepler’s third law for the drawn orbit sizes', () => {
    const constants = planets.map(planet => planet.orbit.rate ** 2 * planet.orbit.radius ** 3)
    for (const constant of constants) expect(constant / constants[0]).toBeCloseTo(1, 9)
  })

  test('Venus and Uranus spin backwards and the others spin forwards', () => {
    for (const planet of planets) {
      const spin = dot(planet.spinAxis as Vec3, cross(planet.orbit.p, planet.orbit.q))
      if (planet.name === 'Venus' || planet.name === 'Uranus') expect(spin).toBeLessThan(0)
      else expect(spin).toBeGreaterThan(0)
    }
  })

  test('Earth’s axis is tilted 23.4° from its orbital pole', () => {
    const earth = body('sol', 'Earth')
    const tilt = Math.acos(dot(earth.spinAxis as Vec3, normalize(cross(earth.orbit.p, earth.orbit.q)))) / RAD
    expect(tilt).toBeCloseTo(23.44, 1)
  })
})

describe('Alpha Centauri', () => {
  const a = body('alpha', 'Alpha Centauri A')
  const b = body('alpha', 'Alpha Centauri B')
  const proxima = body('alpha', 'Proxima Centauri')

  test('B sits 14.1″ from A at position angle 222° in the year 2000', () => {
    const relative = subtract(orbitOffset(b.orbit, 0), orbitOffset(a.orbit, 0))
    const drawnAxis = a.orbit.radius + b.orbit.radius
    const { separation, angle } = onSky(relative, 219.9, -60.83)
    expect(separation / drawnAxis * 17.493).toBeCloseTo(14.13, 1)
    expect(angle).toBeCloseTo(222.4, 0)
  })

  test('the center of mass of all three stars stays put', () => {
    const masses = [1.0788, 0.9092, 0.1221]
    for (const time of [0, 3.3, 17, 250]) {
      const weighted = [a, b, proxima].map((star, index) => scale(bodyOffset(star, time), masses[index]))
      expect(length(weighted.reduce(add))).toBeLessThan(1e-9)
    }
  })

  test('Proxima starts in its measured direction, near the far end of its orbit', () => {
    const measured = normalize(galacticToScene([-0.05622, -0.00198, -0.02785]))
    const offset = subtract(bodyOffset(proxima, 0), bodyOffset(a, 0))
    const fromPair = orbitOffset(proxima.orbit, 0)
    expect(dot(normalize(fromPair), measured)).toBeCloseTo(1, 6)
    expect(length(fromPair) / proxima.orbit.radius).toBeGreaterThan(1.45)
    expect(length(offset)).toBeGreaterThan(length(orbitOffset(b.orbit, 0)))
  })

  test('Proxima circles in the direction of its measured velocity', () => {
    const velocity = galacticToScene([-0.099, 0.173, 0.187])
    const step = subtract(orbitOffset(proxima.orbit, 0.01), orbitOffset(proxima.orbit, 0))
    expect(dot(step, velocity)).toBeGreaterThan(0)
  })
})

describe('Sirius', () => {
  const a = body('sirius', 'Sirius A')
  const b = body('sirius', 'Sirius B')

  test('B sits 4.5″ from A at position angle 151° in the year 2000', () => {
    const relative = subtract(orbitOffset(b.orbit, 0), orbitOffset(a.orbit, 0))
    const { separation, angle } = onSky(relative, 101.2872, -16.7161)
    expect(separation / (a.orbit.radius + b.orbit.radius) * 7.4957).toBeCloseTo(4.46, 1)
    expect(angle).toBeCloseTo(151.2, 0)
  })

  test('the lighter white dwarf swings about twice as wide as Sirius A', () => {
    expect(b.orbit.radius / a.orbit.radius).toBeCloseTo(2.063 / 1.018, 6)
  })

  test('one orbit takes 50.1 years at ten years per second', () => {
    expect(TAU / b.orbit.rate).toBeCloseTo(5.01284, 5)
  })
})

describe('TRAPPIST-1', () => {
  const trappist = system('trappist')
  const planets = trappist.bodies.slice(1)

  test('orbits are drawn to scale and obey Kepler’s third law', () => {
    const constants = planets.map(planet => planet.orbit.rate ** 2 * planet.orbit.radius ** 3)
    for (const constant of constants) expect(constant / constants[0]).toBeCloseTo(1, 2)
  })

  test('the orbital plane is seen nearly edge-on from the Sun', () => {
    const lineOfSight = equatorialToScene(skyAxes(346.6223, -5.0414).away)
    const pole = normalize(cross(planets[0].orbit.p, planets[0].orbit.q))
    expect(Math.abs(dot(pole, lineOfSight))).toBeLessThan(0.01)
  })

  test('neighboring planets keep near-resonant period ratios', () => {
    const ratios = planets.slice(1).map((planet, index) => planets[index].orbit.rate / planet.orbit.rate)
    const resonances = [8 / 5, 5 / 3, 3 / 2, 3 / 2, 4 / 3, 3 / 2]
    ratios.forEach((ratio, index) => expect(ratio).toBeCloseTo(resonances[index], 1))
  })
})

test('all four systems start within 41 light-years of one another', () => {
  const positions = systems.map(candidate => {
    const position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { Object.assign(this, { x, y, z }) } }
    sampleSystem(candidate, 0, position)
    return position
  })
  for (const position of positions) {
    const fromSun = Math.hypot(position.x - positions[0].x, position.y - positions[0].y, position.z - positions[0].z)
    expect(fromSun).toBeLessThan(0.21)
  }
})
