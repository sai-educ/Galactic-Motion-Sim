import {
  AdditiveBlending, BackSide, GLSL3, Group, Mesh, PlaneGeometry, ShaderMaterial,
  SphereGeometry, SRGBColorSpace, TextureLoader, Vector3, type Texture,
} from 'three'
import { RAD } from './astro'
import { galacticCoordinates, skyAsset, skyCatalog, skyDirection } from './sky-catalog'

const SKY_RADIUS = 4750
const PHOTO_RADIUS = 4200

export function createDeepSky() {
  const loader = new TextureLoader()
  const atlas = new Group()
  const center = new Vector3(...skyDirection(0, 0))
  const rotation = new Vector3(...skyDirection(90, 0))
  const surveyPhoto: { value: Texture | null } = { value: null }
  const surveyGain = { value: 0.42 }
  const surveyFocus = { value: new Vector3() }
  const surveyMask = { value: 0 }
  const survey = new Mesh(new SphereGeometry(SKY_RADIUS, 32, 20), new ShaderMaterial({
    side: BackSide, glslVersion: GLSL3, depthWrite: false, depthTest: false,
    uniforms: { uPhoto: surveyPhoto, uCenter: { value: center }, uRotation: { value: rotation },
      uGain: surveyGain, uFocus: surveyFocus, uMask: surveyMask },
    vertexShader: /* glsl */ `
      out vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      in vec3 vDirection;
      uniform sampler2D uPhoto;
      uniform vec3 uCenter;
      uniform vec3 uRotation;
      uniform float uGain;
      uniform vec3 uFocus;
      uniform float uMask;
      out vec4 fragColor;
      void main() {
        vec3 direction = normalize(vDirection);
        vec3 galactic = vec3(dot(direction, uCenter), dot(direction, uRotation), direction.y);
        // Register the panoramic photograph to the catalog using M31, Sirius,
        // Canopus, and the centers of the Magellanic Clouds.
        vec3 aligned = mat3(
           0.99795920, -0.05658712,  0.02958602,
           0.05714742,  0.99819530, -0.01844758,
          -0.02848873,  0.02010069,  0.99939199
        ) * galactic;
        float longitude = atan(aligned.y, aligned.x);
        float latitude = asin(clamp(aligned.z, -1.0, 1.0));
        vec2 skyUv = vec2(0.5 - longitude / 6.283185307, 0.5 + latitude / 3.141592654);
        float aroundFocus = smoothstep(uMask - 0.006, uMask, dot(direction, uFocus));
        vec3 photo = texture(uPhoto, skyUv).rgb;
        fragColor = vec4(vec3(0.0017, 0.0023, 0.0075) + photo * uGain * (1.0 - aroundFocus * step(0.5, uMask)), 1.0);
      }
    `,
  }))
  survey.renderOrder = -10
  survey.frustumCulled = false
  survey.visible = false
  atlas.add(survey)

  const directions = skyCatalog.map(object => {
    const { l, b } = galacticCoordinates(object.ra, object.dec)
    return new Vector3(...skyDirection(l, b))
  })
  const plane = new PlaneGeometry(1, 1)
  const photos = skyCatalog.map((object, index) => {
    const texture = loader.load(skyAsset(object.id))
    texture.colorSpace = SRGBColorSpace
    const mesh = new Mesh(plane, new ShaderMaterial({
      uniforms: { uPhoto: { value: texture }, uSize: { value: 1 }, uAspect: { value: object.imageAspect }, uGain: { value: 1 } },
      glslVersion: GLSL3, transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uSize;
        uniform float uAspect;
        out vec2 vPhoto;
        void main() {
          vPhoto = uv;
          vec4 location = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          location.xy += position.xy * vec2(uAspect, 1.0) * uSize;
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
    atlas.add(mesh)
    return mesh
  })

  function update(observer: Vector3, selected: number, showSurvey: boolean, showPhotos: boolean) {
    atlas.position.copy(observer)
    const observingFromSun = selected >= 0
    // The panorama includes the Milky Way as seen from inside its disk.
    survey.visible = observingFromSun && showSurvey
    if (survey.visible && !surveyPhoto.value) {
      const panorama = loader.load(skyAsset('milky-way-panorama'))
      panorama.colorSpace = SRGBColorSpace
      surveyPhoto.value = panorama
    }
    surveyGain.value = showPhotos ? 0.42 : 1.2
    const telescope = observingFromSun && showPhotos
    surveyMask.value = telescope ? Math.cos(skyCatalog[selected].fieldOfView * RAD * 0.52) : 0
    if (telescope) surveyFocus.value.copy(directions[selected])
    for (let index = 0; index < photos.length; index++) {
      const object = skyCatalog[index]
      const photo = photos[index]
      const closeup = selected === index
      photo.visible = showPhotos && (observingFromSun ? closeup : !object.atlasOnly)
      if (!photo.visible) continue

      const angle = closeup ? object.fieldOfView * 0.78 : Math.min(7.6, object.fieldOfView * 0.48)
      photo.material.uniforms.uSize.value = 2 * PHOTO_RADIUS * Math.tan(angle * RAD / 2)
      photo.material.uniforms.uGain.value = closeup ? 1.33 : 0.49
    }
  }

  /** World position of an object's marker for an observer at `observer`. */
  function locate(index: number, observer: Vector3, target: Vector3) {
    return target.copy(observer).addScaledVector(directions[index], PHOTO_RADIUS)
  }

  return { atlas, directions, update, locate }
}
