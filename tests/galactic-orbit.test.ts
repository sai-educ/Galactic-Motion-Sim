import { describe, expect, test } from 'vitest'
import {
  CIRCULAR_SPEED_KMS, galacticToScene, LY_PER_UNIT, MYR_PER_SECOND, SOLAR_RADIUS_KPC, UNITS_PER_KPC,
} from '../src/astro'
import { galacticOrbit, sampleGalacticOrbit, SUN, toKms, type Kinematics } from '../src/galactic-orbit'

const vector = () => {
  const value = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } }
  return value
}

/** Velocity in km/s as (outward, along rotation, toward the north pole). */
function state(orbit: ReturnType<typeof galacticOrbit>, time: number) {
  const position = vector()
  const velocity = vector()
  sampleGalacticOrbit(orbit, time, position, velocity)
  const radius = Math.hypot(position.x, position.z)
  const outward = (velocity.x * position.x + velocity.z * position.z) / radius
  const along = (velocity.z * position.x - velocity.x * position.z) / radius
  return { position, radius, velocity: [toKms(outward), toKms(along), toKms(velocity.y)] }
}

const stars: [string, Kinematics][] = [
  ['the Sun', SUN],
  ['Alpha Centauri', { l: 315.73, b: -0.68, distance: 4.344, velocity: [-29.3, 1.7, 13.6] }],
  ['Sirius', { l: 227.23, b: -8.89, distance: 8.60, velocity: [14.4, -0.3, -11.5] }],
  ['TRAPPIST-1', { l: 69.71, b: -56.64, distance: 40.66, velocity: [-44.0, -66.7, 10.7] }],
]

describe.each(stars)('galactic orbit of %s', (_, kinematics) => {
  const orbit = galacticOrbit(kinematics)

  test('starts with the measured velocity relative to the Sun', () => {
    // The measured velocity is given along the Sun's own axes, which are turned slightly from the star's.
    const expected = galacticToScene(kinematics.velocity)
    const star = vector()
    const sun = vector()

    sampleGalacticOrbit(orbit, 0, vector(), star)
    sampleGalacticOrbit(galacticOrbit(SUN), 0, vector(), sun)

    expect(toKms(star.x - sun.x)).toBeCloseTo(expected[0], 2)
    expect(toKms(star.y - sun.y)).toBeCloseTo(expected[1], 2)
    expect(toKms(star.z - sun.z)).toBeCloseTo(expected[2], 2)
  })

  test('starts at the measured distance from the Sun', () => {
    const sun = state(galacticOrbit(SUN), 0).position
    const { position } = state(orbit, 0)
    const separation = Math.hypot(position.x - sun.x, position.y - sun.y, position.z - sun.z) * LY_PER_UNIT
    expect(separation).toBeCloseTo(kinematics.distance, 1)
  })

  test('conserves angular momentum over several laps, forward and backward', () => {
    const initial = state(orbit, 0)
    const momentum = initial.radius * initial.velocity[1]
    for (const time of [-400, -37.5, 12.25, 90, 333, 1000]) {
      const later = state(orbit, time)
      expect(later.radius * later.velocity[1] / momentum).toBeCloseTo(1, 3)
    }
  })

  test('conserves orbital energy in the plane', () => {
    const energy = (time: number) => {
      const { radius, velocity } = state(orbit, time)
      return (velocity[0] ** 2 + velocity[1] ** 2) / 2 + CIRCULAR_SPEED_KMS ** 2 * Math.log(radius / UNITS_PER_KPC)
    }
    for (const time of [-250, 41, 480]) expect(energy(time) / energy(0)).toBeCloseTo(1, 4)
  })
})

describe('the Sun’s orbit', () => {
  const orbit = galacticOrbit(SUN)

  test('starts 8.15 kpc from the center and about 68 light-years above the mid-plane', () => {
    const { position, radius } = state(orbit, 0)
    expect(radius / UNITS_PER_KPC).toBeCloseTo(SOLAR_RADIUS_KPC, 6)
    expect(position.y * LY_PER_UNIT).toBeCloseTo(67.8, 0)
  })

  test('takes between 210 and 235 million years for one lap', () => {
    const lap = 2 * Math.PI / orbit.rate * MYR_PER_SECOND
    expect(lap).toBeGreaterThan(210)
    expect(lap).toBeLessThan(235)
  })

  test('stays within about 100 parsecs of the mid-plane', () => {
    expect(orbit.height / UNITS_PER_KPC * 1000).toBeGreaterThan(90)
    expect(orbit.height / UNITS_PER_KPC * 1000).toBeLessThan(115)
  })

  test('turns clockwise when seen from Galactic north', () => {
    const before = state(orbit, 0).position
    const after = state(orbit, 1).position
    // Clockwise from +Y is the sense from +X toward +Z.
    expect(before.x * after.z - before.z * after.x).toBeGreaterThan(0)
  })
})

test('TRAPPIST-1 swings between about 4.9 and 8.3 kpc from the center', () => {
  const orbit = galacticOrbit(stars[3][1])
  const radii = Array.from({ length: 600 }, (_, index) => state(orbit, index * 0.5).radius / UNITS_PER_KPC)
  expect(Math.min(...radii)).toBeCloseTo(4.93, 1)
  expect(Math.max(...radii)).toBeCloseTo(8.34, 1)
})
