import { describe, expect, test } from 'vitest'
import { kinematics, type Astrometry } from '../src/astrometry'

describe('space motion from catalog astrometry', () => {
  test('reproduces TRAPPIST-1’s published position and velocity', () => {
    // Gaia EDR3 astrometry and the radial velocity listed by SIMBAD.
    const trappist: Astrometry = {
      ra: 346.62236873, dec: -5.04139925, parallax: 80.2123, pmRa: 930.788, pmDec: -479.038, radialVelocity: -52.0031,
    }

    const { l, b, distance, velocity } = kinematics(trappist)

    // The simulator’s own TRAPPIST-1 entry, which agrees with Burgasser & Mamajek (2017).
    expect(l).toBeCloseTo(69.71, 1)
    expect(b).toBeCloseTo(-56.64, 1)
    expect(distance).toBeCloseTo(40.66, 1)
    expect(Math.abs(velocity[0] - -44.0)).toBeLessThan(1)
    expect(Math.abs(velocity[1] - -66.7)).toBeLessThan(1)
    expect(Math.abs(velocity[2] - 10.7)).toBeLessThan(1.5)
  })

  test('a star receding along the line of sight moves purely along that line', () => {
    // The Galactic Center lies at right ascension 266.405°, declination −28.936°.
    const receding: Astrometry = { ra: 266.40499, dec: -28.93617, parallax: 100, pmRa: 0, pmDec: 0, radialVelocity: 30 }

    const { velocity } = kinematics(receding)

    expect(velocity[0]).toBeCloseTo(30, 2)
    expect(velocity[1]).toBeCloseTo(0, 2)
    expect(velocity[2]).toBeCloseTo(0, 2)
  })

  test('one arcsecond per year at one parsec is 4.74 km/s across the sky', () => {
    const drifting: Astrometry = { ra: 80, dec: 20, parallax: 1000, pmRa: 600, pmDec: -800, radialVelocity: 0 }

    const { velocity, distance } = kinematics(drifting)

    expect(Math.hypot(...velocity)).toBeCloseTo(4.74047, 4)
    expect(distance).toBeCloseTo(3.2616, 3)
  })

  test('rejects a parallax that is not positive', () => {
    const broken: Astrometry = { ra: 0, dec: 0, parallax: 0, pmRa: 1, pmDec: 1, radialVelocity: 1 }

    expect(() => kinematics(broken)).toThrow(RangeError)
  })
})
