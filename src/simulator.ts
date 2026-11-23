import {
  ACESFilmicToneMapping, Color, Group, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { createCalloutLayout, type Callout } from './callouts'
import { SimulationClock } from './clock'
import { createDeepSky } from './deep-sky'
import { createGalaxy } from './galaxy'
import { createOrbits } from './orbits'
import { skyCatalog } from './sky-catalog'
import { armAnchor, arms, BAR_AZIMUTH, PATTERN_SPEED } from './spiral-map'
import { sampleBody, sampleSystem, systems } from './systems'
import { formatTime } from './timeline'
import { createTrailAxis } from './trail-axis'
import { defaultViewSettings, type ViewSettings } from './view-settings'

interface SimulatorOptions {
  canvas: HTMLCanvasElement
  labels: HTMLButtonElement[]
  coreLabel: HTMLElement
  bodyLabels: Callout[][]
  timeLabels: Callout[]
  armLabels: Callout[]
  skyLabels: Callout[]
  onFrame: (time: number, delta: number) => void
  onFps: (fps: number) => void
  onSkyZoom: (degrees: number) => void
  onTakeover: () => void
  onContextLost: () => void
  onFirstRender: () => void
}

interface Transition {
  elapsed: number
  fromPosition: Vector3
  fromTarget: Vector3
  toPosition: Vector3
  toTarget: Vector3
}

const overviewPosition = new Vector3(236, 390, 398)
const overviewTarget = new Vector3(0, -25, 0)
const northPosition = new Vector3(0, 725, 0.01)

export function createSimulator(options: SimulatorOptions) {
  const { canvas, labels, coreLabel, bodyLabels, timeLabels, armLabels, skyLabels } = options
  const viewport = canvas.parentElement!
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const scene = new Scene()
  scene.background = new Color('#080c24')
  const camera = new PerspectiveCamera(46, 1, 0.6, 6900)
  const renderer = new WebGLRenderer({ canvas, powerPreference: 'high-performance', alpha: false })
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.13
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.11
  controls.enablePan = false
  controls.rotateSpeed = 0.62
  controls.zoomSpeed = 0.76
  controls.minDistance = 14
  controls.maxDistance = 2150
  controls.minPolarAngle = 0.07
  controls.maxPolarAngle = Math.PI - 0.07

  const galaxy = createGalaxy()
  const sky = createDeepSky()
  const orbits = createOrbits(systems)
  const trailAxis = createTrailAxis()
  const diskScene = new Group()
  diskScene.add(...galaxy.objects, ...orbits.meshes, trailAxis.line)
  scene.add(sky.atlas, galaxy.sky, diskScene)
  const hdr = renderer.extensions.has('EXT_color_buffer_float')
  const target = hdr ? undefined : new WebGLRenderTarget(1, 1)
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = hdr ? new UnrealBloomPass(new Vector2(1, 1), 0.69, 0.69, 0.72) : undefined
  const antialias = hdr ? new SMAAPass() : undefined
  if (bloom && antialias) {
    composer.addPass(bloom)
    composer.addPass(antialias)
  }
  composer.addPass(new OutputPass())

  const clock = new SimulationClock()
  const marker = new Vector3()
  const callouts = createCalloutLayout(camera, armLabels.length + skyLabels.length + labels.length + 1
    + Math.max(...bodyLabels.map(group => group.length)) + timeLabels.length)
  const armPositions = arms.map(arm => armAnchor(arm, 0))
  const center = new Vector3()
  const previousCenter = new Vector3()
  const displacement = new Vector3()
  const core = new Vector3()
  let transition: Transition | undefined
  let active = -1
  let skyTarget = -1
  let view = defaultViewSettings
  let fieldOfView = 46
  let showLabels = true
  let showTimeMarks = true
  let width = 1
  let height = 1
  let scale = 1
  let rate = 1
  let paused = reducedMotion.matches
  let lastFrame: number | undefined
  let frameAverage = 1 / 60
  let qualityTimer = 0
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
  }

  function framing(index: number, north: boolean) {
    if (index < 0) return {
      position: (north ? northPosition : overviewPosition).clone().sub(overviewTarget)
        .multiplyScalar(Math.max(1, 1.08 / camera.aspect)).add(overviewTarget),
      target: overviewTarget.clone(),
    }
    const system = systems[index]
    const position = new Vector3()
    const tangent = new Vector3()
    sampleSystem(system, clock.time, position, tangent)
    const outward = new Vector3().crossVectors(camera.up, tangent).normalize()
    const target = position.clone().addScaledVector(tangent, -6.8)
    position.addScaledVector(outward, system.viewDistance * 0.87)
      .addScaledVector(camera.up, system.viewDistance * 0.58)
      .addScaledVector(tangent, system.viewDistance * 0.19)
    position.sub(target).multiplyScalar(Math.max(1, 0.96 / camera.aspect)).add(target)
    return { position, target }
  }

  function select(index: number, target: number) {
    if (active !== index && active >= 0) {
      for (const label of bodyLabels[active]) label.element.hidden = true
    }
    active = index
    skyTarget = target
    diskScene.visible = skyTarget < 0
    controls.enableZoom = skyTarget < 0
    controls.minDistance = skyTarget < 0 ? 14 : 0.1
    fieldOfView = skyTarget < 0 ? 46 : skyCatalog[skyTarget].fieldOfView
    orbits.uniforms.uFocus.value = index
    if (index >= 0) sampleSystem(systems[index], clock.time, previousCenter)
  }

  function moveCamera(destination: { position: Vector3, target: Vector3 }, animate: boolean) {
    if (animate && !reducedMotion.matches) {
      transition = {
        elapsed: 0,
        fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
        toPosition: destination.position, toTarget: destination.target,
      }
    } else {
      transition = undefined
      camera.fov = fieldOfView
      camera.updateProjectionMatrix()
      camera.position.copy(destination.position)
      controls.target.copy(destination.target)
      controls.update()
    }
  }

  function focus(index: number, animate = true, north = false) {
    select(index, -1)
    moveCamera(framing(index, north), animate)
  }

  function focusSky(index: number) {
    select(-1, index)
    const target = new Vector3()
    sampleSystem(systems[0], 0, target)
    const position = target.clone().addScaledVector(sky.directions[index], -0.16)
    moveCamera({ position, target }, true)
  }

  function setSkyZoom(value: number) {
    fieldOfView = Math.min(60, Math.max(3, value))
    if (reducedMotion.matches) {
      camera.fov = fieldOfView
      camera.updateProjectionMatrix()
    }
    options.onSkyZoom(fieldOfView)
  }

  function updateCamera(delta: number) {
    if (active >= 0) {
      sampleSystem(systems[active], clock.time, center)
      displacement.subVectors(center, previousCenter)
      previousCenter.copy(center)
      if (transition) {
        transition.toPosition.add(displacement)
        transition.toTarget.add(displacement)
      } else {
        camera.position.add(displacement)
        controls.target.add(displacement)
      }
    }

    if (transition) {
      transition.elapsed += delta
      const t = Math.min(transition.elapsed / 1.55, 1)
      const ease = t * t * (3 - 2 * t)
      camera.position.lerpVectors(transition.fromPosition, transition.toPosition, ease)
      controls.target.lerpVectors(transition.fromTarget, transition.toTarget, ease)
      if (t >= 1) transition = undefined
    }
    if (Math.abs(fieldOfView - camera.fov) > 0.015) {
      camera.fov += (fieldOfView - camera.fov) * (1 - Math.exp(-delta * 6.6))
      camera.updateProjectionMatrix()
    }
    controls.rotateSpeed = skyTarget < 0 ? 0.62 : Math.min(0.62, camera.fov / 82)
    controls.update(delta)
    camera.updateMatrixWorld()
  }

  function project(element: HTMLElement, position: Vector3) {
    position.project(camera)
    const visible = position.z > -1 && position.z < 1 && Math.abs(position.x) < 0.91 && Math.abs(position.y) < 0.85
    const x = (position.x + 1) * width * 0.5
    const y = (1 - position.y) * height * 0.5
    element.hidden = !visible || y < (width < 600 ? 111 : 138)
    if (!element.hidden) {
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      element.dataset.align = x > width - 148 ? 'left' : 'right'
      const left = element.dataset.align === 'left' ? x - 125 : x - 8
      callouts.reserve(left, y - 12, left + 136, y + 15)
    }
  }

  function updateAnnotations(time: number) {
    callouts.begin(width, height)
    for (let index = 0; index < labels.length; index++) {
      if (active >= 0 || skyTarget >= 0 || !showLabels) labels[index].hidden = true
      else {
        sampleSystem(systems[index], time, marker)
        project(labels[index], marker)
      }
    }
    if (active >= 0 || skyTarget >= 0 || !showLabels) coreLabel.hidden = true
    else project(coreLabel, marker.copy(core))

    const spin = time * PATTERN_SPEED
    const cos = Math.cos(spin)
    const sin = Math.sin(spin)
    for (let index = 0; index < armLabels.length; index++) {
      const label = armLabels[index]
      if (!showLabels || !view.armLabels || active >= 0 || skyTarget >= 0 || transition) {
        label.element.hidden = true
        continue
      }
      if (index < arms.length) {
        const [x, y, z] = armPositions[index]
        marker.set(x * cos - z * sin, y, x * sin + z * cos)
      } else {
        const angle = BAR_AZIMUTH + spin
        marker.set(30 * Math.cos(angle), 4, 30 * Math.sin(angle))
      }
      callouts.place(label, marker, false, 112)
    }

    for (let index = 0; index < skyLabels.length; index++) {
      const label = skyLabels[index]
      if (!showLabels || !view.skyLabels || transition || skyTarget === index) {
        label.element.hidden = true
        continue
      }
      marker.copy(camera.position).addScaledVector(sky.directions[index], sky.photoRadius)
      callouts.place(label, marker, false, skyTarget >= 0 ? 30 : 112)
    }

    if (active >= 0) {
      const system = systems[active]
      for (let index = 0; index < system.bodies.length; index++) {
        const label = bodyLabels[active][index]
        if (showLabels && !transition) {
          sampleBody(system, system.bodies[index], time, marker)
          callouts.place(label, marker)
        } else label.element.hidden = true
      }
    }

    const axisVisible = active >= 0 && showTimeMarks && view.frame === 'galactic' && view.trails && !transition
    trailAxis.line.visible = axisVisible
    if (!axisVisible) {
      for (const label of timeLabels) label.element.hidden = true
      return
    }
    const system = systems[active]
    const trailSeconds = orbits.uniforms.uTrailSeconds.value
    trailAxis.update(system, time, trailSeconds)
    const interval = Math.ceil(trailSeconds / timeLabels.length)
    const lastMark = Math.floor((time - 0.65) / interval) * interval
    for (let index = 0; index < timeLabels.length; index++) {
      const label = timeLabels[index]
      const mark = lastMark - index * interval
      if (time - mark > trailSeconds) {
        label.element.hidden = true
        continue
      }
      const stamp = formatTime(mark)
      if (label.caption.textContent !== stamp) label.caption.textContent = stamp
      sampleSystem(system, mark, marker)
      callouts.place(label, marker, true)
    }
  }

  function render(now: number) {
    const delta = lastFrame === undefined ? 0 : Math.max(0, (now - lastFrame) / 1000)
    lastFrame = now
    if (document.hidden) return
    const cameraDelta = Math.min(delta, 0.12)
    if (!paused) clock.advance(delta, rate)
    options.onFrame(clock.time, cameraDelta)
    updateCamera(cameraDelta)
    orbits.setTime(clock.time)
    const dustTarget = (active < 0 ? 1 : 0.42) * view.dust / 100
    galaxy.dustGain.value += (dustTarget - galaxy.dustGain.value) * (1 - Math.exp(-cameraDelta * 4))
    const fullDust = view.quality !== 'smooth' && scale > 0.78
    galaxy.dust[0].visible = fullDust && galaxy.dustGain.value > 0.008
    galaxy.dust[1].visible = galaxy.dustGain.value > 0.008
    galaxy.dust[2].visible = fullDust && galaxy.dustGain.value > 0.008
    galaxy.dust[1].material.uniforms.uIntensity.value = fullDust ? 0.58 : 0.92
    galaxy.sky.visible = skyTarget < 0 && view.stars
    galaxy.rings.visible = view.rings && active < 0
    orbits.ribbons.visible = view.trails
    orbits.uniforms.uSystemFrame.value = active >= 0 && view.frame === 'system'
    sky.update(camera.position, skyTarget, view.survey, view.photographs)
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
    if (skyTarget < 0) transition = undefined
    options.onTakeover()
  })
  canvas.addEventListener('wheel', event => {
    if (skyTarget < 0 || event.ctrlKey) return
    event.preventDefault()
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1)
    setSkyZoom(fieldOfView * Math.exp(Math.min(1, Math.max(-1, pixels / 620))))
  }, { passive: false })
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
    focusSky,
    setSkyZoom,
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
    setTimeMarks(value: boolean) { showTimeMarks = value },
    seek(time: number) { clock.seek(time) },
    reset() {
      clock.reset()
      focus(-1, false)
    },
  }
}
