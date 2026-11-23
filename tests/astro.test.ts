import { describe, expect, test } from 'vitest'
import {
  blackbodyColor, cross, dot, eccentricAnomaly, eclipticToEquatorial, equatorialToGalactic, galacticCoordinates,
  galacticToScene, MYR_PER_SECOND, orbitalAxes, RAD, SOLAR_AZIMUTH, TAU, type Vec3,
} from '../src/astro'

describe('galacticCoordinates', () => {
  test('places Sagittarius A* at the origin of Galactic longitude and latitude', () => {
    const { l, b } = galacticCoordinates(266.41683, -29.00781)
    expect(Math.min(l, 360 - l)).toBeLessThan(0.1)
    expect(Math.abs(b)).toBeLessThan(0.1)
  })

  test('places the north Galactic pole at latitude 90°', () => {
    expect(galacticCoordinates(192.85948, 27.12825).b).toBeCloseTo(90, 2)
  })

  test('recovers the catalog position of the Andromeda Galaxy', () => {
    const { l, b } = galacticCoordinates(10.68471, 41.26875)
    expect(l).toBeCloseTo(121.17, 1)
    expect(b).toBeCloseTo(-21.57, 1)
  })
})

describe('frame rotations', () => {
  test('tilt the ecliptic pole 60° from Galactic north, toward the direction of rotation', () => {
    const [center, rotation, north] = equatorialToGalactic(eclipticToEquatorial([0, 0, 1]))
    expect(Math.asin(north) / RAD).toBeCloseTo(29.81, 1)
    expect((Math.atan2(rotation, center) / RAD + 360) % 360).toBeCloseTo(96.38, 1)
  })

  test('keep Galactic axes right-handed in the scene, with the center behind the Sun', () => {
    const center = galacticToScene([1, 0, 0])
    const rotation = galacticToScene([0, 1, 0])
    const north = galacticToScene([0, 0, 1])
    expect(cross(center, rotation)).toEqual(north.map(value => expect.closeTo(value, 12)))
    expect(center[0]).toBeCloseTo(-Math.cos(SOLAR_AZIMUTH), 12)
    expect(center[2]).toBeCloseTo(-Math.sin(SOLAR_AZIMUTH), 12)
  })
})

describe('eccentricAnomaly', () => {
  test.each([[0.3, 0], [1.1, 0.2056], [4.0, 0.5195], [-2.5, 0.5914], [100.2, 0.5]])(
    'satisfies Kepler’s equation for M = %f, e = %f', (mean, eccentricity) => {
      const anomaly = eccentricAnomaly(mean, eccentricity)
      const wrapped = mean - TAU * Math.floor(mean / TAU)
      expect(anomaly - eccentricity * Math.sin(anomaly)).toBeCloseTo(wrapped, 9)
    })
})

describe('orbitalAxes', () => {
  test('returns perpendicular unit vectors whose normal is tilted by the inclination', () => {
    const { p, q } = orbitalAxes(79.243, 205.073, 231.519)
    expect(dot(p, p)).toBeCloseTo(1, 12)
    expect(dot(q, q)).toBeCloseTo(1, 12)
    expect(dot(p, q)).toBeCloseTo(0, 12)
    expect(cross(p, q)[2]).toBeCloseTo(Math.cos(79.243 * RAD), 12)
  })

  test('points periapsis along the reference axis when every angle is zero', () => {
    const expected: Vec3 = [1, 0, 0]
    expect(orbitalAxes(0, 0, 0).p).toEqual(expected)
  })
})

describe('blackbodyColor', () => {
  test('gives the Sun a warm white, Sirius a blue-white, and a red dwarf an orange', () => {
    expect(blackbodyColor(5772)).toBe('#fff2e6')
    expect(blackbodyColor(9940)).toBe('#cadaff')
    expect(blackbodyColor(2566)).toBe('#ffa24c')
  })

  test('gets steadily bluer as the temperature rises', () => {
    const blueShare = (kelvin: number) => {
      const hex = blackbodyColor(kelvin)
      return parseInt(hex.slice(5, 7), 16) / parseInt(hex.slice(1, 3), 16)
    }
    expect(blueShare(3000)).toBeLessThan(blueShare(6000))
    expect(blueShare(6000)).toBeLessThan(blueShare(12000))
  })
})

test('one simulation second spans about 1.36 million years', () => {
  expect(MYR_PER_SECOND).toBeCloseTo(1.356, 2)
})
