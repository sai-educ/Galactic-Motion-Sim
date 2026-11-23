import { systems } from './systems'

const RAD = Math.PI / 180
export const UNITS_PER_KPC = systems[0].radius / 8.15
export const DISK_EDGE = 315
export const PATTERN_SPEED = 0.009
export const BAR_AZIMUTH = systems[0].angle + 30 * RAD

interface Arm {
  name: string
  kind: 'Stellar arm' | 'Spiral arm' | 'Spur' | 'Inner gas arm'
  labelAt: number
  measured: [number, number]
  extent: [number, number]
  kink: number
  radius: number
  pitch: [number, number]
  width: number
  brightness: number
}

// Reid et al. (2019), Table 2: log-spiral fits in Galactic azimuth β.
// Outside the fit ranges the wide disk depicts schematic continuations.
export const arms: Arm[] = [
  { name: 'Norma Arm', kind: 'Spiral arm', labelAt: 62, measured: [5, 54], extent: [-172, 169], kink: 18,
    radius: 4.46, pitch: [-1, 19.5], width: 0.14, brightness: 0.73 },
  { name: 'Scutum–Centaurus Arm', kind: 'Stellar arm', labelAt: -75, measured: [0, 104], extent: [-209, 166], kink: 23,
    radius: 4.91, pitch: [14.1, 12.1], width: 0.23, brightness: 1.0 },
  { name: 'Sagittarius–Carina Arm', kind: 'Spiral arm', labelAt: -12, measured: [2, 97], extent: [-218, 177], kink: 24,
    radius: 6.04, pitch: [17.1, 1], width: 0.27, brightness: 0.72 },
  { name: 'Orion Spur', kind: 'Spur', labelAt: 26, measured: [-8, 34], extent: [-16, 45], kink: 9,
    radius: 8.26, pitch: [11.4, 11.4], width: 0.31, brightness: 0.57 },
  { name: 'Perseus Arm', kind: 'Stellar arm', labelAt: 110, measured: [-23, 115], extent: [-193, 191], kink: 40,
    radius: 8.87, pitch: [10.3, 8.7], width: 0.35, brightness: 1.07 },
  { name: 'Outer Arm', kind: 'Spiral arm', labelAt: 29, measured: [-16, 71], extent: [-159, 172], kink: 18,
    radius: 12.24, pitch: [3, 9.4], width: 0.65, brightness: 0.68 },
  // The two short arcs are schematic gas lanes along the inner bar.
  { name: 'Near 3-kpc Arm', kind: 'Inner gas arm', labelAt: 5, measured: [15, 18], extent: [-60, 63],
    kink: 15, radius: 3.52, pitch: [-4.2, -4.2], width: 0.18, brightness: 0.39 },
  { name: 'Far 3-kpc Arm', kind: 'Inner gas arm', labelAt: 162, measured: [142, 205], extent: [112, 240],
    kink: 180, radius: 3.2, pitch: [2, 2], width: 0.22, brightness: 0.38 },
]

function fittedRadius(arm: Arm, beta: number) {
  const pitch = arm.pitch[beta <= arm.kink ? 0 : 1]
  return arm.radius * Math.exp(-(beta - arm.kink) * RAD * Math.tan(pitch * RAD))
}

export function armRadius(arm: Arm, beta: number) {
  const boundary = Math.min(arm.measured[1], Math.max(arm.measured[0], beta))
  const extensionPitch = arm.kind === 'Inner gas arm' ? 2 : 13
  return fittedRadius(arm, boundary) * Math.exp(-(beta - boundary) * RAD * Math.tan(extensionPitch * RAD))
}

export function armAnchor(arm: Arm, time: number): [number, number, number] {
  const theta = systems[0].angle + arm.labelAt * RAD + time * PATTERN_SPEED
  const radius = armRadius(arm, arm.labelAt) * UNITS_PER_KPC
  return [radius * Math.cos(theta), 4, radius * Math.sin(theta)]
}

function smoothEdge(distance: number, width: number) {
  const value = Math.max(0, Math.min(1, distance / width))
  return value * value * (3 - 2 * value)
}

// Store radial emissivity and the offset dust lanes in a polar lookup texture.
export function armProfile(width: number, height: number) {
  const data = new Uint8Array(width * height * 4)
  for (let x = 0; x < width; x++) {
    const beta = (x + 0.5) / width * 360
    const crossings = []
    for (const arm of arms) {
      for (const offset of [-360, 0, 360]) {
        const angle = beta + offset
        if (angle < arm.extent[0] || angle > arm.extent[1]) continue
        const measuredDistance = Math.max(arm.measured[0] - angle, angle - arm.measured[1], 0)
        const taper = smoothEdge(Math.min(angle - arm.extent[0], arm.extent[1] - angle), 19)
        const radius = armRadius(arm, angle)
        crossings.push({
          radius: radius * UNITS_PER_KPC,
          width: (arm.width + 0.14 + Math.max(0, radius - 5) * 0.031 + measuredDistance * 0.0018) * UNITS_PER_KPC,
          light: arm.brightness * taper * (1 - 0.48 * smoothEdge(measuredDistance, 138)),
        })
      }
    }
    for (let y = 0; y < height; y++) {
      const radius = (y + 0.5) / height * DISK_EDGE
      let ridge = 0
      let halo = 0
      let dust = 0
      for (const arm of crossings) {
        const offset = (radius - arm.radius) / arm.width
        ridge += Math.exp(-0.55 * offset ** 2) * arm.light
        halo += Math.exp(-0.12 * offset ** 2) * arm.light
        dust += Math.exp(-1.45 * (offset + 0.75) ** 2) * arm.light
      }
      const index = (x + width * y) * 4
      data[index] = Math.round(Math.min(1, ridge) * 255)
      data[index + 1] = Math.round(Math.min(1, halo * 0.70) * 255)
      data[index + 2] = Math.round(Math.min(1, dust) * 255)
      data[index + 3] = 255
    }
  }
  return data
}
