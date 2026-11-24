import { add, equatorialToGalactic, galacticCoordinates, LY_PER_KPC, scale, skyAxes } from './astro'
import type { Kinematics } from './galactic-orbit'

/** A star's catalog measurements, as SIMBAD lists them (ICRS, epoch J2000). */
export interface Astrometry {
  /** Right ascension and declination in degrees. */
  ra: number
  dec: number
  /** Parallax in milliarcseconds. */
  parallax: number
  /** Proper motion in milliarcseconds per year. The right-ascension part includes the cos(dec) factor. */
  pmRa: number
  pmDec: number
  /** Line-of-sight velocity in km/s. Positive values recede from the Sun. */
  radialVelocity: number
}

// Speed of one astronomical unit per year, in km/s.
const KMS_PER_AU_PER_YEAR = 4.740470464
const LY_PER_PARSEC = LY_PER_KPC / 1000

/** Position and velocity relative to the Sun in Galactic axes, from a parallax, proper motion, and radial velocity. */
export function kinematics({ ra, dec, parallax, pmRa, pmDec, radialVelocity }: Astrometry): Kinematics {
  if (!(parallax > 0)) throw new RangeError(`Expected a positive parallax, got ${parallax}`)
  const { north, east, away } = skyAxes(ra, dec)
  // A proper motion of μ mas/yr at a parallax of ϖ mas spans μ/ϖ astronomical units per year.
  const across = KMS_PER_AU_PER_YEAR / parallax
  const equatorial = add(add(scale(away, radialVelocity), scale(east, pmRa * across)), scale(north, pmDec * across))
  return {
    ...galacticCoordinates(ra, dec),
    distance: 1000 / parallax * LY_PER_PARSEC,
    velocity: equatorialToGalactic(equatorial),
  }
}
