import { MYR_PER_SECOND } from './astro'

const lightYears = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** The stretch of galactic history a simulation time stands for, counted from the year 2000. */
export function formatEpoch(time: number) {
  const myr = time * MYR_PER_SECOND
  if (Math.abs(myr) < 0.05) return 'Today'
  const amount = Math.abs(myr) < 100 ? Math.abs(myr).toFixed(1) : lightYears.format(Math.abs(myr))
  return `${amount} million years ${myr < 0 ? 'ago' : 'from now'}`
}

/** A distance in light-years with about three significant figures. */
export function formatLightYears(value: number) {
  const size = Math.abs(value)
  if (size < 100) return `${value.toFixed(2)} ly`
  if (size < 1000) return `${value.toFixed(0)} ly`
  const step = 10 ** (Math.floor(Math.log10(size)) - 3)
  return `${lightYears.format(Math.round(value / step) * step)} ly`
}

/** When a simulation time falls, counted in years from the year 2000 and rounded to what the measurements support. */
export function formatWhen(time: number) {
  const years = time * MYR_PER_SECOND * 1e6
  const size = Math.abs(years)
  if (size < 50) return 'Today'
  const step = 10 ** (Math.floor(Math.log10(size)) - 1)
  const amount = size >= 1e6 ? `${(size / 1e6).toFixed(2)} million` : lightYears.format(Math.round(size / step) * step)
  return `${amount} years ${years < 0 ? 'ago' : 'from now'}`
}

export function formatTime(time: number, tenths = false) {
  const ticks = Math.floor(Math.abs(time) * 10 + 0.000001)
  const sign = time < 0 ? '−' : ''
  const minutes = String(Math.floor(ticks / 600)).padStart(2, '0')
  const seconds = String(Math.floor(ticks / 10) % 60).padStart(2, '0')
  return `${sign}${minutes}:${seconds}${tenths ? `.${ticks % 10}` : ''}`
}
