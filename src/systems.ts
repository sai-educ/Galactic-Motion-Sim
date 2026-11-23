import type { Vector3 } from 'three'

export interface Epicycle {
  radius: number
  speed: number
  phase: number
  inclination: number
}

export interface Body {
  name: string
  color: string
  size: number
  glow: number
  orbit: Epicycle
  outer?: Epicycle
  surface?: 'rocky' | 'banded' | 'ringed'
  spin?: number
  obliquity?: number
}

export interface System {
  id: string
  name: string
  kind: string
  description: string
  color: string
  radius: number
  angle: number
  bob: number
  bobSpeed: number
  bobPhase: number
  viewDistance: number
  bodies: Body[]
}

export const TAU = 2 * Math.PI
export const GALACTIC_SPEED = 5.3
export const EMPTY_ORBIT: Epicycle = { radius: 0, speed: 0, phase: 0, inclination: 0 }
const orbit = (radius: number, period: number, phase: number, degrees: number): Epicycle =>
  ({ radius, speed: TAU / period, phase, inclination: degrees * Math.PI / 180 })

const body = (name: string, color: string, size: number, glow: number, path = EMPTY_ORBIT, outer?: Epicycle): Body =>
  ({ name, color, size, glow, orbit: path, outer })

function planet(name: string, color: string, size: number, path: Epicycle,
  rotation?: { rate: number, tiltDeg: number }, surface: Body['surface'] = 'rocky'): Body {
  return {
    ...body(name, color, size, 1.25, path), surface,
    spin: rotation?.rate,
    obliquity: (rotation?.tiltDeg ?? 0) * Math.PI / 180,
  }
}

export const systems: System[] = [
  {
    id: 'sol', name: 'Solar System', kind: '1 star · 8 planets',
    description: 'Follow the Sun as eight planets trace inclined paths around it.',
    color: '#ffd8a2', radius: 132, angle: 5.8, bob: 4.4, bobSpeed: 0.16, bobPhase: 0.2, viewDistance: 47,
    bodies: [
      body('The Sun', '#fff0c8', 18, 3.4),
      planet('Mercury', '#cebcab', 5.5, orbit(1.4, 1.85, 0.1, 29), { rate: 0.42, tiltDeg: 0.034 }),
      planet('Venus', '#f8ca92', 6.7, orbit(2.1, 2.45, 1.4, 31), { rate: 0.22, tiltDeg: 177.4 }),
      planet('Earth', '#62dfed', 7.2, orbit(3.0, 3.15, 2.3, 30), { rate: 1.7, tiltDeg: 23.4 }),
      planet('Mars', '#ff896f', 6.3, orbit(3.9, 3.95, 5.1, 32), { rate: 1.6, tiltDeg: 25.2 }),
      planet('Jupiter', '#ffc88c', 10.2, orbit(5.5, 5.45, 4.1, 29), { rate: 2.8, tiltDeg: 3.1 }, 'banded'),
      planet('Saturn', '#f3dfa7', 9.4, orbit(7.0, 6.7, 0.9, 32), { rate: 2.5, tiltDeg: 26.7 }, 'ringed'),
      planet('Uranus', '#82ebb9', 7.7, orbit(8.5, 8.0, 3.2, 30), { rate: 2.0, tiltDeg: 97.8 }, 'banded'),
      planet('Neptune', '#8aabff', 7.7, orbit(10.0, 9.4, 5.8, 31), { rate: 2.1, tiltDeg: 28.3 }, 'banded'),
    ],
  },
  {
    id: 'alpha', name: 'Alpha Centauri', kind: 'Triple star system',
    description: 'Alpha Centauri A and B form a close pair. Proxima Centauri traces a wider path around them.',
    color: '#ffb47f', radius: 144, angle: 0.92, bob: 5.8, bobSpeed: 0.14, bobPhase: 0.9, viewDistance: 45,
    bodies: [
      body('Alpha Centauri A', '#ffe8a3', 17, 3, orbit(2.45, 4.0, 0.6, 17), orbit(0.55, 15, Math.PI + 1.2, 38)),
      body('Alpha Centauri B', '#ffd27d', 14, 2.8, orbit(2.98, 4.0, Math.PI + 0.6, 17), orbit(0.55, 15, Math.PI + 1.2, 38)),
      body('Proxima Centauri', '#ff6962', 9, 2, orbit(9.2, 15, 1.2, 38)),
    ],
  },
  {
    id: 'sirius', name: 'Sirius', kind: 'Binary star system',
    description: 'A blue-white star and a white dwarf wind around their shared center of mass.',
    color: '#9ad5ff', radius: 160, angle: 2.72, bob: 4.1, bobSpeed: 0.18, bobPhase: 3, viewDistance: 41,
    bodies: [
      body('Sirius A', '#a6d7ff', 21, 4, orbit(2.8, 5.1, 2, 22)),
      body('Sirius B', '#f0f4ff', 8, 2.6, orbit(5.6, 5.1, Math.PI + 2, 22)),
    ],
  },
  {
    id: 'trappist', name: 'TRAPPIST-1', kind: '1 star · 7 planets',
    description: 'Seven closely packed planets weave around a cool red dwarf.',
    color: '#eea0b7', radius: 174, angle: 4.12, bob: 7.0, bobSpeed: 0.10, bobPhase: 2.6, viewDistance: 40,
    bodies: [
      body('TRAPPIST-1', '#ff9873', 14, 2.9),
      ...['#ff94bd', '#ff83de', '#d4a3ff', '#b29eff', '#8b9aff', '#71bcff', '#84e7ed'].map((color, index) =>
        planet(`TRAPPIST-1 ${'bcdefgh'[index]}`, color, 6.0,
          orbit(1.7 + index * 0.98, [1.48, 2.36, 3.94, 5.9, 8.85, 11.8, 17.7][index] * 0.57, index * 1.54, 14 + index * 0.6))),
    ],
  },
]

export function randomSequence(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 0x100000000
  }
}

// Featured camera targets use the same analytic phase and displacement as the GPU.
export function sampleSystem(system: System, time: number, position: Vector3, tangent?: Vector3) {
  const theta = system.angle + time * GALACTIC_SPEED / system.radius
  const verticalPhase = system.bobPhase + time * system.bobSpeed
  position.set(system.radius * Math.cos(theta), system.bob * Math.sin(verticalPhase), system.radius * Math.sin(theta))
  tangent?.set(-GALACTIC_SPEED * Math.sin(theta), system.bob * system.bobSpeed * Math.cos(verticalPhase),
    GALACTIC_SPEED * Math.cos(theta)).normalize()
}

// Orbital poles stay fixed in galactic coordinates as the barycenter travels.
export function sampleBody(system: System, body: Body, time: number, position: Vector3) {
  sampleSystem(system, time, position)
  const sin = Math.sin(system.angle)
  const cos = Math.cos(system.angle)
  offsetOrbit(position, body.orbit, time, sin, cos)
  if (body.outer) offsetOrbit(position, body.outer, time, sin, cos)
}

function offsetOrbit(position: Vector3, orbit: Epicycle, time: number, sin: number, cos: number) {
  const phase = orbit.speed * time + orbit.phase
  const radial = orbit.radius * Math.cos(phase)
  const cross = orbit.radius * Math.sin(phase)
  const along = cross * Math.sin(orbit.inclination)
  position.x -= cos * radial + sin * along
  position.y -= cross * Math.cos(orbit.inclination)
  position.z += cos * along - sin * radial
}
