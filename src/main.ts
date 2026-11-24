import './style.css'
import { LY_PER_KPC } from './astro'
import { createCallout, type Callout } from './callouts'
import { icon, mountIcons } from './icons'
import { galacticCoordinates, skyAsset, skyCatalog } from './sky-catalog'
import { arms, RING_RADII_KPC } from './spiral-map'
import { systems } from './systems'
import { createTimeline, formatEpoch, formatLightYears, formatTime } from './timeline'
import { chapters, TOUR_DURATION } from './tour'
import { defaultViewSettings, type ViewSettings } from './view-settings'
import type { createSimulator, Telemetry } from './simulator'

function element<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T
}

const OVERVIEW_DESCRIPTION = 'Four star systems share the Sun’s corner of the Galaxy today. Press play and watch them drift apart as each follows its own orbit.'
const NORTH_DESCRIPTION = 'Seen from above its north pole, the Galaxy turns clockwise. The Sun needs about 220 million years for one lap.'

const list = element('systems-list')
const annotations = element('annotations')
const stage = element('stage')
const viewKind = element('view-kind')
const viewTitle = element('view-title')
const viewDescription = element('view-description')
const bodyKey = element('body-key')
const overview = element<HTMLButtonElement>('overview')
const labelsToggle = element<HTMLButtonElement>('labels')
const northView = element<HTMLButtonElement>('north-view')
const bloomControl = element<HTMLInputElement>('bloom')
const dustControl = element<HTMLInputElement>('dust')
const qualityControl = element<HTMLSelectElement>('render-quality')
const frameControl = element<HTMLSelectElement>('reference-frame')
const zoomControl = element<HTMLInputElement>('sky-zoom')
const skyCoordinates = element('sky-coordinates')
const photoCredit = element<HTMLAnchorElement>('photo-credit')
const panoramaCredit = element<HTMLAnchorElement>('panorama-credit')
const dataCard = element('data-card')
const panelButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-panel]')]
const panels = {
  systems: { title: 'Explore systems', element: element('panel-systems') },
  sky: { title: 'Sky atlas', element: element('panel-sky') },
  settings: { title: 'Settings', element: element('panel-settings') },
}
type Panel = keyof typeof panels
const freeMode = element<HTMLButtonElement>('free-mode')
const tourMode = element<HTMLButtonElement>('tour-mode')
const tourPanel = element('tour-panel')
const tourCaption = element('tour-caption')
const tourNote = element('tour-note')
const tourStep = element('tour-step')
const tourProgress = element('tour-progress')
const playback = element<HTMLButtonElement>('playback')
const rate = element<HTMLInputElement>('rate')
const trail = element<HTMLInputElement>('trail')
const elapsedText = element('elapsed')
const elapsedEpoch = element('elapsed-epoch')
const timeMarks = element<HTMLInputElement>('time-marks')
const timeScrubber = element<HTMLInputElement>('time-scrubber')
const fullscreen = element<HTMLButtonElement>('fullscreen')
const aboutDialog = element<HTMLDialogElement>('about-dialog')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const narrowLayout = matchMedia('(max-width: 800px)')
// Below this width the scene is too narrow to share with the data card, so the card joins the sidebar.
const compactStage = matchMedia('(max-width: 1180px)')

let paused = reducedMotion.matches
let touring = false
let tourTime = 0
let chapter = 0
let wholeSeconds = -1
let active = -1
let activeSky = -1
let openPanel: Panel = 'systems'
let showLabels = true
let viewSettings: ViewSettings = { ...defaultViewSettings }
let simulator: ReturnType<typeof createSimulator> | undefined

const cards: HTMLButtonElement[] = []
const systemLabels: Callout[] = []
const bodyLabels: Callout[][] = []
const timeLabels = Array.from({ length: 4 }, () => createCallout('', 'time'))
const armLabels = [...arms.map(arm => createCallout(arm.name, 'arm',
  arm.kind === 'Spur' ? '#9be9df' : arm.kind === 'Inner gas arm' ? '#dfb88e' : '#bcd0ff')),
  createCallout('Galactic bar', 'arm', '#f8cfa5')]
const ringLabels = RING_RADII_KPC.map(kpc => createCallout(
  `${kpc} kpc · ${formatLightYears(kpc * LY_PER_KPC)}`, 'scale', '#7fc3cf'))
const skyLabels: Callout[] = []
const skyCards: HTMLButtonElement[] = []
const timeline = createTimeline(timeScrubber, element<HTMLOutputElement>('timeline-time'), element('timeline-epoch'),
  element('timeline-ticks'), time => {
    if (!simulator) return
    stopTour()
    if (!paused) setPaused(true)
    simulator.seek(time)
  })

for (const [index, system] of systems.entries()) {
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'system-card'
  card.disabled = true
  card.dataset.sceneControl = ''
  card.setAttribute('aria-pressed', 'false')
  card.style.setProperty('--system-color', system.color)
  card.innerHTML = `
    <span class="system-art" data-system="${system.id}" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="system-text"><strong>${system.name}</strong><small>${system.kind}</small></span>
    <kbd class="card-key" aria-hidden="true">${index + 1}</kbd>
    <span class="card-arrow">${icon('arrow')}</span>
  `
  card.addEventListener('click', () => selectManually(index))
  list.append(card)
  cards.push(card)

  const label = createCallout(system.name, 'system', system.color)
  label.element.title = `Follow ${system.name}`
  label.element.addEventListener('click', () => selectManually(index))
  annotations.append(label.element)
  systemLabels.push(label)

  bodyLabels.push(system.bodies.map(body => {
    const bodyLabel = createCallout(body.name, 'body', body.color)
    annotations.append(bodyLabel.element)
    return bodyLabel
  }))
}
for (const label of [...timeLabels, ...armLabels, ...ringLabels]) annotations.append(label.element)

for (const [index, object] of skyCatalog.entries()) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'system-card sky-card'
  button.disabled = true
  button.dataset.sceneControl = ''
  button.setAttribute('aria-pressed', 'false')
  button.innerHTML = `
    <img src="${skyAsset(object.id)}" alt="" loading="lazy" width="41" height="41" />
    <span class="system-text"><strong>${object.name}</strong><small>${object.designation} · ${object.distance}</small></span>
    <span class="card-arrow">${icon('arrow')}</span>
  `
  button.addEventListener('click', () => showSky(index))
  element('catalog-list').append(button)
  skyCards.push(button)

  const label = createCallout(object.name, 'sky', '#a4d5fd')
  label.element.title = `Point the sky atlas at ${object.name}`
  label.element.addEventListener('click', () => showSky(index))
  annotations.append(label.element)
  skyLabels.push(label)
}
for (const arm of arms) {
  const row = document.createElement('li')
  row.textContent = arm.kind === 'Spur' ? `${arm.name} (Local Arm)` : arm.name
  element('arm-key').append(row)
}

mountIcons()

function setStatus(state: 'live' | 'paused' | 'unavailable', text: string) {
  element('status').dataset.state = state
  element('status-text').textContent = text
}

function showView(index: number, north = false) {
  if (activeSky >= 0 && openPanel === 'sky') setPanel('systems')
  simulator?.focus(index, true, north)
  updateView(index, north)
}

function updateView(index: number, north = false) {
  active = index
  activeSky = -1
  const system = systems[index]
  stage.classList.remove('is-sky')
  stage.classList.toggle('is-focused', Boolean(system))
  viewKind.textContent = system?.kind ?? (north ? 'Galactic north · Clockwise' : 'Galaxy overview')
  viewTitle.textContent = system?.name ?? 'Milky Way'
  viewDescription.textContent = system?.description ?? (north ? NORTH_DESCRIPTION : OVERVIEW_DESCRIPTION)
  bodyKey.hidden = !system || !showLabels
  bodyKey.innerHTML = system?.bodies.map(body =>
    `<span><i style="--body-color:${body.color}"></i>${body.name}</span>`).join('') ?? ''
  for (let i = 0; i < cards.length; i++) cards[i].setAttribute('aria-pressed', String(index === i))
  overview.classList.toggle('is-current', index < 0 && !north)
  northView.classList.toggle('is-current', north)
  skyCoordinates.hidden = true
  element('sky-zoom-field').hidden = true
  element('timeline').hidden = !stage.classList.contains('is-live')
  for (const card of skyCards) card.setAttribute('aria-pressed', 'false')
  showData(index)
  updatePresentation()
}

function showData(index: number) {
  const system = systems[index]
  dataCard.hidden = !system || !simulator
  if (!system) return
  element('data-name').textContent = system.name
  element('fact-list').innerHTML = system.facts.map(fact =>
    `<div><dt>${fact.label}</dt><dd>${fact.value}</dd></div>`).join('')
  element('live-separation-row').hidden = index === 0
  for (const id of ['live-radius', 'live-height', 'live-speed', 'live-separation']) element(id).textContent = '–'
}

function showTelemetry({ radius, height, speed, separation }: Telemetry) {
  const side = height < 0 ? 'south' : 'north'
  element('live-radius').textContent = formatLightYears(radius)
  element('live-height').textContent = `${formatLightYears(Math.abs(height))} ${side}`
  element('live-speed').textContent = `${speed.toFixed(0)} km/s`
  element('live-separation').textContent = formatLightYears(separation)
}

function placeDataCard() {
  const home = compactStage.matches ? element('data-slot') : stage
  if (dataCard.parentElement !== home) home.append(dataCard)
}

function setPanel(panel: Panel) {
  openPanel = panel
  for (const [name, item] of Object.entries(panels)) item.element.hidden = name !== panel
  for (const button of panelButtons) button.setAttribute('aria-pressed', String(button.dataset.panel === panel))
  element('panel-title').textContent = panels[panel].title
}

function showSky(index: number) {
  if (!simulator) return
  stopTour()
  setPanel('sky')
  active = -1
  activeSky = index
  simulator.focusSky(index)
  stage.classList.remove('is-focused')
  stage.classList.add('is-sky')
  const object = skyCatalog[index]
  const { l, b } = galacticCoordinates(object.ra, object.dec)
  viewKind.textContent = `Sky atlas · ${object.designation}`
  viewTitle.textContent = object.name
  viewDescription.textContent = `${object.kind} · ${object.distance}`
  const latitude = b.toFixed(2).replace('-', '−')
  skyCoordinates.textContent = `Galactic longitude ${l.toFixed(2)}° · latitude ${latitude}°`
  skyCoordinates.hidden = false
  bodyKey.hidden = true
  dataCard.hidden = true
  element('marks-control').hidden = true
  element('timeline').hidden = true
  element('sky-zoom-field').hidden = false
  overview.classList.remove('is-current')
  northView.classList.remove('is-current')
  for (const card of cards) card.setAttribute('aria-pressed', 'false')
  for (let i = 0; i < skyCards.length; i++) skyCards[i].setAttribute('aria-pressed', String(i === index))
  displaySkyZoom(object.fieldOfView)
  updatePresentation()
  if (narrowLayout.matches) {
    stage.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' })
  }
}

function displaySkyZoom(value: number) {
  zoomControl.valueAsNumber = value
  setRange(zoomControl, 'sky-zoom-value', '°')
}

function updatePresentation() {
  simulator?.setViewSettings(viewSettings)
  element('marks-control').hidden = active < 0 || viewSettings.frame === 'system' || !viewSettings.trails
  panoramaCredit.hidden = activeSky < 0 || !viewSettings.survey
  photoCredit.hidden = activeSky < 0 || !viewSettings.photographs
  if (!photoCredit.hidden) {
    const object = skyCatalog[activeSky]
    photoCredit.href = object.source
    photoCredit.textContent = `Telescope image, enlarged · ${object.band} · ${object.credit}`
  }
  element('image-credits').hidden = panoramaCredit.hidden && photoCredit.hidden
}

function stopTour() {
  touring = false
  tourPanel.hidden = true
  freeMode.setAttribute('aria-pressed', 'true')
  tourMode.setAttribute('aria-pressed', 'false')
}

function showChapter(index: number) {
  const next = chapters[index]
  chapter = index
  tourCaption.textContent = next.title
  tourNote.textContent = next.note
  tourStep.textContent = `${index + 1} / ${chapters.length}`
  if (activeSky >= 0 || active !== next.system || northView.classList.contains('is-current')) showView(next.system)
}

function startTour() {
  if (touring || !simulator) return
  touring = true
  tourTime = 0
  tourProgress.style.transform = 'scaleX(0)'
  tourPanel.hidden = false
  freeMode.setAttribute('aria-pressed', 'false')
  tourMode.setAttribute('aria-pressed', 'true')
  if (paused && !reducedMotion.matches) setPaused(false)
  showChapter(0)
}

function selectManually(index: number) {
  if (!simulator) return
  stopTour()
  showView(index)
}

function displayTime(time: number) {
  wholeSeconds = Math.floor(time)
  elapsedText.textContent = formatTime(time)
  elapsedEpoch.textContent = formatEpoch(wholeSeconds)
}

function onFrame(time: number, delta: number) {
  if (Math.floor(time) !== wholeSeconds) displayTime(time)
  timeline.update(time, !paused)
  // A pause holds the tour too. With reduced motion the scene starts paused, and the tour still steps through its views.
  if (touring && !aboutDialog.open && (!paused || reducedMotion.matches)) {
    tourTime = (tourTime + delta) % TOUR_DURATION
    const upcoming = chapters.findIndex(next => next.time > tourTime)
    const index = upcoming < 0 ? chapters.length - 1 : upcoming - 1
    if (index !== chapter) showChapter(index)
    tourProgress.style.transform = `scaleX(${tourTime / TOUR_DURATION})`
  }
}

function setPaused(value: boolean) {
  paused = value
  simulator?.setPaused(paused)
  playback.innerHTML = `<span>${icon(paused ? 'play' : 'pause')}</span><span>${paused ? 'Resume simulation' : 'Pause simulation'}</span>`
  playback.title = paused ? 'Resume simulation (Space)' : 'Pause simulation (Space)'
  if (simulator) setStatus(paused ? 'paused' : 'live', paused ? 'Simulation paused' : 'Simulation live')
}

function setRange(input: HTMLInputElement, output: string, unit: string) {
  const value = input.valueAsNumber
  const progress = (value - Number(input.min)) / (Number(input.max) - Number(input.min))
  input.style.setProperty('--range-progress', `${progress * 100}%`)
  element<HTMLOutputElement>(output).value = `${value}${unit}`
  input.setAttribute('aria-valuetext', output === 'rate-value' ? `${value} times speed` : `${value}${unit}`)
  return value
}

function applyRate() {
  const value = setRange(rate, 'rate-value', '×')
  simulator?.setRate(value)
}

function applyTrail() {
  const value = setRange(trail, 'trail-value', ' s')
  simulator?.setTrail(value)
}

function toggleLabels() {
  showLabels = !showLabels
  labelsToggle.setAttribute('aria-pressed', String(showLabels))
  simulator?.setLabels(showLabels)
  bodyKey.hidden = active < 0 || !showLabels
}

function showNorth() {
  if (!simulator) return
  stopTour()
  showView(-1, true)
}

function reset() {
  stopTour()
  rate.value = rate.defaultValue
  trail.value = trail.defaultValue
  applyRate()
  applyTrail()
  setPaused(reducedMotion.matches)
  simulator?.reset()
  if (activeSky >= 0) setPanel('systems')
  updateView(-1)
  displayTime(0)
  timeline.reset()
}

function unavailable(message: string) {
  simulator = undefined
  stopTour()
  stage.classList.remove('is-live')
  stage.classList.add('is-fallback')
  element('timeline').hidden = true
  element('fps-counter').hidden = true
  element('image-credits').hidden = true
  dataCard.hidden = true
  for (const annotation of annotations.children) (annotation as HTMLElement).hidden = true
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('[data-scene-control]')) {
    control.disabled = true
  }
  element('scene-notice').hidden = false
  element('scene-notice-text').textContent = message
  setStatus('unavailable', 'Static preview')
}

rate.addEventListener('input', applyRate)
trail.addEventListener('input', applyTrail)
for (const button of panelButtons) button.addEventListener('click', () => setPanel(button.dataset.panel as Panel))
for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting]')) {
  input.addEventListener('change', () => {
    viewSettings = { ...viewSettings, [input.dataset.setting!]: input.checked }
    updatePresentation()
  })
}
bloomControl.addEventListener('input', () => {
  viewSettings = { ...viewSettings, bloom: setRange(bloomControl, 'bloom-value', '%') }
  updatePresentation()
})
dustControl.addEventListener('input', () => {
  viewSettings = { ...viewSettings, dust: setRange(dustControl, 'dust-value', '%') }
  updatePresentation()
})
qualityControl.addEventListener('change', () => {
  viewSettings = { ...viewSettings, quality: qualityControl.value as ViewSettings['quality'] }
  updatePresentation()
})
frameControl.addEventListener('change', () => {
  viewSettings = { ...viewSettings, frame: frameControl.value as ViewSettings['frame'] }
  updatePresentation()
})
zoomControl.addEventListener('input', () => simulator?.setSkyZoom(zoomControl.valueAsNumber))
playback.addEventListener('click', () => setPaused(!paused))
element('reset').addEventListener('click', reset)
overview.addEventListener('click', () => selectManually(-1))
labelsToggle.addEventListener('click', toggleLabels)
timeMarks.addEventListener('change', () => simulator?.setTimeMarks(timeMarks.checked))
northView.addEventListener('click', showNorth)
freeMode.addEventListener('click', stopTour)
tourMode.addEventListener('click', startTour)
element('about').addEventListener('click', () => aboutDialog.showModal())
aboutDialog.addEventListener('click', (event) => {
  if (event.target === aboutDialog) aboutDialog.close()
})
compactStage.addEventListener('change', placeDataCard)

fullscreen.hidden = !document.fullscreenEnabled
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch (error) {
    console.info('Fullscreen is unavailable.', error)
  }
})
document.addEventListener('fullscreenchange', () => {
  const expanded = Boolean(document.fullscreenElement)
  fullscreen.innerHTML = icon(expanded ? 'collapse' : 'expand')
  const label = expanded ? 'Exit fullscreen' : 'Enter fullscreen'
  fullscreen.title = label
  fullscreen.setAttribute('aria-label', label)
})

const shortcuts: Record<string, () => void> = {
  g: () => selectManually(-1),
  n: showNorth,
  l: toggleLabels,
  t: () => (touring ? stopTour() : startTour()),
  ...Object.fromEntries(systems.map((_, index) => [String(index + 1), () => selectManually(index)])),
}

document.addEventListener('keydown', (event) => {
  if (aboutDialog.open || !simulator || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
  const target = event.target instanceof HTMLElement ? event.target : undefined
  // Typing into a field or picking from a menu keeps every key. Space also keeps its meaning on any control.
  if (target?.closest('textarea, select, [contenteditable], input:not([type="range"], [type="checkbox"])')) return
  if (event.code === 'Space') {
    if (target?.closest('button, a, input, summary')) return
    event.preventDefault()
    setPaused(!paused)
    return
  }
  const action = shortcuts[event.key.toLowerCase()]
  if (!action) return
  event.preventDefault()
  action()
})

setRange(rate, 'rate-value', '×')
applyTrail()
setRange(bloomControl, 'bloom-value', '%')
setRange(dustControl, 'dust-value', '%')
setPaused(paused)
placeDataCard()
viewDescription.textContent = OVERVIEW_DESCRIPTION

async function initialize() {
  try {
    const { createSimulator } = await import('./simulator')
    simulator = createSimulator({
      canvas: element<HTMLCanvasElement>('galaxy'), systemLabels, coreLabel: element('core-label'),
      bodyLabels, timeLabels, armLabels, ringLabels, skyLabels,
      obstacles: [element('stage-heading'), element('timeline'), tourPanel, dataCard, element('fps-counter'),
        element('view-controls'), element('image-credits'), northView],
      onFps: fps => { element('fps-value').textContent = String(fps) },
      onSkyZoom: displaySkyZoom,
      onTelemetry: showTelemetry,
      onFrame, onTakeover: stopTour,
      onFirstRender() {
        stage.classList.add('is-live')
        element('timeline').hidden = false
        element('fps-counter').hidden = false
        for (const control of document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('[data-scene-control]')) {
          control.disabled = false
        }
        setPaused(paused)
      },
      onContextLost() {
        unavailable('The 3D renderer lost its connection. Reload to restart the simulation.')
      },
    })
    simulator.setRate(rate.valueAsNumber)
    updateView(-1)
  } catch (error) {
    console.info('Unable to start the WebGL renderer.', error)
    unavailable('WebGL 2 is unavailable. You can still see a preview of the Milky Way.')
  }
}

void initialize()
