import { systems } from './systems'

const degrees = Math.PI / 180

interface SkyObject {
  id: string
  name: string
  designation: string
  kind: string
  distance: string
  ra: number
  dec: number
  fieldOfView: number
  imageAspect: number
  source: string
  credit: string
}

// ICRS right ascension and declination are in decimal degrees.
export const skyCatalog: SkyObject[] = [
  {
    id: 'm31', name: 'Andromeda Galaxy', designation: 'M31', kind: 'Spiral galaxy',
    distance: '2.5 million light-years', ra: 10.68471, dec: 41.26875, fieldOfView: 12, imageAspect: 1,
    source: 'https://science.nasa.gov/photojournal/our-neighbor-andromeda/', credit: 'NASA/JPL-Caltech/UCLA',
  },
  {
    id: 'm33', name: 'Triangulum Galaxy', designation: 'M33', kind: 'Spiral galaxy',
    distance: 'About 3 million light-years', ra: 23.46208, dec: 30.66028, fieldOfView: 9, imageAspect: 1,
    source: 'https://science.nasa.gov/photojournal/wise-spies-a-galactic-neighbor/', credit: 'NASA/JPL-Caltech/UCLA',
  },
  {
    id: 'lmc', name: 'Large Magellanic Cloud', designation: 'LMC', kind: 'Milky Way satellite',
    distance: '160,000 light-years', ra: 80.89417, dec: -69.75611, fieldOfView: 20, imageAspect: 1,
    source: 'https://science.nasa.gov/photojournal/our-chaotic-neighbor/', credit: 'NASA/JPL-Caltech/STScI',
  },
  {
    id: 'smc', name: 'Small Magellanic Cloud', designation: 'SMC', kind: 'Milky Way satellite',
    distance: '200,000 light-years', ra: 13.15833, dec: -72.80028, fieldOfView: 14, imageAspect: 1.276,
    source: 'https://science.nasa.gov/photojournal/wises-view-of-a-wispy-cloud/', credit: 'NASA/JPL-Caltech/UCLA',
  },
  {
    id: 'm81', name: 'Bode’s Galaxy', designation: 'M81', kind: 'Spiral galaxy',
    distance: '12 million light-years', ra: 148.88822, dec: 69.06530, fieldOfView: 9, imageAspect: 1.295,
    source: 'https://science.nasa.gov/photojournal/m81-galaxy-is-pretty-in-pink/',
    credit: 'NASA/JPL-Caltech/ESA/Harvard-Smithsonian CfA',
  },
  {
    id: 'm104', name: 'Sombrero Galaxy', designation: 'M104', kind: 'Edge-on spiral galaxy',
    distance: 'About 28 million light-years', ra: 189.99758, dec: -11.62306, fieldOfView: 8, imageAspect: 2.083,
    source: 'https://science.nasa.gov/asset/hubble/sombrero-galaxy/', credit: 'NASA, and the Hubble Heritage Team (STScI/AURA)',
  },
]

export const skyAsset = (id: string) => `${import.meta.env.BASE_URL}sky/${id}.webp`

export function galacticCoordinates(ra: number, dec: number) {
  const longitude = ra * degrees
  const latitude = dec * degrees
  const x = Math.cos(longitude) * Math.cos(latitude)
  const y = Math.sin(longitude) * Math.cos(latitude)
  const z = Math.sin(latitude)
  // International Astronomical Union Galactic frame in ICRS (J2000).
  const center = -0.0548755604 * x - 0.8734370902 * y - 0.4838350155 * z
  const alongRotation = 0.4941094279 * x - 0.4448296300 * y + 0.7469822445 * z
  const north = -0.8676661490 * x - 0.1980763734 * y + 0.4559837762 * z
  const l = (Math.atan2(alongRotation, center) / degrees + 360) % 360
  const b = Math.asin(Math.min(1, Math.max(-1, north))) / degrees
  return { l, b }
}

export function skyDirection(l: number, b: number): [number, number, number] {
  const longitude = l * degrees
  const latitude = b * degrees
  const solarAzimuth = systems[0].angle
  const center = Math.cos(longitude) * Math.cos(latitude)
  const rotation = Math.sin(longitude) * Math.cos(latitude)
  return [
    -Math.cos(solarAzimuth) * center - Math.sin(solarAzimuth) * rotation,
    Math.sin(latitude),
    -Math.sin(solarAzimuth) * center + Math.cos(solarAzimuth) * rotation,
  ]
}
