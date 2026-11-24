import { describe, expect, test } from 'vitest'
import { LY_PER_UNIT, MYR_PER_SECOND } from '../src/astro'
import { kinematics } from '../src/astrometry'
import { closestApproach } from '../src/encounters'
import { galacticOrbit, SUN, type Kinematics } from '../src/galactic-orbit'
import { neighborStars } from '../src/neighbors'

const SPEED_OF_LIGHT_KMS = 299_792.458
const sun = galacticOrbit(SUN)

function encounter(id: string) {
  const star = neighborStars.find(candidate => candidate.id === id)
  if (!star) throw new Error(`No neighbor star called ${id}`)
  const measured = kinematics(star.astrometry)
  const { time, distance } = closestApproach(galacticOrbit(measured), sun)
  return { measured, years: time * MYR_PER_SECOND * 1e6, lightYears: distance * LY_PER_UNIT }
}

/** The pass a star would make if it and the Sun both kept moving in straight lines. */
function straightLinePass({ l, b, distance, velocity }: Kinematics) {
  const longitude = l * Math.PI / 180
  const latitude = b * Math.PI / 180
  const position = [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)]
    .map(component => component * distance)
  const speed = Math.hypot(...velocity)
  const approach = position[0] * velocity[0] + position[1] * velocity[1] + position[2] * velocity[2]
  const years = -approach / (speed * speed) * SPEED_OF_LIGHT_KMS
  const miss = Math.sqrt(Math.max(0, distance * distance - (approach / speed) ** 2))
  return { years, lightYears: miss }
}

describe('closest approaches to the Sun', () => {
  test('Gliese 710 passes within a quarter of a light-year in about 1.29 million years', () => {
    // Bailer-Jones (2022) finds 0.064 parsecs and de la Fuente Marcos & de la Fuente Marcos (2022) 0.052,
    // both about 1.3 million years from now. A parsec is 3.26 light-years.
    const { years, lightYears } = encounter('gliese-710')

    expect(years / 1e6).toBeGreaterThan(1.25)
    expect(years / 1e6).toBeLessThan(1.33)
    expect(lightYears).toBeGreaterThan(0.1)
    expect(lightYears).toBeLessThan(0.25)
  })

  test('Barnard’s Star comes within about 3.8 light-years in roughly 9,800 years', () => {
    const { years, lightYears } = encounter('barnard')

    expect(years).toBeGreaterThan(9_300)
    expect(years).toBeLessThan(10_300)
    expect(lightYears).toBeCloseTo(3.78, 1)
  })

  test('Scholz’s Star passed within a light-year roughly 80,000 years ago', () => {
    // Mamajek et al. (2015) found 0.8 light-years 70,000 years ago, and Dupuy et al. (2019) 1.1 light-years 80,500 years ago.
    const { years, lightYears } = encounter('scholz')

    expect(years).toBeLessThan(-65_000)
    expect(years).toBeGreaterThan(-90_000)
    expect(lightYears).toBeGreaterThan(0.7)
    expect(lightYears).toBeLessThan(1)
  })

  test.each(neighborStars.map(star => [star.name, star.id]))(
    '%s passes where straight-line motion says it should', (_, id) => {
      // Over a few hundred thousand years the Galaxy's pull barely bends either path.
      const { measured, years, lightYears } = encounter(id)

      const straight = straightLinePass(measured)

      expect(Math.abs(years - straight.years)).toBeLessThan(Math.max(300, Math.abs(straight.years) * 0.005))
      expect(Math.abs(lightYears - straight.lightYears)).toBeLessThan(0.05)
    })

  test('two copies of one orbit never separate', () => {
    const { time, distance } = closestApproach(sun, sun)

    expect(distance).toBe(0)
    expect(Number.isFinite(time)).toBe(true)
  })

  test('rejects a search window that runs backwards', () => {
    expect(() => closestApproach(sun, sun, 2, -2)).toThrow(RangeError)
  })
})
