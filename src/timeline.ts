export function formatTime(time: number, tenths = false) {
  const ticks = Math.floor(Math.abs(time) * 10 + 0.000001)
  const sign = time < 0 ? '−' : ''
  const minutes = String(Math.floor(ticks / 600)).padStart(2, '0')
  const seconds = String(Math.floor(ticks / 10) % 60).padStart(2, '0')
  return `${sign}${minutes}:${seconds}${tenths ? `.${ticks % 10}` : ''}`
}

export function createTimeline(input: HTMLInputElement, readout: HTMLOutputElement, ticks: HTMLElement,
  onSeek: (time: number) => void) {
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
