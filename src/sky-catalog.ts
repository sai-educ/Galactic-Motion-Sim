import { galacticToScene, sphericalDirection, type Vec3 } from './astro'

export { galacticCoordinates } from './astro'

export interface SkyObject {
  id: string
  name: string
  designation: string
  kind: string
  distance: string
  ra: number
  dec: number
  fieldOfView: number
  imageAspect: number
  /** The kind of light the portrait records. Infrared portraits are false color. */
  band: string
  /** Set for the Milky Way's satellites, which are near enough to place at their real positions. */
  satellite?: { distanceKpc: number, widthKpc: number }
  source: string
  credit: string
}

// ICRS right ascension and declination are in decimal degrees.
export const skyCatalog: SkyObject[] = [
  {
    id: 'm31', name: 'Andromeda Galaxy', designation: 'M31', kind: 'Spiral galaxy',
    distance: '2.5 million light-years', ra: 10.68471, dec: 41.26875, fieldOfView: 12, imageAspect: 1,
    band: 'Infrared · false color',
    source: 'https://science.nasa.gov/photojournal/our-neighbor-andromeda/', credit: 'NASA/JPL-Caltech/UCLA',
  },
  {
    id: 'm33', name: 'Triangulum Galaxy', designation: 'M33', kind: 'Spiral galaxy',
    distance: 'About 3 million light-years', ra: 23.46208, dec: 30.66028, fieldOfView: 9, imageAspect: 1,
    band: 'Infrared · false color',
    source: 'https://science.nasa.gov/photojournal/wise-spies-a-galactic-neighbor/', credit: 'NASA/JPL-Caltech/UCLA',
  },
  {
    id: 'lmc', name: 'Large Magellanic Cloud', designation: 'LMC', kind: 'Milky Way satellite',
    distance: '160,000 light-years', ra: 80.89417, dec: -69.75611, fieldOfView: 20, imageAspect: 1,
    band: 'Infrared · false color',
    satellite: { distanceKpc: 49.6, widthKpc: 9.3 },
    source: 'https://science.nasa.gov/photojournal/our-chaotic-neighbor/', credit: 'NASA/JPL-Caltech/STScI',
  },
  {
    id: 'smc', name: 'Small Magellanic Cloud', designation: 'SMC', kind: 'Milky Way satellite',
    distance: '200,000 light-years', ra: 13.15833, dec: -72.80028, fieldOfView: 14, imageAspect: 1.276,
    band: 'Infrared · false color',
    satellite: { distanceKpc: 62.4, widthKpc: 5.8 },
    source: 'https://science.nasa.gov/photojournal/wises-view-of-a-wispy-cloud/', credit: 'NASA/JPL-Caltech/UCLA',
  },
  {
    id: 'm81', name: 'Bode’s Galaxy', designation: 'M81', kind: 'Spiral galaxy',
    distance: '12 million light-years', ra: 148.88822, dec: 69.06530, fieldOfView: 9, imageAspect: 1.295,
    band: 'Infrared, visible and ultraviolet · false color',
    source: 'https://science.nasa.gov/photojournal/m81-galaxy-is-pretty-in-pink/',
    credit: 'NASA/JPL-Caltech/ESA/Harvard-Smithsonian CfA',
  },
  {
    id: 'm104', name: 'Sombrero Galaxy', designation: 'M104', kind: 'Edge-on spiral galaxy',
    distance: 'About 28 million light-years', ra: 189.99758, dec: -11.62306, fieldOfView: 8, imageAspect: 2.083,
    band: 'Visible light',
    source: 'https://science.nasa.gov/asset/hubble/sombrero-galaxy/', credit: 'NASA, and the Hubble Heritage Team (STScI/AURA)',
  },
]

export const skyAsset = (id: string) => `${import.meta.env.BASE_URL}sky/${id}.webp`

/** Scene-space unit vector toward a Galactic longitude and latitude, as seen from the Sun today. */
export function skyDirection(l: number, b: number): Vec3 {
  return galacticToScene(sphericalDirection(l, b))
}
