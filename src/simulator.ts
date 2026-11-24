import {
  ACESFilmicToneMapping, Color, Group, PerspectiveCamera, Scene, Spherical, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { LY_PER_UNIT, SOLAR_AZIMUTH, UNITS_PER_KPC } from './astro'
import { createCalloutLayout, type Callout, type Rect } from './callouts'
import { approach, IDLE_SECONDS, SETTLE_RATE, shotAt, smootherstep } from './cinematic'
import { SimulationClock } from './clock'
import { createDeepSky } from './deep-sky'
import { toKms } from './galactic-orbit'
import { createGalaxy } from './galaxy'
import { createOrbits } from './orbits'
import { armAnchor, arms, BAR_AZIMUTH, BAR_SPEED, labelSpeed, RING_RADII_KPC } from './spiral-map'
import { bodyOffset, sampleSystem, systems } from './systems'
import { defaultViewSettings, type ViewSettings } from './view-settings'

/** Live figures for the tracked system, in everyday units. */
export interface Telemetry {
  /** Distance from the Galactic Center in light-years. */
  radius: number
  /** Height above the Galaxy's mid-plane in light-years. Negative values are south of it. */
  height: number
  /** Speed around the Galaxy in km/s. */
  speed: number
  /** Distance from the Sun in light-years. */
  separation: number
}

interface SimulatorOptions {
  canvas: HTMLCanvasElement
  systemLabels: Callout[]
  coreLabel: HTMLElement
  bodyLabels: Callout[][]
  armLabels: Callout[]
  ringLabels: Callout[]
  skyLabels: Callout[]
  /** Interface panels drawn over the scene. Labels keep clear of them. */
  obstacles: HTMLElement[]
  onFrame: (time: number, delta: number) => void
  onFps: (fps: number) => void
  onTelemetry: (telemetry: Telemetry) => void
  onTakeover: () => void
  onContextLost: () => void
  onFirstRender: () => void
  /** The camera has finished flying to a system, or the viewer took over before it arrived. */
  onArrive: (index: number) => void
}

interface Transition {
  elapsed: number
  duration: number
  /** How far the camera pulls back mid-flight, as a share of its distance. */
  pullback: number
  fromPosition: Vector3
  fromTarget: Vector3
  toPosition: Vector3
  toTarget: Vector3
}

const OVERVIEW_POSITION = new Vector3(236, 390, 398)
const OVERVIEW_TARGET = new Vector3(0, -25, 0)
const NORTH_POSITION = new Vector3(0, 725, 0.01)
const MODEL_FOV = 46
const MIN_DISTANCE = 12
// Camera flights: into a system from outside, between two systems, and back out to the Galaxy.
const ENTER_SECONDS = 3.5
const SWITCH_SECONDS = 3.8
const LEAVE_SECONDS = 3.5
const SWITCH_PULLBACK = 0.6
// How quickly the simulation clock eases to a stop on pause, and back up to speed on resume, per second.
const STOP_RATE = 3
const START_RATE = 1.4
// A close-up looks at a point this far behind the system so that its trail fills the frame.
const TRAIL_LEAD = 6.8
const TELEMETRY_INTERVAL = 0.2
const OBSTACLE_INTERVAL = 0.25
const OBSTACLE_PADDING = 8
const RING_LABEL_AZIMUTH = SOLAR_AZIMUTH + 2.5
const BAR_LABEL_RADIUS = 30

export function createSimulator(options: SimulatorOptions) {
  const { canvas, systemLabels, coreLabel, bodyLabels, armLabels, ringLabels, skyLabels } = options
  const viewport = canvas.parentElement!
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const scene = new Scene()
  scene.background = new Color('#04060f')
  const camera = new PerspectiveCamera(MODEL_FOV, 1, 0.6, 6900)
  const renderer = new WebGLRenderer({ canvas, powerPreference: 'high-performance', alpha: false })
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.13
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.11
  controls.enablePan = false
  controls.rotateSpeed = 0.62
  controls.zoomSpeed = 0.76
  controls.minDistance = MIN_DISTANCE
  controls.maxDistance = 2150
  controls.minPolarAngle = 0.07
  controls.maxPolarAngle = Math.PI - 0.07

  const galaxy = createGalaxy()
  const sky = createDeepSky()
  const orbits = createOrbits(systems)
  const diskScene = new Group()
  diskScene.add(...galaxy.objects, ...orbits.meshes)
  scene.add(sky.portraits, galaxy.sky, diskScene)
  const hdr = renderer.extensions.has('EXT_color_buffer_float')
  const target = hdr ? undefined : new WebGLRenderTarget(1, 1)
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = hdr ? new UnrealBloomPass(new Vector2(1, 1), 0.5, 0.6, 0.8) : undefined
  const antialias = hdr ? new SMAAPass() : undefined
  if (bloom && antialias) {
    composer.addPass(bloom)
    composer.addPass(antialias)
  }
  composer.addPass(new OutputPass())

  const clock = new SimulationClock()
  const marker = new Vector3()
  const velocity = new Vector3()
  const sun = new Vector3()
  const callouts = createCalloutLayout(camera, armLabels.length + ringLabels.length + skyLabels.length
    + systemLabels.length + 1 + Math.max(...bodyLabels.map(group => group.length)))
  const armPositions = arms.map(arm => armAnchor(arm, 0))
  const center = new Vector3()
  const previousCenter = new Vector3()
  const displacement = new Vector3()
  const core = new Vector3()
  // Direction from a tracked system to the camera's pivot, and that offset as a share of the camera distance.
  const lead = { direction: new Vector3(), ratio: 0 }
  const UP = new Vector3(0, 1, 0)
  let heading = 0
  let obstacles: Rect[] = []
  let transition: Transition | undefined
  // The idle camera that moves between shots around a tracked system.
  const orbit = new Vector3()
  const spherical = new Spherical()
  let arriving = -1
  let interacting = false
  let idle = Infinity
  let shotTime = 0
  let shotBlend = 0
  let baseDistance = 0
  let active = -1
  let view = defaultViewSettings
  let showLabels = true
  let width = 1
  let height = 1
  let scale = 1
  let rate = 1
  let paused = reducedMotion.matches
  // Share of the chosen rate the clock runs at, eased between 0 and 1 on pause and resume.
  let speed = paused ? 0 : 1
  let lastFrame: number | undefined
  let frameAverage = 1 / 60
  let qualityTimer = 0
  let telemetryTimer = TELEMETRY_INTERVAL
  let obstacleTimer = OBSTACLE_INTERVAL
  let fpsFrames = 0
  let fpsDuration = 0
  let firstFrame = true

  function resize() {
    width = Math.max(1, viewport.clientWidth)
    height = Math.max(1, viewport.clientHeight)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    const pixelBudget = view.quality === 'high' ? 3_000_000 : view.quality === 'smooth' ? 950_000 : 1_750_000
    const maxDpr = Math.min(devicePixelRatio || 1, view.quality === 'high' ? 2 : 1.5, Math.sqrt(pixelBudget / (width * height)))
    const dpr = Math.max(0.55, maxDpr * scale)
    const particles = view.quality === 'smooth' ? 75_000 : scale < 0.80 ? 112_000 : 150_000
    galaxy.disk.geometry.setDrawRange(0, particles)
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    composer.setPixelRatio(dpr)
    composer.setSize(width, height)
    orbits.uniforms.uViewport.value.set(width, height)
    galaxy.disk.material.uniforms.uDpr.value = dpr
    galaxy.sky.material.uniforms.uDpr.value = dpr
    obstacleTimer = OBSTACLE_INTERVAL
  }

  function measureObstacles() {
    const origin = viewport.getBoundingClientRect()
    obstacles = options.obstacles.flatMap(element => {
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return []
      return [{
        left: rect.left - origin.left - OBSTACLE_PADDING, top: rect.top - origin.top - OBSTACLE_PADDING,
        right: rect.right - origin.left + OBSTACLE_PADDING, bottom: rect.bottom - origin.top + OBSTACLE_PADDING,
      }]
    })
  }

  function framing(index: number, north: boolean) {
    if (index < 0) return {
      position: (north ? NORTH_POSITION : OVERVIEW_POSITION).clone().sub(OVERVIEW_TARGET)
        .multiplyScalar(Math.max(1, 1.08 / camera.aspect)).add(OVERVIEW_TARGET),
      target: OVERVIEW_TARGET.clone(),
    }
    const system = systems[index]
    const position = new Vector3()
    const tangent = new Vector3()
    sampleSystem(system, clock.time, position, tangent)
    tangent.normalize()
    const outward = new Vector3().crossVectors(camera.up, tangent).normalize()
    const target = position.clone().addScaledVector(tangent, -TRAIL_LEAD)
    position.addScaledVector(outward, system.viewDistance * 0.87)
      .addScaledVector(camera.up, system.viewDistance * 0.58)
      .addScaledVector(tangent, system.viewDistance * 0.19)
    position.sub(target).multiplyScalar(Math.max(1, 0.96 / camera.aspect)).add(target)
    lead.direction.copy(tangent).negate()
    lead.ratio = TRAIL_LEAD / position.distanceTo(target)
    heading = Math.atan2(tangent.z, tangent.x)
    return { position, target }
  }

  function select(index: number) {
    if (active !== index && active >= 0) {
      for (const label of bodyLabels[active]) label.element.hidden = true
    }
    active = index
    orbits.uniforms.uFocus.value = index
    telemetryTimer = TELEMETRY_INTERVAL
    if (index >= 0) sampleSystem(systems[index], clock.time, previousCenter)
  }

  function moveCamera(destination: { position: Vector3, target: Vector3 }, animate: boolean, duration: number, pullback = 0) {
    if (animate && !reducedMotion.matches) {
      transition = {
        elapsed: 0, duration, pullback,
        fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
        toPosition: destination.position, toTarget: destination.target,
      }
    } else {
      transition = undefined
      camera.position.copy(destination.position)
      controls.target.copy(destination.target)
      controls.update()
    }
  }

  function focus(index: number, animate = true, north = false) {
    const switching = index >= 0 && active >= 0 && active !== index
    select(index)
    arriving = index
    idle = Infinity
    const duration = index < 0 ? LEAVE_SECONDS : switching ? SWITCH_SECONDS : ENTER_SECONDS
    moveCamera(framing(index, north), animate, duration, switching ? SWITCH_PULLBACK : 0)
  }

  /** While the viewer leaves the camera alone, ease it slowly through the shots around the tracked system. */
  function direct(delta: number) {
    idle += delta
    if (interacting || idle < IDLE_SECONDS || reducedMotion.matches || baseDistance <= 0) {
      shotBlend = 0
      return
    }
    shotTime += delta
    shotBlend = approach(shotBlend, 1, 0.5, delta)
    const shot = shotAt(shotTime)
    const settle = SETTLE_RATE * shotBlend
    spherical.setFromVector3(orbit.subVectors(camera.position, controls.target))
    spherical.theta += shot.drift * shotBlend * delta
    spherical.phi = approach(spherical.phi, shot.polar, settle, delta)
    spherical.radius = approach(spherical.radius, baseDistance * shot.distance, settle, delta)
    spherical.makeSafe()
    camera.position.copy(controls.target).add(orbit.setFromSpherical(spherical))
  }

  function arrive() {
    if (transition || arriving < 0) return
    const index = arriving
    arriving = -1
    shotTime = 0
    shotBlend = 0
    baseDistance = camera.position.distanceTo(controls.target)
    options.onArrive(index)
  }

  function updateCamera(delta: number) {
    if (active >= 0) {
      sampleSystem(systems[active], clock.time, center, velocity)
      displacement.subVectors(center, previousCenter)
      previousCenter.copy(center)
      // Turn the camera with the system's direction of travel so the trail keeps its place in the frame,
      // however far the clock runs or is scrubbed.
      const nextHeading = Math.atan2(velocity.z, velocity.x)
      const turn = heading - nextHeading
      heading = nextHeading
      lead.direction.applyAxisAngle(UP, turn)
      if (transition) {
        transition.toPosition.add(displacement).sub(center).applyAxisAngle(UP, turn).add(center)
        transition.toTarget.add(displacement).sub(center).applyAxisAngle(UP, turn).add(center)
      } else {
        camera.position.sub(controls.target).applyAxisAngle(UP, turn).add(controls.target)
        direct(delta)
        // The pivot closes in on the system as the camera does, so zooming ends at the star itself.
        const reach = lead.ratio * camera.position.distanceTo(controls.target)
        displacement.copy(center).addScaledVector(lead.direction, reach).sub(controls.target)
        camera.position.add(displacement)
        controls.target.add(displacement)
      }
    }

    if (transition) {
      transition.elapsed += delta
      const t = Math.min(transition.elapsed / transition.duration, 1)
      const ease = smootherstep(t)
      camera.position.lerpVectors(transition.fromPosition, transition.toPosition, ease)
      controls.target.lerpVectors(transition.fromTarget, transition.toTarget, ease)
      if (transition.pullback > 0) {
        // Between systems the camera pulls back and swoops in again, rather than sliding sideways.
        const lift = 1 + transition.pullback * Math.sin(Math.PI * ease)
        camera.position.sub(controls.target).multiplyScalar(lift).add(controls.target)
      }
      if (t >= 1) transition = undefined
    }
    arrive()
    controls.update(delta)
    camera.updateMatrixWorld()
  }

  function updateSpeed(delta: number) {
    const target = paused ? 0 : 1
    speed = reducedMotion.matches ? target : approach(speed, target, paused ? STOP_RATE : START_RATE, delta)
    if (Math.abs(speed - target) < 0.002) speed = target
  }

  function updateTelemetry(delta: number) {
    telemetryTimer += delta
    if (active < 0 || telemetryTimer < TELEMETRY_INTERVAL) return
    telemetryTimer = 0
    sampleSystem(systems[active], clock.time, marker, velocity)
    sampleSystem(systems[0], clock.time, sun)
    options.onTelemetry({
      radius: Math.hypot(marker.x, marker.z) * LY_PER_UNIT,
      height: marker.y * LY_PER_UNIT,
      speed: toKms(velocity.length()),
      separation: marker.distanceTo(sun) * LY_PER_UNIT,
    })
  }

  function markCore() {
    const visible = callouts.locate(marker.copy(core))
    coreLabel.hidden = !visible
    if (!visible) return
    coreLabel.style.transform = `translate3d(${marker.x.toFixed(1)}px, ${marker.y.toFixed(1)}px, 0)`
    callouts.reserve(marker.x - 8, marker.y + 14, marker.x + 150, marker.y + 46)
  }

  function updateAnnotations(time: number) {
    callouts.begin(width, height, obstacles)
    const overview = active < 0 && showLabels
    for (let index = 0; index < systemLabels.length; index++) {
      if (!overview) systemLabels[index].element.hidden = true
      else {
        sampleSystem(systems[index], time, marker)
        callouts.place(systemLabels[index], marker)
      }
    }
    if (overview) markCore()
    else coreLabel.hidden = true

    const mapLabels = overview && !transition
    for (let index = 0; index < armLabels.length; index++) {
      const label = armLabels[index]
      if (!mapLabels || !view.armLabels) {
        label.element.hidden = true
        continue
      }
      if (index < arms.length) {
        const spin = time * labelSpeed(arms[index])
        const [x, y, z] = armPositions[index]
        marker.set(x * Math.cos(spin) - z * Math.sin(spin), y, x * Math.sin(spin) + z * Math.cos(spin))
      } else {
        const angle = BAR_AZIMUTH + time * BAR_SPEED
        marker.set(BAR_LABEL_RADIUS * Math.cos(angle), 4, BAR_LABEL_RADIUS * Math.sin(angle))
      }
      callouts.place(label, marker)
    }
    for (let index = 0; index < ringLabels.length; index++) {
      const label = ringLabels[index]
      if (!mapLabels || !view.rings) {
        label.element.hidden = true
        continue
      }
      const radius = RING_RADII_KPC[index] * UNITS_PER_KPC
      marker.set(radius * Math.cos(RING_LABEL_AZIMUTH), -3.5, radius * Math.sin(RING_LABEL_AZIMUTH))
      callouts.place(label, marker)
    }

    for (let index = 0; index < skyLabels.length; index++) {
      const label = skyLabels[index]
      if (!showLabels || !view.skyLabels || !view.photographs || transition) {
        label.element.hidden = true
        continue
      }
      callouts.place(label, sky.locate(index, camera.position, marker))
    }

    if (active >= 0) {
      const system = systems[active]
      for (let index = 0; index < system.bodies.length; index++) {
        const label = bodyLabels[active][index]
        if (showLabels && !transition) {
          sampleSystem(system, time, marker)
          const [x, y, z] = bodyOffset(system.bodies[index], time)
          marker.set(marker.x + x, marker.y + y, marker.z + z)
          callouts.place(label, marker)
        } else label.element.hidden = true
      }
    }
  }

  function render(now: number) {
    const delta = lastFrame === undefined ? 0 : Math.max(0, (now - lastFrame) / 1000)
    lastFrame = now
    if (document.hidden) return
    const cameraDelta = Math.min(delta, 0.12)
    updateSpeed(cameraDelta)
    if (speed > 0) clock.advance(delta, rate * speed)
    options.onFrame(clock.time, cameraDelta)
    updateCamera(cameraDelta)
    updateTelemetry(cameraDelta)
    obstacleTimer += cameraDelta
    if (obstacleTimer >= OBSTACLE_INTERVAL) {
      obstacleTimer = 0
      measureObstacles()
    }
    orbits.setTime(clock.time)
    const gainTarget = (active < 0 ? 1 : 0.34) * view.dust / 100
    const settle = 1 - Math.exp(-cameraDelta * 4)
    galaxy.gain.value += (gainTarget - galaxy.gain.value) * settle
    galaxy.closeup.value += ((active < 0 ? 0 : 1) - galaxy.closeup.value) * settle
    const fullDetail = view.quality !== 'smooth' && scale > 0.78
    const lit = galaxy.gain.value > 0.008
    galaxy.layers[0].visible = fullDetail && lit
    galaxy.layers[1].visible = lit
    galaxy.layers[2].visible = fullDetail && lit
    galaxy.layers[1].material.uniforms.uIntensity.value = fullDetail ? 0.58 : 0.92
    galaxy.sky.visible = view.stars
    galaxy.rings.visible = view.rings && active < 0
    orbits.ribbons.visible = view.trails
    orbits.uniforms.uSystemFrame.value = active >= 0 && view.frame === 'system'
    sky.update(camera.position, view.photographs)
    galaxy.setTime(clock.time)
    updateAnnotations(clock.time)
    composer.render(cameraDelta)
    if (firstFrame) {
      firstFrame = false
      options.onFirstRender()
    }

    if (delta > 0 && delta < 2) {
      fpsFrames++
      fpsDuration += delta
      if (fpsDuration >= 0.65) {
        options.onFps(Math.round(fpsFrames / fpsDuration))
        fpsDuration = 0
        fpsFrames = 0
      }
      frameAverage += (Math.min(0.1, delta) - frameAverage) * 0.04
      qualityTimer += delta
      if (view.quality === 'auto' && qualityTimer >= 2 && frameAverage > 0.0205 && scale > 0.68) {
        qualityTimer = 0
        scale = Math.max(0.68, scale - 0.16)
        // The overlays remain in CSS pixels while the GPU resolution adapts.
        resize()
      }
    }
  }

  controls.addEventListener('start', () => {
    interacting = true
    idle = 0
    if (transition) {
      transition = undefined
      // Keep the camera where it was grabbed mid-flight by adopting its current pivot.
      if (active >= 0) {
        lead.direction.subVectors(controls.target, center)
        lead.ratio = lead.direction.length() / Math.max(camera.position.distanceTo(controls.target), 1e-6)
        lead.direction.normalize()
      }
    }
    options.onTakeover()
  })
  controls.addEventListener('end', () => {
    interacting = false
    idle = 0
  })
  canvas.addEventListener('webglcontextlost', () => {
    renderer.setAnimationLoop(null)
    options.onContextLost()
  })
  new ResizeObserver(resize).observe(viewport)
  document.addEventListener('visibilitychange', () => { lastFrame = undefined })
  resize()
  focus(-1, false)
  renderer.setAnimationLoop(render)

  return {
    focus,
    setViewSettings(settings: ViewSettings) {
      const qualityChanged = settings.quality !== view.quality
      view = settings
      if (bloom) {
        bloom.strength = settings.bloom / 100
        bloom.enabled = settings.bloom > 0
      }
      if (antialias) antialias.enabled = settings.quality !== 'smooth'
      if (qualityChanged) {
        scale = 1
        frameAverage = 1 / 60
        qualityTimer = 0
        resize()
      }
    },
    setRate(value: number) { rate = value },
    setPaused(value: boolean) { paused = value },
    setTrail(value: number) { orbits.uniforms.uTrailSeconds.value = value },
    setLabels(value: boolean) { showLabels = value },
    reset() {
      clock.reset()
      focus(-1, false)
    },
  }
}
