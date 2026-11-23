import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, DoubleSide, GLSL3,
  Group, LinearFilter, LineBasicMaterial, LineLoop, Mesh, PlaneGeometry, Points, RepeatWrapping, ShaderMaterial,
} from 'three'
import { GALACTIC_SPEED, randomSequence, systems, TAU } from './systems'
import { armProfile, armRadius, arms, BAR_AZIMUTH, DISK_EDGE, PATTERN_SPEED, UNITS_PER_KPC } from './spiral-map'

const PALETTES = ['#b7c7ff', '#8ea5f0', '#f3bfbc', '#ebcfad', '#c7aeea'].map(hex => new Color(hex))
const SOLAR_AZIMUTH = systems[0].angle
const profileCoordinates = /* glsl */ `
  vec2 armUv(float theta, float radius) {
    return vec2((theta - ${SOLAR_AZIMUTH.toFixed(5)}) / 6.283185307, radius / ${DISK_EDGE.toFixed(1)});
  }
`

function stellarPoints(count: number, sky: boolean, profile: DataTexture) {
  const random = randomSequence(sky ? 359031 : 59787)
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(0.00001, random()))) * Math.cos(TAU * random())
  const position = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  const properties = new Float32Array(count * 3)
  const tint = new Color()
  for (let i = 0; i < count; i++) {
    const armIndex = i % 6
    const arm = arms[armIndex]
    const theta = random() * TAU
    const vertical = random() * 2 - 1
    const sample = random()
    if (sky) {
      const radius = 3700 + random() * 1600
      const horizontal = Math.sqrt(1 - vertical * vertical) * radius
      position.set([Math.cos(theta) * horizontal, vertical * radius, Math.sin(theta) * horizontal], i * 3)
      tint.copy(PALETTES[Math.floor(random() * PALETTES.length)])
      properties.set([0.65 + sample ** 10 * 2.6, 0.045 + sample ** 6 * 0.68, random() * TAU], i * 3)
    } else {
      const isBulge = sample < 0.11
      const isDisk = sample > 0.60
      const beta = arm.extent[0] + random() * (arm.extent[1] - arm.extent[0])
      const spread = gaussian()
      const centerline = armRadius(arm, beta) * UNITS_PER_KPC
      const armDistance = Math.max(4, Math.min(DISK_EDGE, centerline + (3 + arm.width * UNITS_PER_KPC) * spread))
      const radius = isBulge ? Math.abs(gaussian()) * 23 : isDisk ? 18 + Math.sqrt(random()) * 263 : armDistance
      const angle = isBulge || isDisk ? theta : SOLAR_AZIMUTH + beta * TAU / 360 + spread * 0.031
      const y = gaussian() * (isBulge ? 6.8 : 1.7 + radius * 0.008)
      position.set([Math.cos(angle) * radius, y, Math.sin(angle) * radius], i * 3)
      const warm = Math.exp(-radius / 49)
      tint.copy(PALETTES[armIndex % PALETTES.length]).lerp(PALETTES[3], warm * 0.93)
      const bright = random() ** 12
      const clump = 0.62 + 0.38 * Math.sin(radius * 0.17 + armIndex * 2) ** 2
      properties.set([0.60 + bright * 1.5, (0.022 + 0.25 * bright) * clump * (isDisk ? 0.42 : 1), random() * TAU], i * 3)
    }
    tint.toArray(color, i * 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('aColor', new BufferAttribute(color, 3))
  geometry.setAttribute('aProperties', new BufferAttribute(properties, 3))
  const material = new ShaderMaterial({
    glslVersion: GLSL3, transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPhase: { value: 0 }, uDpr: { value: 1 },
      uSky: { value: sky ? 1 : 0 }, uArms: { value: profile } },
    vertexShader: profileCoordinates + /* glsl */ `
      in vec3 aColor;
      in vec3 aProperties;
      uniform float uTime;
      uniform float uPhase;
      uniform float uDpr;
      uniform float uSky;
      uniform sampler2D uArms;
      out vec3 vColor;
      out float vIntensity;
      out float vGlint;
      void main() {
        vec3 world = position;
        float armLight = 1.0;
        if (uSky < 0.5) {
          float r = length(position.xz);
          float theta = atan(position.z, position.x + 0.000001) + uTime * ${GALACTIC_SPEED.toFixed(2)} / max(27.0, r);
          world.xz = vec2(cos(theta), sin(theta)) * r;
          float density = texture(uArms, armUv(theta - uPhase, r)).r;
          armLight = mix(1.0, 0.31 + 1.06 * density, smoothstep(28.0, 75.0, r));
        }
        vec4 view = modelViewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * view;
        float zoom = mix(clamp(390.0 / max(1.0, -view.z), 0.62, 1.32), 1.0, uSky);
        vGlint = uSky * smoothstep(2.7, 3.2, aProperties.x);
        gl_PointSize = max(1.0, (aProperties.x * zoom + 8.0 * vGlint) * uDpr);
        vColor = aColor;
        vIntensity = aProperties.y * armLight * (0.87 + 0.13 * sin(uTime * 0.9 + aProperties.z));
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

function dustLayer(height: number, intensity: number, gain: { value: number }, phase: { value: number }, profile: DataTexture) {
  const geometry = new PlaneGeometry(650, 650).rotateX(-Math.PI / 2)
  const material = new ShaderMaterial({
    glslVersion: GLSL3, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    uniforms: { uIntensity: { value: intensity }, uLayer: { value: height }, uGain: gain, uPhase: phase, uArms: { value: profile } },
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
      uniform float uPhase;
      uniform sampler2D uArms;
      in vec2 vDisk;
      out vec4 fragColor;
      void main() {
        float r = length(vDisk);
        if (r > 315.0) discard;
        float ct = cos(uPhase), st = sin(uPhase);
        vec2 disk = mat2(ct, -st, st, ct) * vDisk;
        float theta = atan(disk.y, disk.x + 0.0001);
        vec2 p = disk * 0.074 + uLayer * vec2(0.071, 0.12);
        float cloud = fbm(p);
        float fine = fbm(p * 3.7 + 8.5);
        float layer = smoothstep(24.0, 76.0, r);
        vec3 profile = texture(uArms, armUv(theta + (cloud - 0.5) * 0.081, r + (fine - 0.5) * 8.0)).rgb;
        float arms = profile.r;
        float broad = profile.g;
        float lane = smoothstep(0.28, 0.71, fbm(p * 0.85 + vec2(5.7, 10.3))) * profile.b;
        float edge = 1.0 - smoothstep(199.0 + 43.0 * cloud, 295.0, r);
        float armsLight = (arms * 0.51 + broad * 0.23) * edge * layer;
        float detail = pow(max(cloud * 0.63 + fine * 0.37, 0.0), 2.8);
        float absorption = 1.0 - 0.89 * lane;
        float tones = smoothstep(-0.7, 0.88, sin(theta * 2.0 + r * 0.031) + (cloud - 0.5));
        vec3 armColor = mix(vec3(0.115, 0.215, 0.58), vec3(0.48, 0.145, 0.39), tones);
        armColor = mix(armColor, vec3(0.74, 0.35, 0.24), exp(-r / 72.0) * 0.81);
        vec3 armsColor = armColor * armsLight * (0.13 + detail * 5.4) * absorption;
        float barCos = cos(${BAR_AZIMUTH.toFixed(5)});
        float barSin = sin(${BAR_AZIMUTH.toFixed(5)});
        vec2 bar = mat2(barCos, -barSin, barSin, barCos) * disk;
        float barRadius = length(bar * vec2(0.58, 1.9));
        float coreRadius = length(disk * vec2(0.94, 1.24));
        float warm = exp(-barRadius / 24.0) * 0.52;
        float nucleus = exp(-coreRadius * coreRadius / 140.0) * 1.52;
        vec3 coreColor = vec3(0.81, 0.39, 0.16) * warm * (0.45 + cloud) * (1.0 - lane * 0.65)
          + vec3(1.0, 0.77, 0.46) * nucleus;
        float knots = smoothstep(0.54, 0.75, noise(p * 8.5) * 0.55 + fine * 0.45) * arms * edge * layer;
        vec3 ionizedGas = vec3(0.95, 0.23, 0.47) * knots * cloud * 0.12;
        vec3 mist = vec3(0.038, 0.045, 0.116) * edge * exp(-r / 199.0) * (0.65 + cloud * 0.9);
        fragColor = vec4((armsColor + coreColor + ionizedGas + mist) * uIntensity * uGain, 1.0);
      }
    `,
  })
  const mesh = new Mesh(geometry, material)
  mesh.position.y = height
  return mesh
}

function referenceRings() {
  const group = new Group()
  for (const radius of [56, 111, 166, 221, 276]) {
    const points = new Float32Array(360 * 3)
    for (let i = 0; i < 360; i++) {
      const theta = (i / 360) * TAU
      points.set([Math.cos(theta) * radius, -3.5, Math.sin(theta) * radius], i * 3)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(points, 3))
    group.add(new LineLoop(geometry, new LineBasicMaterial({
      color: '#5fa9b7', transparent: true, opacity: radius === 276 ? 0.22 : 0.14, depthWrite: false,
      blending: AdditiveBlending,
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
  const disk = stellarPoints(150_000, false, profile)
  const sky = stellarPoints(10_000, true, profile)
  const dustGain = { value: 1 }
  const phase = { value: 0 }
  sky.renderOrder = -4
  const lower = dustLayer(-4.5, 0.30, dustGain, phase, profile)
  const middle = dustLayer(0, 0.58, dustGain, phase, profile)
  const upper = dustLayer(4.5, 0.22, dustGain, phase, profile)
  lower.renderOrder = -3
  middle.renderOrder = -2
  upper.renderOrder = -1
  const rings = referenceRings()
  function setTime(time: number) {
    phase.value = time * PATTERN_SPEED % TAU
    disk.material.uniforms.uPhase.value = phase.value
    disk.material.uniforms.uTime.value = time
    sky.material.uniforms.uTime.value = time
  }
  const dust = [lower, middle, upper]
  return { objects: [...dust, disk, rings], dust, disk, sky, rings, dustGain, setTime }
}
