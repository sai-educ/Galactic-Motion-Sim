import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, GLSL3,
  Group, LinearFilter, LineBasicMaterial, LineLoop, Mesh, PlaneGeometry, Points, RepeatWrapping, ShaderMaterial,
} from 'three'
import { blackbodyColor, GALACTIC_SPEED, SOLAR_AZIMUTH, TAU, UNITS_PER_KPC } from './astro'
import {
  armProfile, armRadius, arms, BAR_AZIMUTH, BAR_REACH, BAR_SPEED, DISK_EDGE, PATTERN_SPEED, RING_RADII_KPC,
} from './spiral-map'
import { randomSequence } from './systems'

// Bland-Hawthorn & Gerhard (2016): the thin disk's starlight falls off with a 2.6 ± 0.5 kpc scale length.
const DISK_SCALE_LENGTH = 2.9 * UNITS_PER_KPC
const STAR_COUNT = 150_000
const SKY_STAR_COUNT = 10_000
const STAR_SATURATION = 1.5

const profileCoordinates = /* glsl */ `
  uniform sampler2D uArms;
  uniform float uPhase;
  uniform float uBarPhase;
  vec2 armUv(float theta, float radius) {
    return vec2((theta - ${SOLAR_AZIMUTH.toFixed(5)}) / 6.283185307, radius / ${DISK_EDGE.toFixed(1)});
  }
  // The outer arms follow the spiral pattern while the lanes inside the bar's reach turn with the bar.
  vec3 armProfile(float theta, float radius) {
    vec3 spiral = texture(uArms, armUv(theta - uPhase, radius)).rgb;
    vec3 inner = texture(uArms, armUv(theta - uBarPhase, radius)).rgb;
    return mix(inner, spiral, smoothstep(${(BAR_REACH - 8).toFixed(1)}, ${(BAR_REACH + 12).toFixed(1)}, radius));
  }
`

/** Star colors come from black-body temperatures drawn for each stellar population. */
function temperatureColors(random: () => number) {
  const cache = new Map<number, Color>()
  const color = (kelvin: number) => {
    const key = Math.round(kelvin / 250) * 250
    let value = cache.get(key)
    if (!value) {
      // Black-body tints are pale. A modest saturation lift keeps hot and cool stars distinct once thousands overlap.
      const hsl = { h: 0, s: 0, l: 0 }
      value = new Color(blackbodyColor(key))
      value.getHSL(hsl)
      value.setHSL(hsl.h, Math.min(1, hsl.s * STAR_SATURATION), hsl.l * 0.92)
      cache.set(key, value)
    }
    return value
  }
  const between = (low: number, high: number) => low + random() * (high - low)
  return {
    // Old giants dominate the bulge and bar.
    bulge: () => color(between(3600, 5200)),
    disk: () => color(between(3800, 6600)),
    // Spiral arms hold the short-lived hot stars, with a few red supergiants among them.
    arm: () => {
      const draw = random()
      return color(draw < 0.58 ? between(7500, 24000) : draw < 0.86 ? between(5000, 7200) : between(3400, 4200))
    },
    sky: () => {
      const draw = random()
      return color(draw < 0.12 ? between(8000, 20000) : draw < 0.6 ? between(5200, 7500) : between(3300, 5000))
    },
  }
}

function stellarPoints(count: number, sky: boolean, profile: DataTexture) {
  const random = randomSequence(sky ? 359031 : 59787)
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(0.00001, random()))) * Math.cos(TAU * random())
  const colors = temperatureColors(random)
  const position = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  // Point size, brightness, and whether the star belongs to the rigidly turning bar.
  const properties = new Float32Array(count * 3)
  const barCos = Math.cos(BAR_AZIMUTH)
  const barSin = Math.sin(BAR_AZIMUTH)
  for (let i = 0; i < count; i++) {
    const sample = random()
    let tint: Color
    if (sky) {
      const theta = random() * TAU
      const vertical = random() * 2 - 1
      const radius = 3700 + random() * 1600
      const horizontal = Math.sqrt(1 - vertical * vertical) * radius
      position.set([Math.cos(theta) * horizontal, vertical * radius, Math.sin(theta) * horizontal], i * 3)
      tint = colors.sky()
      properties.set([0.65 + sample ** 10 * 2.6, 0.045 + sample ** 6 * 0.68, 0], i * 3)
    } else if (sample < 0.17) {
      // A long thin bar wrapped around a thicker, boxy bulge (Wegg et al. 2015).
      const long = sample < 0.07
      const along = gaussian() * (long ? 31 : 15)
      const across = gaussian() * (long ? 6.5 : 10)
      position.set([along * barCos - across * barSin, gaussian() * (long ? 2.3 : 6.4), along * barSin + across * barCos], i * 3)
      tint = colors.bulge()
      const bright = random() ** 12
      properties.set([0.6 + bright * 1.5, 0.028 + 0.25 * bright, 1], i * 3)
    } else {
      const armIndex = i % 6
      const arm = arms[armIndex]
      const isDisk = sample > 0.62
      const beta = arm.extent[0] + random() * (arm.extent[1] - arm.extent[0])
      const spread = gaussian()
      const centerline = armRadius(arm, beta) * UNITS_PER_KPC
      const armDistance = Math.max(4, Math.min(DISK_EDGE, centerline + (3 + arm.width * UNITS_PER_KPC) * spread))
      // An exponential surface density: the sum of two exponential draws is the radial distribution.
      const diskDistance = Math.min(DISK_EDGE - 6, -DISK_SCALE_LENGTH * Math.log(Math.max(1e-6, random() * random())))
      const radius = isDisk ? diskDistance : armDistance
      const angle = isDisk ? random() * TAU : SOLAR_AZIMUTH + beta * TAU / 360 + spread * 0.031
      const y = gaussian() * (isDisk ? 2.6 + radius * 0.008 : 1.5 + radius * 0.006)
      position.set([Math.cos(angle) * radius, y, Math.sin(angle) * radius], i * 3)
      tint = isDisk ? colors.disk() : colors.arm()
      const bright = random() ** 12
      const clump = 0.62 + 0.38 * Math.sin(radius * 0.17 + armIndex * 2) ** 2
      const taper = isDisk ? 0.6 : Math.exp(-Math.max(0, radius - 150) / 150)
      properties.set([0.6 + bright * 1.5, (0.022 + 0.25 * bright) * clump * taper, 0], i * 3)
    }
    tint.toArray(color, i * 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('aColor', new BufferAttribute(color, 3))
  geometry.setAttribute('aProperties', new BufferAttribute(properties, 3))
  const material = new ShaderMaterial({
    glslVersion: GLSL3, transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPhase: { value: 0 }, uBarPhase: { value: 0 }, uDpr: { value: 1 },
      uSky: { value: sky ? 1 : 0 }, uArms: { value: profile } },
    vertexShader: profileCoordinates + /* glsl */ `
      in vec3 aColor;
      in vec3 aProperties;
      uniform float uTime;
      uniform float uDpr;
      uniform float uSky;
      out vec3 vColor;
      out float vIntensity;
      out float vGlint;
      void main() {
        vec3 world = position;
        float armLight = 1.0;
        if (uSky < 0.5) {
          float r = length(position.xz);
          // Disk stars share one orbital speed (a flat rotation curve). The bar turns as a solid figure.
          float turn = mix(uTime * ${GALACTIC_SPEED.toFixed(2)} / max(27.0, r), uBarPhase, aProperties.z);
          float theta = atan(position.z, position.x + 0.000001) + turn;
          world.xz = vec2(cos(theta), sin(theta)) * r;
          vec3 profile = armProfile(theta, r);
          float inArms = smoothstep(28.0, 75.0, r) * (1.0 - aProperties.z);
          armLight = mix(1.0, (0.16 + 1.4 * profile.r * profile.r) * (1.0 - 0.7 * profile.b), inArms);
        }
        vec4 view = modelViewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * view;
        float zoom = mix(clamp(390.0 / max(1.0, -view.z), 0.62, 1.32), 1.0, uSky);
        vGlint = uSky * smoothstep(2.7, 3.2, aProperties.x);
        gl_PointSize = max(1.0, (aProperties.x * zoom + 8.0 * vGlint) * uDpr);
        vColor = aColor;
        vIntensity = aProperties.y * armLight;
      }
    `,
    fragmentShader: /* glsl */ `
      in vec3 vColor;
      in float vIntensity;
      in float vGlint;
      out vec4 fragColor;
      void main() {
        vec2 offset = gl_PointCoord * 2.0 - 1.0;
        float radius = dot(offset, offset);
        float spot = (1.0 - smoothstep(0.25, 1.0, radius)) * exp(-1.5 * radius);
        vec2 p = abs(offset);
        float rays = exp(-p.x * 35.0 - p.y * 4.7) + exp(-p.y * 35.0 - p.x * 4.1);
        float glint = vGlint * (rays * 0.37 + exp(-radius * 57.0) * 1.9);
        fragColor = vec4(vColor * (spot * (1.0 - vGlint) + glint), vIntensity);
      }
    `,
  })
  return new Points(geometry, material)
}

const noise = /* glsl */ `
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), u.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.53;
    for (int i = 0; i < 5; i++) {
      total += amplitude * noise(p);
      p = mat2(1.63, 1.21, -1.21, 1.63) * p + 2.17;
      amplitude *= 0.51;
    }
    return total;
  }
`

interface Shared {
  gain: { value: number }
  /** 0 in the overview and 1 beside a system, where fine cloud detail would turn into large blotches. */
  closeup: { value: number }
  phase: { value: number }
  barPhase: { value: number }
  profile: DataTexture
}

/** One sheet of the disk's diffuse light: unresolved starlight, glowing gas, and the dust that dims both. */
function diskLayer(height: number, intensity: number, shared: Shared) {
  const geometry = new PlaneGeometry(650, 650).rotateX(-Math.PI / 2)
  const material = new ShaderMaterial({
    glslVersion: GLSL3, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    uniforms: { uIntensity: { value: intensity }, uLayer: { value: height }, uGain: shared.gain, uCloseup: shared.closeup, uPhase: shared.phase,
      uBarPhase: shared.barPhase, uArms: { value: shared.profile } },
    vertexShader: /* glsl */ `
      out vec2 vDisk;
      void main() {
        vDisk = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: noise + profileCoordinates + /* glsl */ `
      uniform float uIntensity;
      uniform float uLayer;
      uniform float uGain;
      uniform float uCloseup;
      in vec2 vDisk;
      out vec4 fragColor;
      vec2 turned(vec2 v, float angle) {
        float c = cos(angle), s = sin(angle);
        return vec2(c * v.x + s * v.y, c * v.y - s * v.x);
      }
      void main() {
        float r = length(vDisk);
        if (r > ${DISK_EDGE.toFixed(1)}) discard;
        // Clouds are painted in the frame of the spiral pattern so they travel with the arms.
        vec2 disk = turned(vDisk, uPhase);
        float theta = atan(vDisk.y, vDisk.x + 0.0001);
        vec2 p = disk * 0.074 + uLayer * vec2(0.071, 0.12);
        float cloud = fbm(p);
        float fine = fbm(p * 2.1 + 8.5);
        vec3 profile = armProfile(theta + (cloud - 0.5) * 0.09, r + (fine - 0.5) * 9.0);
        float ridge = profile.r;
        float lane = smoothstep(0.24, 0.66, fbm(p * 0.85 + vec2(5.7, 10.3))) * profile.b;
        float edge = 1.0 - smoothstep(190.0 + 45.0 * cloud, 300.0, r);
        float outside = smoothstep(24.0, 76.0, r);
        float crest = pow(ridge, 1.8);
        float billow = 0.3 + 2.2 * cloud * fine;

        // Young blue-white stars and the gas they light up trace the arms.
        vec3 young = (vec3(0.13, 0.30, 0.86) * crest * billow * 0.6
          + vec3(0.46, 0.62, 1.0) * crest * crest * billow * billow * 0.42) * outside;
        // Hydrogen ionized by the hottest stars glows pink in scattered nurseries along the arms.
        // Warping the lookup scatters them, since evenly spaced knots would read as a pattern.
        vec2 scattered = p + 2.6 * vec2(cloud, fine);
        float nursery = smoothstep(0.60, 0.72, fbm(turned(scattered, 0.6) * 1.3 + 31.0))
          * smoothstep(0.50, 0.68, fbm(turned(scattered, 2.1) * 3.7 + 17.0));
        vec3 ionized = vec3(1.0, 0.12, 0.26) * nursery * crest * outside * 2.0 * (1.0 - 0.88 * uCloseup);
        // Older, cooler stars fill the whole disk with a warm glow that fades exponentially outward.
        vec3 old = vec3(1.0, 0.56, 0.26) * exp(-r / ${DISK_SCALE_LENGTH.toFixed(1)}) * (0.3 + 0.3 * cloud) * (0.5 + 0.5 * profile.g)
          + vec3(0.030, 0.052, 0.13) * exp(-r / 150.0) * (0.4 + profile.g);
        // Dust lanes on the arms' inner edges dim the light behind them and redden what gets through.
        vec3 dust = mix(vec3(1.0), vec3(0.55, 0.26, 0.12), lane) * (1.0 - 0.82 * lane);

        vec2 bar = turned(vDisk, ${BAR_AZIMUTH.toFixed(5)} + uBarPhase);
        float barRadius = length(bar * vec2(0.52, 1.9));
        float bulge = length(bar * vec2(0.86, 1.2));
        vec3 center = vec3(1.0, 0.66, 0.34) * exp(-barRadius / 23.0) * 0.5 * (0.5 + cloud) * (1.0 - lane * 0.6)
          + vec3(1.0, 0.82, 0.56) * exp(-bulge * bulge / 150.0) * 1.5;
        vec3 haze = vec3(0.006, 0.012, 0.040) * exp(-r / 199.0) * (0.65 + cloud * 0.9);

        vec3 light = ((young + ionized + old) * dust + haze) * edge + center;
        fragColor = vec4(light * uIntensity * uGain, 1.0);
      }
    `,
  })
  const mesh = new Mesh(geometry, material)
  mesh.position.y = height
  return mesh
}

function referenceRings() {
  const group = new Group()
  for (const kpc of RING_RADII_KPC) {
    const radius = kpc * UNITS_PER_KPC
    const points = new Float32Array(360 * 3)
    for (let i = 0; i < 360; i++) {
      const theta = (i / 360) * TAU
      points.set([Math.cos(theta) * radius, -3.5, Math.sin(theta) * radius], i * 3)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(points, 3))
    group.add(new LineLoop(geometry, new LineBasicMaterial({
      color: '#6fb6c4', transparent: true, opacity: 0.2, depthWrite: false, blending: AdditiveBlending,
    })))
  }
  return group
}

export function createGalaxy() {
  const profile = new DataTexture(armProfile(512, 256), 512, 256)
  profile.wrapS = RepeatWrapping
  profile.minFilter = LinearFilter
  profile.magFilter = LinearFilter
  profile.needsUpdate = true
  const disk = stellarPoints(STAR_COUNT, false, profile)
  const sky = stellarPoints(SKY_STAR_COUNT, true, profile)
  const shared: Shared = { gain: { value: 1 }, closeup: { value: 0 }, phase: { value: 0 }, barPhase: { value: 0 }, profile }
  sky.renderOrder = -4
  const lower = diskLayer(-4.5, 0.30, shared)
  const middle = diskLayer(0, 0.58, shared)
  const upper = diskLayer(4.5, 0.22, shared)
  lower.renderOrder = -3
  middle.renderOrder = -2
  upper.renderOrder = -1
  const rings = referenceRings()
  function setTime(time: number) {
    shared.phase.value = time * PATTERN_SPEED % TAU
    shared.barPhase.value = time * BAR_SPEED % TAU
    disk.material.uniforms.uPhase.value = shared.phase.value
    disk.material.uniforms.uBarPhase.value = shared.barPhase.value
    disk.material.uniforms.uTime.value = time
  }
  const layers = [lower, middle, upper]
  return { objects: [...layers, disk, rings], layers, disk, sky, rings, gain: shared.gain, closeup: shared.closeup, setTime }
}
