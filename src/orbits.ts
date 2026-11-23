import {
  AdditiveBlending, BufferAttribute, Color, CustomBlending, DoubleSide, GLSL3, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector2, Vector4,
} from 'three'
import { TAU } from './astro'
import { HARMONICS, VERTICAL_RATE } from './galactic-orbit'
import {
  planetFragment, planetVertex, ribbonFragment, ribbonVertex, starFragment, starVertex,
} from './orbit-shaders'
import { EMPTY_ORBIT, SURFACES, type System } from './systems'

const TRAIL_SAMPLES = 512
// Shader time restarts at each epoch so fast inner orbits keep their precision for days.
const EPOCH_SECONDS = 128
const wrap = (angle: number) => angle - TAU * Math.floor(angle / TAU)

function instanceData(systems: System[]) {
  const path: number[] = []
  const cycle: number[] = []
  const orbit: number[] = []
  const orbitP: number[] = []
  const orbitQ: number[] = []
  const outer: number[] = []
  const outerP: number[] = []
  const outerQ: number[] = []
  const visual: number[] = []
  const surface: number[] = []
  const spinAxis: number[] = []
  const colors: number[] = []
  const light: number[] = []
  let instance = 0
  systems.forEach((system, index) => {
    const starlight = new Color(system.light)
    system.bodies.forEach((body, bodyIndex) => {
      const companion = body.outer ?? EMPTY_ORBIT
      const { path: galactic } = system
      path.push(galactic.meanRadius, galactic.azimuth, galactic.height, galactic.heightPhase)
      cycle.push(galactic.rate, 0, galactic.radialRate, 0)
      orbit.push(body.orbit.radius, body.orbit.rate, body.orbit.phase, body.orbit.eccentricity)
      orbitP.push(...body.orbit.p)
      orbitQ.push(...body.orbit.q)
      outer.push(companion.radius, companion.rate, companion.phase, companion.eccentricity)
      outerP.push(...companion.p)
      outerQ.push(...companion.q)
      visual.push(bodyIndex === 0 ? 1 : 0, index, body.size, body.glow)
      surface.push(body.surface ? SURFACES.indexOf(body.surface) + 1 : 0, body.spin ?? 0, wrap(instance++ * 2.13), 0)
      spinAxis.push(...(body.spinAxis ?? [0, 1, 0]))
      new Color(body.color).toArray(colors, colors.length)
      starlight.toArray(light, light.length)
    })
  })
  const attribute = (values: number[], size: number) => new InstancedBufferAttribute(new Float32Array(values), size)
  const attributes = {
    aPath: attribute(path, 4), aCycle: attribute(cycle, 4),
    aOrbit: attribute(orbit, 4), aOrbitP: attribute(orbitP, 3), aOrbitQ: attribute(orbitQ, 3),
    aOuter: attribute(outer, 4), aOuterP: attribute(outerP, 3), aOuterQ: attribute(outerQ, 3),
    aVisual: attribute(visual, 4), aSurface: attribute(surface, 4), aSpinAxis: attribute(spinAxis, 3),
    aColor: attribute(colors, 3), aLight: attribute(light, 3),
  }

  /** Moves the shader's time origin to `time` by advancing every phase to that instant. */
  function rebase(time: number) {
    let offset = 0
    let instance = 0
    for (const system of systems) {
      const { path: galactic } = system
      for (const body of system.bodies) {
        const companion = body.outer ?? EMPTY_ORBIT
        attributes.aPath.array[offset + 1] = wrap(galactic.azimuth + time * galactic.rate)
        attributes.aPath.array[offset + 3] = wrap(galactic.heightPhase + time * VERTICAL_RATE)
        attributes.aCycle.array[offset + 1] = wrap(time * galactic.radialRate)
        attributes.aOrbit.array[offset + 2] = wrap(body.orbit.phase + time * body.orbit.rate)
        attributes.aOuter.array[offset + 2] = wrap(companion.phase + time * companion.rate)
        attributes.aSurface.array[offset + 2] = wrap(instance * 2.13 + time * (body.spin ?? 0))
        offset += 4
        instance++
      }
    }
    for (const name of ['aPath', 'aCycle', 'aOrbit', 'aOuter', 'aSurface'] as const) attributes[name].needsUpdate = true
  }

  return { attributes, rebase }
}

function strip(samples: number) {
  const geometry = new InstancedBufferGeometry()
  const vertices = new Float32Array(samples * 2 * 3)
  const indices = new Uint16Array((samples - 1) * 6)
  for (let i = 0; i < samples; i++) {
    vertices.set([i / (samples - 1), -1, 0, i / (samples - 1), 1, 0], i * 6)
    if (i < samples - 1) {
      const vertex = i * 2
      indices.set([vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2], i * 6)
    }
  }
  geometry.setAttribute('position', new BufferAttribute(vertices, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return geometry
}

function billboard() {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3))
  geometry.setIndex([0, 1, 2, 1, 3, 2])
  return geometry
}

export function createOrbits(systems: System[]) {
  const uniforms = {
    uTime: { value: 0 }, uTrailSeconds: { value: 9 }, uFocus: { value: -1 }, uSystemFrame: { value: false },
    uViewport: { value: new Vector2(1, 1) },
    uSystemColors: { value: systems.map(system => new Color(system.color)) },
    uHarmonics: {
      value: systems.flatMap(({ path }) => Array.from({ length: HARMONICS }, (_, k) =>
        new Vector4(path.radial[2 * k], path.radial[2 * k + 1], path.wobble[2 * k], path.wobble[2 * k + 1]))),
    },
  }
  const trails = strip(TRAIL_SAMPLES)
  const stars = billboard()
  const planets = billboard()
  const { attributes, rebase } = instanceData(systems)
  for (const geometry of [trails, stars, planets]) {
    for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute)
    geometry.instanceCount = attributes.aVisual.count
  }

  const glowing = { uniforms, glslVersion: GLSL3, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }
  const ribbons = new Mesh(trails, new ShaderMaterial({ ...glowing, vertexShader: ribbonVertex, fragmentShader: ribbonFragment }))
  const starMesh = new Mesh(stars, new ShaderMaterial({ ...glowing, vertexShader: starVertex, fragmentShader: starFragment }))
  // Planets are solid: they write depth so trails and starlight behind them stay hidden.
  // Their soft edges and faint ring material are drawn in a second pass that leaves depth alone.
  const planetMaterial = (solid: boolean) => new ShaderMaterial({
    uniforms, glslVersion: GLSL3, transparent: true, depthWrite: solid, side: DoubleSide,
    blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
    defines: solid ? { SOLID: 1 } : {},
    vertexShader: planetVertex, fragmentShader: planetFragment,
  })
  const planetMesh = new Mesh(planets, planetMaterial(true))
  const planetEdges = new Mesh(planets, planetMaterial(false))
  planetMesh.renderOrder = 1
  planetEdges.renderOrder = 2
  ribbons.renderOrder = 3
  starMesh.renderOrder = 4
  const meshes = [planetMesh, planetEdges, ribbons, starMesh]
  for (const mesh of meshes) mesh.frustumCulled = false

  let epoch = 0
  function setTime(time: number) {
    const nextEpoch = Math.floor(time / EPOCH_SECONDS) * EPOCH_SECONDS
    if (nextEpoch !== epoch) {
      epoch = nextEpoch
      rebase(epoch)
    }
    uniforms.uTime.value = time - epoch
  }

  return { meshes, ribbons, uniforms, setTime }
}
