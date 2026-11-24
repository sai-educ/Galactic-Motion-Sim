import { galacticCoordinates, galacticToScene, sphericalDirection, type Vec3 } from './astro'

export interface SkyObject {
  id: string
  name: string
  /** ICRS right ascension and declination in decimal degrees. */
  ra: number
  dec: number
  /** Height of the drawn portrait on the sky in degrees. Both are enlarged so they can be seen. */
  portraitDegrees: number
}

// The two other large spirals of the Local Group, at their catalog directions as seen from the Sun.
// Both portraits are infrared, false-color images from NASA's WISE mission (NASA/JPL-Caltech/UCLA):
// https://science.nasa.gov/photojournal/our-neighbor-andromeda/
// https://science.nasa.gov/photojournal/wise-spies-a-galactic-neighbor/
export const skyCatalog: SkyObject[] = [
  { id: 'm31', name: 'Andromeda Galaxy', ra: 10.68471, dec: 41.26875, portraitDegrees: 5.76 },
  { id: 'm33', name: 'Triangulum Galaxy', ra: 23.46208, dec: 30.66028, portraitDegrees: 4.32 },
]

export const skyAsset = (id: string) => `${import.meta.env.BASE_URL}sky/${id}.webp`

/** Scene-space unit vector toward an object, as seen from the Sun today. */
export function skyDirection({ ra, dec }: SkyObject): Vec3 {
  const { l, b } = galacticCoordinates(ra, dec)
  return galacticToScene(sphericalDirection(l, b))
}
