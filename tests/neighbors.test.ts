import { describe, expect, test } from 'vitest'
import { CIRCULAR_SPEED_KMS, UNITS_PER_KPC } from '../src/astro'
import { kinematics } from '../src/astrometry'
import { closestApproach } from '../src/encounters'
import { galacticOrbit, radialRange, sampleGalacticOrbit, SUN, toKms } from '../src/galactic-orbit'
import { NEIGHBOR_GROUPS, neighborStars } from '../src/neighbors'
import { LY_PER_UNIT } from '../src/astro'
import { systems } from '../src/systems'

const sun = galacticOrbit(SUN)
const orbits = neighborStars.map(star => ({ star, orbit: galacticOrbit(kinematics(star.astrometry)) }))
const inGroup = (group: string) => orbits.filter(({ star }) => star.group === group)

/** How stretched an orbit is: 0 for a circle, approaching 1 for a plunging path. */
function stretch(orbit: ReturnType<typeof galacticOrbit>) {
  const { inner, outer } = radialRange(orbit)
  return (outer - inner) / (outer + inner)
}

const vector = () => ({ x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z } })

describe('neighboring stars', () => {
  test('every star belongs to a described group and has a unique id', () => {
    const groups = NEIGHBOR_GROUPS.map(group => group.id)
    const ids = new Set([...systems.map(system => system.id)])

    for (const star of neighborStars) expect(groups).toContain(star.group)
    expect(ids.size).toBe(systems.length)
  })

  test('fellow travelers follow orbits at least as round as the Sun’s', () => {
    const solar = stretch(sun)

    for (const { orbit } of inGroup('calm')) expect(stretch(orbit)).toBeLessThan(solar)
    expect(inGroup('calm').length).toBeGreaterThan(0)
  })

  test('stars passing through follow orbits several times more stretched than the Sun’s', () => {
    const solar = stretch(sun)

    for (const { orbit } of inGroup('visitor')) expect(stretch(orbit)).toBeGreaterThan(4 * solar)
    expect(inGroup('visitor').length).toBeGreaterThan(0)
  })

  test('close calls pass within a light-year of the Sun', () => {
    for (const { orbit } of inGroup('encounter')) {
      expect(closestApproach(orbit, sun).distance * LY_PER_UNIT).toBeLessThan(1)
    }
    expect(inGroup('encounter').length).toBeGreaterThan(0)
  })

  test.each(orbits.map(({ star, orbit }) => [star.name, orbit] as const))(
    '%s stays where the model of the Galaxy applies', (_, orbit) => {
      // The flat rotation curve holds outside the central bar, and the up-and-down motion is modeled
      // as a spring, which is a fair match within a few hundred parsecs of the disk.
      expect(radialRange(orbit).inner / UNITS_PER_KPC).toBeGreaterThan(2.5)
      expect(orbit.height / UNITS_PER_KPC * 1000).toBeLessThan(400)
      expect(orbit.rate).toBeGreaterThan(0)
    })

  test.each(orbits.map(({ star, orbit }) => [star.name, orbit] as const))(
    'the stored path of %s is a true orbit', (_, orbit) => {
      const state = (time: number) => {
        const position = vector()
        const velocity = vector()
        sampleGalacticOrbit(orbit, time, position, velocity)
        const radius = Math.hypot(position.x, position.z)
        const outward = toKms((velocity.x * position.x + velocity.z * position.z) / radius)
        const along = toKms((velocity.z * position.x - velocity.x * position.z) / radius)
        return {
          momentum: radius * along,
          energy: (outward ** 2 + along ** 2) / 2 + CIRCULAR_SPEED_KMS ** 2 * Math.log(radius / UNITS_PER_KPC),
        }
      }
      const start = state(0)

      for (const time of [-400, -37.5, 3.3, 12.25, 90, 333, 1000]) {
        const later = state(time)
        expect(later.momentum / start.momentum).toBeCloseTo(1, 5)
        expect(later.energy / start.energy).toBeCloseTo(1, 5)
      }
    })

  test('each neighbor becomes a system that carries its group, its closest approach, and one star', () => {
    for (const star of neighborStars) {
      const system = systems.find(candidate => candidate.id === star.id)

      expect(system?.neighbor?.group).toBe(star.group)
      expect(system?.neighbor?.encounter.distance).toBeGreaterThan(0)
      expect(system?.bodies).toHaveLength(1)
      expect(system?.description).toBe(star.story)
    }
  })

  test('the featured systems come first, so their shortcuts and themes keep their numbers', () => {
    expect(systems.slice(0, 4).map(system => system.id)).toEqual(['sol', 'alpha', 'sirius', 'trappist'])
    expect(systems.slice(0, 4).every(system => !system.neighbor)).toBe(true)
    expect(systems.slice(4).every(system => system.neighbor)).toBe(true)
  })
})
