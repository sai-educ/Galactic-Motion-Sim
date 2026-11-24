import { KEPLER_ITERATIONS } from './astro'
import { HARMONICS, VERTICAL_RATE } from './galactic-orbit'
import { systems } from './systems'

// Every neighboring star is the same small dot in the overview, whatever size it has in its own close-up.
const QUIET_SIZE = 7

// Shared by the trail, star, and planet programs. The CPU evaluates the same closed forms
// in galactic-orbit.ts and systems.ts for the camera and the labels.
export const motion = /* glsl */ `
  #define SYSTEMS ${systems.length}
  in vec4 aPath;      // mean radius, azimuth, vertical amplitude, vertical phase
  in vec4 aCycle;  // mean angular rate, radial phase, radial phase rate
  in vec4 aOrbit;     // semi-major axis, mean motion, mean anomaly, eccentricity
  in vec3 aOrbitP;
  in vec3 aOrbitQ;
  in vec4 aOuter;
  in vec3 aOuterP;
  in vec3 aOuterQ;
  in vec4 aVisual;    // overview weight (1 featured primary, 0.5 neighbor star, 0 other bodies), system index, size, glow
  in vec3 aColor;
  uniform float uTime;
  uniform float uFocus;
  uniform bool uSystemFrame;
  uniform float uTrailSeconds;
  uniform vec2 uViewport;
  uniform float uNeighbors;
  uniform vec3 uSystemColors[SYSTEMS];
  // One row per system and one texel per harmonic: cosine and sine terms of the radius, then of the azimuth wobble.
  uniform sampler2D uHarmonics;
  const float TAU = 6.283185307;

  vec3 systemPosition(float t) {
    int system = int(aVisual.y + 0.5);
    float phase = aCycle.z * t + aCycle.y;
    float radius = aPath.x;
    float theta = aPath.y + aCycle.x * t;
    for (int k = 0; k < ${HARMONICS}; k++) {
      float angle = float(k + 1) * phase;
      vec4 term = texelFetch(uHarmonics, ivec2(k, system), 0);
      radius += term.x * cos(angle) + term.y * sin(angle);
      theta += term.z * cos(angle) + term.w * sin(angle);
    }
    return vec3(radius * cos(theta), aPath.z * sin(${VERTICAL_RATE.toFixed(7)} * t + aPath.w), radius * sin(theta));
  }

  vec3 ellipse(vec4 orbit, vec3 p, vec3 q, float t) {
    float mean = mod(orbit.y * t + orbit.z, TAU);
    float e = orbit.w;
    float anomaly = mean + e * sin(mean);
    for (int i = 0; i < ${KEPLER_ITERATIONS}; i++) {
      anomaly -= (anomaly - e * sin(anomaly) - mean) / (1.0 - e * cos(anomaly));
    }
    return orbit.x * ((cos(anomaly) - e) * p + sqrt(1.0 - e * e) * sin(anomaly) * q);
  }

  bool focused() { return uFocus >= 0.0 && abs(aVisual.y - uFocus) < 0.25; }

  // A neighboring star seen from the overview, where it is drawn smaller and fainter than a featured system.
  bool quiet() { return uFocus < 0.0 && aVisual.x > 0.25 && aVisual.x < 0.75; }

  // The overview draws one marker per system at its center of mass. A close-up draws only its own bodies.
  float prominence() {
    if (uFocus >= 0.0) return focused() ? 1.0 : 0.0;
    if (quiet()) return 0.5 * uNeighbors;
    return aVisual.x > 0.75 ? 0.86 : 0.0;
  }

  vec3 bodyPosition(float t) {
    vec3 center = systemPosition(t);
    if (uFocus < 0.0) return center;
    return center + ellipse(aOrbit, aOrbitP, aOrbitQ, t) + ellipse(aOuter, aOuterP, aOuterQ, t);
  }

  vec3 trailPosition(float t) {
    vec3 position = bodyPosition(t);
    if (uSystemFrame && focused()) position += systemPosition(uTime) - systemPosition(t);
    return position;
  }

  vec3 displayColor() {
    return uFocus < 0.0 ? uSystemColors[int(aVisual.y + 0.5)] : aColor;
  }

  // Bodies keep a readable minimum size from afar and grow like solid objects as the camera closes in.
  float bodyScale(float depth) {
    return clamp(52.0 / max(8.0, depth), 0.44, 4.2);
  }
`

export const ribbonVertex = motion + /* glsl */ `
  out float vAge;
  out float vEdge;
  out float vProminence;
  out float vStar;
  out vec3 vColor;
  void main() {
    vAge = position.x;
    vEdge = position.y;
    vProminence = prominence();
    vStar = quiet() ? 0.0 : smoothstep(7.5, 13.0, aVisual.z);
    vColor = displayColor();
    if (vProminence == 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float span = uTrailSeconds;
    // In the system frame a single ellipse repeats itself, so one revolution is enough.
    if (uSystemFrame && aOuter.x == 0.0 && aOrbit.y > 0.0) span = min(span, TAU / aOrbit.y);
    float t = uTime - vAge * span;
    vec4 current = projectionMatrix * modelViewMatrix * vec4(trailPosition(t), 1.0);
    vec4 next = projectionMatrix * modelViewMatrix * vec4(trailPosition(t + 0.009), 1.0);
    vec2 slope = (next.xy / max(next.w, 0.01) - current.xy / max(current.w, 0.01)) * uViewport;
    vec2 normal = vec2(-slope.y, slope.x) / max(length(slope), 0.0001);
    float width = mix(1.5, 2.4, vStar) * mix(0.7, 1.0, vProminence) * pow(1.0 - vAge, 0.55);
    current.xy += normal * width * position.y * 2.0 / uViewport * current.w;
    gl_Position = current;
  }
`

export const ribbonFragment = /* glsl */ `
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
    fragColor = vec4(color * mix(1.15, 1.8, vStar), fade * edge * vProminence);
  }
`

export const starVertex = motion + /* glsl */ `
  in vec4 aSurface;
  out vec2 vPoint;
  out vec3 vColor;
  out float vGlow;
  out float vProminence;
  out float vCloseup;
  void main() {
    vPoint = position.xy;
    vColor = displayColor();
    vGlow = aVisual.w * (quiet() ? 0.6 : 1.0);
    vProminence = prominence();
    if (vProminence == 0.0 || aSurface.x > 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec4 center = modelViewMatrix * vec4(bodyPosition(uTime), 1.0);
    vec4 clip = projectionMatrix * center;
    vCloseup = smoothstep(0.9, 1.0, vProminence);
    float size = (quiet() ? ${QUIET_SIZE.toFixed(1)} : aVisual.z) * mix(1.0, 1.62, vCloseup) * bodyScale(-center.z);
    clip.xy += position.xy * size * 2.0 / uViewport * clip.w;
    gl_Position = clip;
  }
`

export const starFragment = /* glsl */ `
  in vec2 vPoint;
  in vec3 vColor;
  in float vGlow;
  in float vProminence;
  in float vCloseup;
  out vec4 fragColor;
  void main() {
    float r = length(vPoint);
    float core = exp(-r * r * 43.0);
    float halo = exp(-r * r * 8.0) + 0.12 * exp(-r * r * 3.0);
    float star = smoothstep(1.6, 3.0, vGlow);
    vec2 p = abs(vPoint);
    float rays = (exp(-p.x * 55.0 - p.y * 5.0) + exp(-p.y * 55.0 - p.x * 4.0)) * star;
    // A limb-darkened photosphere appears in close-up. Its edge dims and reddens like a real stellar disk.
    float photosphere = 0.13;
    float mu = sqrt(max(0.0, 1.0 - r * r / (photosphere * photosphere)));
    float disk = (1.0 - smoothstep(photosphere * 0.93, photosphere, r)) * (0.42 + 0.58 * mu) * vCloseup;
    vec3 surface = mix(vColor * vColor, mix(vColor, vec3(1.0), 0.55), mu);
    vec3 light = mix(vColor, vec3(1.0), core * 0.6) * (vGlow * core + 0.61 * halo + 0.62 * rays)
      + surface * disk * vGlow * 1.5;
    fragColor = vec4(light, (1.0 - smoothstep(0.65, 1.0, r)) * sqrt(vProminence));
  }
`

export const planetVertex = motion + /* glsl */ `
  in vec4 aSurface;   // surface style, spin rate, spin phase
  in vec3 aSpinAxis;
  in vec3 aLight;
  out vec2 vPoint;
  out vec3 vColor;
  flat out vec3 vLight;
  flat out vec3 vSpinAxis;
  flat out vec3 vSunward;
  flat out vec2 vSurface;
  void main() {
    vPoint = position.xy;
    vColor = aColor;
    vLight = aLight;
    if (prominence() == 0.0 || aSurface.x == 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec3 world = bodyPosition(uTime);
    vec3 toStar = systemPosition(uTime) - world;
    vSunward = mat3(modelViewMatrix) * toStar / max(length(toStar), 0.0001);
    vSpinAxis = aSpinAxis;
    vSurface = vec2(aSurface.x, aSurface.y * uTime + aSurface.z);
    vec4 center = modelViewMatrix * vec4(world, 1.0);
    vec4 clip = projectionMatrix * center;
    float size = aVisual.z * 1.45 * bodyScale(-center.z);
    clip.xy += position.xy * size * 2.0 / uViewport * clip.w;
    gl_Position = clip;
  }
`

export const planetFragment = /* glsl */ `
  in vec2 vPoint;
  in vec3 vColor;
  flat in vec3 vLight;
  flat in vec3 vSpinAxis;
  flat in vec3 vSunward;
  flat in vec2 vSurface;
  out vec4 fragColor;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(cell), hash(cell + vec3(1, 0, 0)), f.x), mix(hash(cell + vec3(0, 1, 0)), hash(cell + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(cell + vec3(0, 0, 1)), hash(cell + vec3(1, 0, 1)), f.x), mix(hash(cell + vec3(0, 1, 1)), hash(cell + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      total += amplitude * noise(p);
      p = p * 2.03 + 11.7;
      amplitude *= 0.5;
    }
    return total;
  }

  // Albedo from body-fixed coordinates: s.y is the sine of latitude and s.xz circle the equator.
  vec3 albedo(float style, vec3 s, out float haze) {
    float latitude = s.y;
    haze = 0.0;
    if (style < 1.5) {
      float craters = smoothstep(0.55, 0.75, noise(s * 9.0));
      return vec3(0.50, 0.48, 0.46) * (0.62 + 0.62 * fbm(s * 5.0)) * (1.0 - 0.3 * craters);
    }
    if (style < 2.5) {
      haze = 0.5;
      float swirl = fbm(vec3(s.x * 1.6, latitude * 5.0 + 0.8 * fbm(s * 2.0), s.z * 1.6));
      return mix(vec3(0.84, 0.70, 0.46), vec3(0.98, 0.93, 0.78), swirl);
    }
    if (style < 3.5) {
      haze = 1.0;
      float land = smoothstep(0.50, 0.56, fbm(s * 2.3 + 3.1));
      float dry = smoothstep(0.42, 0.7, fbm(s * 4.0 + 9.0)) * (1.0 - abs(latitude));
      vec3 ground = mix(vec3(0.13, 0.30, 0.10), vec3(0.52, 0.42, 0.25), dry);
      vec3 color = mix(vec3(0.02, 0.12, 0.36), ground, land);
      color = mix(color, vec3(0.92, 0.95, 0.98), smoothstep(0.80, 0.90, abs(latitude) + 0.08 * fbm(s * 6.0)));
      float clouds = smoothstep(0.50, 0.72, fbm(vec3(s.x * 3.0, latitude * 5.5, s.z * 3.0) + 5.0));
      return mix(color, vec3(0.95), clouds * 0.82);
    }
    if (style < 4.5) {
      float dark = smoothstep(0.46, 0.66, fbm(s * 2.8 + 1.7));
      vec3 color = mix(vec3(0.76, 0.38, 0.20), vec3(0.36, 0.17, 0.11), dark * 0.75);
      return mix(color, vec3(0.94, 0.92, 0.90), smoothstep(0.88, 0.95, abs(latitude)));
    }
    if (style < 5.5) {
      float turbulence = fbm(vec3(s.x * 2.5, latitude * 9.0, s.z * 2.5));
      float belts = 0.5 + 0.5 * sin(latitude * 21.0 + 2.4 * turbulence);
      vec3 color = mix(vec3(0.62, 0.42, 0.28), vec3(0.93, 0.86, 0.72), smoothstep(0.25, 0.75, belts));
      // The Great Red Spot sits about 22° south of the equator.
      vec2 spot = vec2(atan(s.z, s.x) - 1.0, (latitude + 0.37) * 2.6);
      return mix(color, vec3(0.74, 0.30, 0.20), 1.0 - smoothstep(0.10, 0.24, length(spot)));
    }
    if (style < 6.5) {
      float belts = 0.5 + 0.5 * sin(latitude * 17.0 + fbm(s * 2.0));
      return mix(vec3(0.78, 0.66, 0.44), vec3(0.94, 0.86, 0.64), belts);
    }
    if (style < 7.5) {
      haze = 0.6;
      return mix(vec3(0.58, 0.84, 0.88), vec3(0.74, 0.92, 0.94), smoothstep(0.3, 1.0, abs(latitude)));
    }
    if (style < 8.5) {
      haze = 0.6;
      float belts = 0.5 + 0.5 * sin(latitude * 12.0 + fbm(s * 3.0));
      vec3 color = mix(vec3(0.16, 0.30, 0.82), vec3(0.30, 0.48, 0.94), belts);
      float streaks = smoothstep(0.66, 0.8, fbm(vec3(s.x * 2.0, latitude * 14.0, s.z * 2.0) + 2.0));
      return mix(color, vec3(0.9, 0.94, 1.0), streaks * 0.6);
    }
    // No telescope has resolved these surfaces, so they get plain rock tinted by the planet's key color.
    return mix(vec3(0.46, 0.42, 0.39), vColor, 0.3) * (0.6 + 0.7 * fbm(s * 4.0));
  }

  void main() {
    bool ringed = abs(vSurface.x - 6.0) < 0.5;
    float body = ringed ? 0.42 : 0.6;
    float r = length(vPoint);
    float edge = fwidth(r) * 1.5;
    float disc = 1.0 - smoothstep(body - edge, body, r);
    vec3 color = vec3(0.0);

    if (disc > 0.0) {
      vec2 uv = vPoint / body;
      vec3 normal = vec3(uv, sqrt(max(0.0, 1.0 - dot(uv, uv))));
      vec3 world = transpose(mat3(viewMatrix)) * normal;
      // Undo the spin to find which part of the surface faces this pixel.
      float turn = -vSurface.y;
      vec3 skin = world * cos(turn) + cross(vSpinAxis, world) * sin(turn)
        + vSpinAxis * dot(vSpinAxis, world) * (1.0 - cos(turn));
      vec3 east = normalize(cross(vSpinAxis, vec3(0.31, 0.92, 0.24)));
      vec3 local = vec3(dot(skin, east), dot(skin, vSpinAxis), dot(skin, cross(vSpinAxis, east)));
      float haze;
      vec3 surface = albedo(vSurface.x, local, haze);
      float daylight = dot(normal, vSunward);
      float lit = smoothstep(-0.06 - 0.12 * haze, 0.32, daylight) * max(daylight, 0.0) + 0.012;
      // Air scatters light around the limb, so worlds with atmospheres get a thin bright rim.
      float rim = pow(1.0 - normal.z, 3.0) * haze * smoothstep(-0.25, 0.35, daylight);
      color = (surface * lit * 1.35 + mix(vec3(0.35, 0.55, 1.0), surface, 0.5) * rim * 0.7) * vLight;
    }

    float rings = 0.0;
    vec3 ringColor = vec3(0.0);
    bool inFront = false;
    if (ringed) {
      vec3 axis = mat3(viewMatrix) * vSpinAxis;
      float depth = abs(axis.z) < 0.12 ? (axis.z < 0.0 ? -0.12 : 0.12) : axis.z;
      vec2 minor = normalize(axis.xy + vec2(0.0001, 0.0));
      vec2 major = vec2(-minor.y, minor.x);
      float across = dot(vPoint, minor);
      float radius = length(vec2(dot(vPoint, major), across / abs(depth))) / body;
      // Radii in units of Saturn's own: C ring, B ring, the Cassini division, then the A ring.
      float band = smoothstep(1.22, 1.26, radius) * (1.0 - smoothstep(2.25, 2.29, radius));
      float density = mix(0.22, 1.0, smoothstep(1.50, 1.55, radius))
        * (1.0 - 0.88 * smoothstep(1.93, 1.96, radius) * (1.0 - smoothstep(2.01, 2.04, radius)))
        * mix(1.0, 0.72, smoothstep(2.04, 2.06, radius))
        * (0.86 + 0.14 * sin(radius * 90.0));
      rings = band * density;
      // The near half of the rings crosses in front of the globe and the far half passes behind it.
      vec3 point = vec3(vPoint, -dot(vPoint, axis.xy) / depth);
      inFront = point.z > 0.0;
      // Saturn's shadow falls across the rings on the side away from its star.
      float along = dot(point, vSunward);
      float shadow = along < 0.0 && length(point - vSunward * along) < body ? 0.1 : 1.0;
      ringColor = vec3(0.86, 0.76, 0.58) * vLight * shadow * 0.9;
    }

    // Premultiplied output lets a planet hide what lies behind it.
    float front = inFront ? rings : disc;
    float back = inFront ? disc : rings;
    vec3 frontColor = inFront ? ringColor : color;
    vec3 backColor = inFront ? color : ringColor;
    float alpha = front + back * (1.0 - front);
    // The solid pass writes depth, so it keeps only mostly opaque pixels. Faint ring and edge pixels follow without it.
    #ifdef SOLID
      if (alpha < 0.5) discard;
    #else
      if (alpha < 0.02 || alpha >= 0.5) discard;
    #endif
    fragColor = vec4(frontColor * front + backColor * back * (1.0 - front), alpha);
  }
`
