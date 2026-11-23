import {
  AdditiveBlending, BufferAttribute, Color, DoubleSide, GLSL3, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2,
} from 'three'
import { EMPTY_ORBIT, GALACTIC_SPEED, TAU, type System } from './systems'

const motion = /* glsl */ `
  in vec4 aPath;
  in vec4 aOrbit;
  in vec4 aOuter;
  in vec4 aVisual;
  in vec4 aShape;
  in float aTilt;
  in vec3 aColor;
  uniform float uTime;
  uniform float uFocus;
  uniform bool uSystemFrame;
  uniform float uTrailSeconds;
  uniform vec2 uViewport;
  const float galacticSpeed = ${GALACTIC_SPEED.toFixed(2)};

  vec3 epicycle(vec4 parameters, float t, vec3 tangent, vec3 normal, vec3 binormal) {
    float phase = parameters.y * t + parameters.z;
    vec3 inclined = binormal * cos(parameters.w) + tangent * sin(parameters.w);
    return parameters.x * (cos(phase) * normal + sin(phase) * inclined);
  }

  vec3 systemPosition(float t) {
    float theta = aPath.y + t * galacticSpeed / aPath.x;
    float vertical = aPath.w * t + aVisual.x;
    return vec3(aPath.x * cos(theta), aPath.z * sin(vertical), aPath.x * sin(theta));
  }

  vec3 bodyPosition(float t) {
    vec3 tangent = vec3(-sin(aShape.x), 0.0, cos(aShape.x));
    vec3 normal = vec3(-cos(aShape.x), 0.0, -sin(aShape.x));
    vec3 binormal = vec3(0.0, -1.0, 0.0);
    return systemPosition(t) + epicycle(aOrbit, t, tangent, normal, binormal)
      + epicycle(aOuter, t, tangent, normal, binormal);
  }

  float prominence() {
    if (abs(aVisual.y - uFocus) < 0.25 && uFocus >= 0.0) return 1.0;
    return uFocus < 0.0 ? 0.72 : 0.12;
  }

  vec3 trailPosition(float t) {
    vec3 position = bodyPosition(t);
    if (uSystemFrame && abs(aVisual.y - uFocus) < 0.25) position += systemPosition(uTime) - systemPosition(t);
    return position;
  }
`

function instanceData(systems: System[]) {
  const path: number[] = []
  const orbit: number[] = []
  const outer: number[] = []
  const visual: number[] = []
  const shape: number[] = []
  const tilts: number[] = []
  const colors: number[] = []
  const surfaces = { rocky: 1, banded: 2, ringed: 3 }
  systems.forEach((system, index) => {
    for (const body of system.bodies) {
      const companion = body.outer ?? EMPTY_ORBIT
      path.push(system.radius, system.angle, system.bob, system.bobSpeed)
      orbit.push(body.orbit.radius, body.orbit.speed, body.orbit.phase, body.orbit.inclination)
      outer.push(companion.radius, companion.speed, companion.phase, companion.inclination)
      visual.push(system.bobPhase, index, body.size, body.glow)
      shape.push(system.angle, body.surface ? surfaces[body.surface] : 0, body.spin ?? 0, tilts.length * 2.13)
      tilts.push(body.obliquity ?? 0)
      new Color(body.color).toArray(colors, colors.length)
    }
  })
  const attributes = {
    aPath: new InstancedBufferAttribute(new Float32Array(path), 4),
    aOrbit: new InstancedBufferAttribute(new Float32Array(orbit), 4),
    aOuter: new InstancedBufferAttribute(new Float32Array(outer), 4),
    aVisual: new InstancedBufferAttribute(new Float32Array(visual), 4),
    aShape: new InstancedBufferAttribute(new Float32Array(shape), 4),
    aTilt: new InstancedBufferAttribute(new Float32Array(tilts), 1),
    aColor: new InstancedBufferAttribute(new Float32Array(colors), 3),
  }

  function rebase(time: number) {
    let offset = 0
    for (const system of systems) {
      for (const body of system.bodies) {
        const companion = body.outer ?? EMPTY_ORBIT
        attributes.aPath.array[offset + 1] = (system.angle + time * GALACTIC_SPEED / system.radius) % TAU
        attributes.aVisual.array[offset] = (system.bobPhase + time * system.bobSpeed) % TAU
        attributes.aOrbit.array[offset + 2] = (body.orbit.phase + time * body.orbit.speed) % TAU
        attributes.aOuter.array[offset + 2] = (companion.phase + time * companion.speed) % TAU
        attributes.aShape.array[offset + 3] = (offset / 4 * 2.13 + time * (body.spin ?? 0)) % TAU
        offset += 4
      }
    }
    attributes.aPath.needsUpdate = true
    attributes.aVisual.needsUpdate = true
    attributes.aOrbit.needsUpdate = true
    attributes.aOuter.needsUpdate = true
    attributes.aShape.needsUpdate = true
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

export function createOrbits(systems: System[]) {
  const uniforms = {
    uTime: { value: 0 }, uTrailSeconds: { value: 9 }, uFocus: { value: -1 }, uSystemFrame: { value: false },
    uViewport: { value: new Vector2(1, 1) },
  }
  const bodies = new InstancedBufferGeometry()
  bodies.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3))
  bodies.setIndex([0, 1, 2, 1, 3, 2])
  const trails = strip(512)
  const { attributes, rebase } = instanceData(systems)
  for (const geometry of [trails, bodies]) {
    for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute)
    geometry.instanceCount = attributes.aVisual.count
  }

  const ribbon = new ShaderMaterial({
    uniforms, glslVersion: GLSL3, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    vertexShader: motion + /* glsl */ `
      out float vAge;
      out float vEdge;
      out float vProminence;
      out float vStar;
      out vec3 vColor;
      void main() {
        vAge = position.x;
        vEdge = position.y;
        vProminence = uSystemFrame && abs(aVisual.y - uFocus) > 0.25 ? 0.0 : prominence();
        vStar = smoothstep(7.0, 13.0, aVisual.z);
        vColor = aColor;
        float span = uTrailSeconds;
        if (uSystemFrame && aOuter.x == 0.0 && aOrbit.y > 0.0) span = min(span, 6.283185307 / aOrbit.y);
        float t = uTime - vAge * span;
        vec4 current = projectionMatrix * modelViewMatrix * vec4(trailPosition(t), 1.0);
        vec4 next = projectionMatrix * modelViewMatrix * vec4(trailPosition(t + 0.009), 1.0);
        vec2 slope = (next.xy / max(next.w, 0.01) - current.xy / max(current.w, 0.01)) * uViewport;
        vec2 normal = vec2(-slope.y, slope.x) / max(length(slope), 0.0001);
        float width = mix(1.55, 2.42, vStar) * mix(0.65, 1.0, vProminence) * pow(1.0 - vAge, 0.55);
        current.xy += normal * width * position.y * 2.0 / uViewport * current.w;
        gl_Position = current;
      }
    `,
    fragmentShader: /* glsl */ `
      in float vAge;
      in float vEdge;
      in float vProminence;
      in float vStar;
      in vec3 vColor;
      out vec4 fragColor;
      void main() {
        float edge = exp(-2.9 * vEdge * vEdge) * (1.0 - smoothstep(0.78, 1.0, abs(vEdge)));
        float fade = pow(1.0 - vAge, 1.75);
        vec3 color = mix(vColor, vec3(1.0), 0.16 * (1.0 - smoothstep(0.0, 0.17, vAge)));
        fragColor = vec4(color * mix(1.2, 1.92, vStar), fade * edge * vProminence);
      }
    `,
  })

  const glow = new ShaderMaterial({
    uniforms, glslVersion: GLSL3, transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    vertexShader: motion + /* glsl */ `
      out vec2 vPoint;
      out vec3 vColor;
      out float vGlow;
      out float vProminence;
      flat out vec3 vSpinAxis;
      flat out vec3 vSunward;
      flat out vec2 vSurface;
      void main() {
        vPoint = position.xy;
        vColor = aColor;
        vGlow = aVisual.w;
        vProminence = prominence();
        vec3 world = bodyPosition(uTime);
        vec3 toSun = systemPosition(uTime) - world;
        vSunward = mat3(modelViewMatrix) * toSun / max(length(toSun), 0.0001);
        vec3 pole = vec3(-sin(aShape.x) * cos(aOrbit.w), sin(aOrbit.w), cos(aShape.x) * cos(aOrbit.w));
        vec3 radial = vec3(-cos(aShape.x), 0.0, -sin(aShape.x));
        vSpinAxis = pole * cos(aTilt) + radial * sin(aTilt);
        vSurface = vec2(aShape.y, aShape.z * uTime + aShape.w);
        vec4 center = modelViewMatrix * vec4(world, 1.0);
        vec4 clip = projectionMatrix * center;
        float closeup = aShape.y > 0.0 ? 1.45 : 1.62;
        float size = aVisual.z * mix(1.0, closeup, smoothstep(0.72, 1.0, vProminence))
          * clamp(50.0 / max(10.0, -center.z), 0.44, 1.5);
        clip.xy += position.xy * size * 2.0 / uViewport * clip.w;
        gl_Position = clip;
      }
    `,
    fragmentShader: /* glsl */ `
      in vec2 vPoint;
      in vec3 vColor;
      in float vGlow;
      in float vProminence;
      flat in vec3 vSpinAxis;
      flat in vec3 vSunward;
      flat in vec2 vSurface;
      out vec4 fragColor;
      void main() {
        float r = length(vPoint);
        if (vSurface.x > 0.0 && vProminence > 0.9) {
          float diskRadius = vSurface.x == 3.0 ? 0.39 : 0.57;
          vec2 uv = vPoint / diskRadius;
          vec3 normal = vec3(uv, sqrt(max(0.0, 1.0 - dot(uv, uv))));
          vec3 worldNormal = transpose(mat3(viewMatrix)) * normal;
          float phase = -vSurface.y;
          vec3 skin = worldNormal * cos(phase) + cross(vSpinAxis, worldNormal) * sin(phase)
            + vSpinAxis * dot(vSpinAxis, worldNormal) * (1.0 - cos(phase));
          float pattern = sin(12.0 * skin.x + 4.0 * sin(8.0 * skin.z)) * sin(11.0 * skin.z + 4.0 * skin.y);
          float latitude = dot(skin, vSpinAxis);
          float surfaceDetail = vSurface.x == 1.0 ? 0.80 + 0.36 * pattern
            : 0.83 + 0.24 * sin(24.0 * latitude + 0.95 * pattern);
          float lighting = 0.32 + 0.74 * max(0.0, dot(normal, vSunward));
          float disc = 1.0 - smoothstep(diskRadius * 0.84, diskRadius, r);
          vec3 viewAxis = mat3(viewMatrix) * vSpinAxis;
          vec2 minorAxis = normalize(viewAxis.xy + vec2(0.0001, 0.0));
          vec2 majorAxis = vec2(-minorAxis.y, minorAxis.x);
          vec2 ringPoint = vec2(dot(vPoint, majorAxis), dot(vPoint, minorAxis) / max(0.15, abs(viewAxis.z)));
          float ringRadius = length(ringPoint);
          float ring = smoothstep(0.56, 0.61, ringRadius) * (1.0 - smoothstep(0.9, 0.99, ringRadius));
          ring *= (0.58 + 0.42 * cos(42.0 * ringRadius)) * (1.0 - disc);
          if (vSurface.x != 3.0) ring = 0.0;
          vec3 planet = vColor * (disc * lighting * surfaceDetail + ring * 0.74);
          fragColor = vec4(planet + vColor * 0.12 * exp(-r * r * 8.0), 1.0);
          return;
        }
        float core = exp(-r * r * 43.0);
        float halo = exp(-r * r * 8.0) + 0.12 * exp(-r * r * 3.0);
        float star = smoothstep(1.6, 3.0, vGlow);
        vec2 p = abs(vPoint);
        float rays = (exp(-p.x * 55.0 - p.y * 5.0) + exp(-p.y * 55.0 - p.x * 4.0)) * star;
        vec3 light = mix(vColor, vec3(1.0), core * 0.6) * (vGlow * core + 0.61 * halo + 0.92 * rays);
        fragColor = vec4(light, (1.0 - smoothstep(0.65, 1.0, r)) * sqrt(vProminence));
      }
    `,
  })

  const ribbons = new Mesh(trails, ribbon)
  const meshes = [ribbons, new Mesh(bodies, glow)]
  for (const mesh of meshes) mesh.frustumCulled = false

  // Keep shader time small enough that fast inner orbits move smoothly for days.
  let epoch = 0
  function setTime(time: number) {
    const nextEpoch = Math.floor(time / 128) * 128
    if (nextEpoch !== epoch) {
      epoch = nextEpoch
      rebase(epoch)
    }
    uniforms.uTime.value = time - epoch
  }

  return { meshes, ribbons, uniforms, setTime }
}
