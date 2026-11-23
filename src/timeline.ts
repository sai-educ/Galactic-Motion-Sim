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

export function formatTime(time: number, tenths = false) {
  const ticks = Math.floor(Math.abs(time) * 10 + 0.000001)
  const sign = time < 0 ? '−' : ''
  const minutes = String(Math.floor(ticks / 600)).padStart(2, '0')
  const seconds = String(Math.floor(ticks / 10) % 60).padStart(2, '0')
  return `${sign}${minutes}:${seconds}${tenths ? `.${ticks % 10}` : ''}`
}

export function createTimeline(input: HTMLInputElement, readout: HTMLOutputElement, epoch: HTMLElement,
  ticks: HTMLElement, onSeek: (time: number) => void) {
  let end = 60
  let lastDisplayed = -1

  function updateTicks() {
    input.max = String(end)
    ticks.replaceChildren()
    for (let index = 0; index <= 4; index++) {
      const tick = document.createElement('span')
      tick.textContent = formatTime(end * index / 4)
      ticks.append(tick)
    }
  }

  function update(time: number, playing = false) {
    const displayed = Math.floor(time * 10 + 0.000001) / 10
    if (playing && time >= end - 0.05) {
      end = (Math.floor(time / 60 + 0.001) + 1) * 60
      updateTicks()
      lastDisplayed = -1
    }
    if (displayed === lastDisplayed) return
    lastDisplayed = displayed
    const label = formatTime(displayed, true)
    input.valueAsNumber = displayed
    input.style.setProperty('--range-progress', `${displayed / end * 100}%`)
    input.setAttribute('aria-valuetext', `${displayed} simulation seconds`)
    readout.value = label
    epoch.textContent = formatEpoch(displayed)
  }

  input.addEventListener('input', () => {
    onSeek(input.valueAsNumber)
    update(input.valueAsNumber)
  })

  function reset() {
    end = 60
    lastDisplayed = -1
    updateTicks()
    update(0)
  }

  reset()
  return { update, reset }
}
