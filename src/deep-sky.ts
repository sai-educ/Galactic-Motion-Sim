import {
  AdditiveBlending, GLSL3, Group, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, TextureLoader, Vector3,
} from 'three'
import { RAD } from './astro'
import { skyAsset, skyCatalog, skyDirection } from './sky-catalog'

// The portraits sit on a sphere around the camera, so they stay at a fixed direction like the far-off galaxies they show.
const PHOTO_RADIUS = 4200
const PHOTO_GAIN = 0.49

export function createDeepSky() {
  const loader = new TextureLoader()
  const portraits = new Group()
  const directions = skyCatalog.map(object => new Vector3(...skyDirection(object)))
  const plane = new PlaneGeometry(1, 1)
  skyCatalog.forEach((object, index) => {
    const texture = loader.load(skyAsset(object.id))
    texture.colorSpace = SRGBColorSpace
    const size = 2 * PHOTO_RADIUS * Math.tan(object.portraitDegrees * RAD / 2)
    const mesh = new Mesh(plane, new ShaderMaterial({
      uniforms: { uPhoto: { value: texture }, uSize: { value: size }, uGain: { value: PHOTO_GAIN } },
      glslVersion: GLSL3, transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uSize;
        out vec2 vPhoto;
        void main() {
          vPhoto = uv;
          vec4 location = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          location.xy += position.xy * uSize;
          gl_Position = projectionMatrix * location;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uPhoto;
        uniform float uGain;
        in vec2 vPhoto;
        out vec4 fragColor;
        void main() {
          vec2 edge = abs(vPhoto * 2.0 - 1.0);
          float fade = (1.0 - smoothstep(0.58, 1.0, edge.x)) * (1.0 - smoothstep(0.56, 1.0, edge.y));
          vec3 radiance = max(texture(uPhoto, vPhoto).rgb - 0.0016, 0.0);
          fragColor = vec4(radiance * uGain, fade);
        }
      `,
    }))
    mesh.position.copy(directions[index]).multiplyScalar(PHOTO_RADIUS)
    mesh.frustumCulled = false
    mesh.renderOrder = -6
    portraits.add(mesh)
  })

  function update(observer: Vector3, visible: boolean) {
    portraits.position.copy(observer)
    portraits.visible = visible
  }

  /** World position of an object's marker for an observer at `observer`. */
  function locate(index: number, observer: Vector3, target: Vector3) {
    return target.copy(observer).addScaledVector(directions[index], PHOTO_RADIUS)
  }

  return { portraits, update, locate }
}
