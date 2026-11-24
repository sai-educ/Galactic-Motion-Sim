import type { Astrometry } from './astrometry'

export type NeighborGroup = 'calm' | 'visitor' | 'encounter'

/** What a group of neighboring stars has in common, and what their motion shows. */
export interface NeighborGroupInfo {
  id: NeighborGroup
  title: string
  idea: string
}

export interface NeighborStar {
  id: string
  name: string
  group: NeighborGroup
  /** The kind of star in plain words, and its spectral type as SIMBAD lists it. */
  type: string
  spectralType: string
  /** Surface temperature in kelvin, rounded from the published measurements SIMBAD collects. */
  kelvin: number
  /** Drawn size of the star in a close-up. Like every size here, it is enlarged and only suggests the star's scale. */
  size: number
  /** One line on what this star's motion shows. */
  story: string
  astrometry: Astrometry
}

export const NEIGHBOR_GROUPS: NeighborGroupInfo[] = [
  { id: 'calm', title: 'Fellow travelers',
    idea: 'Their orbits are as round as the Sun’s, so they drift away from us only slowly.' },
  { id: 'visitor', title: 'Passing through',
    idea: 'Their orbits are stretched. They cross the Sun’s neighborhood, then swing far away.' },
  { id: 'encounter', title: 'Close calls',
    idea: 'Their paths bring them to within about a light-year of the Sun.' },
]

// Positions, parallaxes, proper motions, and radial velocities are the values SIMBAD lists (ICRS, epoch J2000).
// Gaia EDR3 supplies the astrometry of the fainter stars and Hipparcos (van Leeuwen 2007) that of the
// bright ones, which saturate Gaia. Scholz's Star comes from Henry et al. (2018) and Burgasser et al. (2015).
// Each star is here because its orbit shows something, and because that orbit stays within the part of the
// Galaxy this model describes. Kapteyn's Star, which circles the Galaxy backwards, is left out for that reason:
// it dives to within a kiloparsec of the center, where the model's flat rotation curve no longer holds.
export const neighborStars: NeighborStar[] = [
  {
    id: 'vega', name: 'Vega', group: 'calm', type: 'Blue-white star', spectralType: 'A0V', kelvin: 9500, size: 16,
    story: 'One of the brightest stars in the night sky. Its path around the Galaxy is even rounder than the Sun’s.',
    astrometry: { ra: 279.23473479, dec: 38.78368896, parallax: 130.23, pmRa: 200.94, pmDec: 286.23, radialVelocity: -13.5 },
  },
  {
    id: 'altair', name: 'Altair', group: 'calm', type: 'White star', spectralType: 'A7V', kelvin: 7600, size: 14,
    story: 'A bright neighbor on an orbit almost the same shape as the Sun’s.',
    astrometry: { ra: 297.69582730, dec: 8.86832120, parallax: 194.95, pmRa: 536.23, pmDec: 385.29, radialVelocity: -26.6 },
  },
  {
    id: 'fomalhaut', name: 'Fomalhaut', group: 'calm', type: 'White star', spectralType: 'A4V', kelvin: 8600, size: 15,
    story: 'A young star ringed by dust, on the roundest orbit of the stars shown here.',
    astrometry: { ra: 344.41269272, dec: -29.62223703, parallax: 129.81, pmRa: 328.95, pmDec: -164.67, radialVelocity: 6.5 },
  },
  {
    id: 'barnard', name: 'Barnard’s Star', group: 'visitor', type: 'Red dwarf', spectralType: 'M4V', kelvin: 3200, size: 8,
    story: 'No star moves faster across our sky. Its stretched orbit carries it far out toward the Galaxy’s edge.',
    astrometry: { ra: 269.45207696, dec: 4.69336497, parallax: 546.9759, pmRa: -801.551, pmDec: 10362.394, radialVelocity: -110.11 },
  },
  {
    id: 'arcturus', name: 'Arcturus', group: 'visitor', type: 'Red giant', spectralType: 'K1.5III', kelvin: 4300, size: 19,
    story: 'An old giant that circles the Galaxy far slower than the Sun, so on every lap it falls deep toward the center.',
    astrometry: { ra: 213.91530029, dec: 19.18240916, parallax: 88.83, pmRa: -1093.39, pmDec: -2000.06, radialVelocity: -5.229 },
  },
  {
    id: 'gliese-710', name: 'Gliese 710', group: 'encounter', type: 'Orange dwarf', spectralType: 'K7V', kelvin: 4100, size: 11,
    story: 'Headed almost straight for the Sun. It will pass through the Oort cloud of comets at the Solar System’s edge.',
    astrometry: { ra: 274.96183814, dec: -1.93861228, parallax: 52.3963, pmRa: -0.414, pmDec: -0.108, radialVelocity: -14.468 },
  },
  {
    id: 'scholz', name: 'Scholz’s Star', group: 'encounter', type: 'Red and brown dwarf', spectralType: 'M9.5 + T5', kelvin: 2300, size: 7,
    story: 'A dim pair that grazed the outer Oort cloud when modern humans already walked the Earth.',
    astrometry: { ra: 110.013557, dec: -8.780529, parallax: 148.8, pmRa: -52.7, pmDec: -95.8, radialVelocity: 83.1 },
  },
]
