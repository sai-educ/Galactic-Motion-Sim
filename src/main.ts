import './style.css'
import { LY_PER_KPC } from './astro'
import { createCallout, type Callout } from './callouts'
import { icon, mountIcons } from './icons'
import { NEIGHBOR_GROUPS } from './neighbors'
import { skyCatalog } from './sky-catalog'
import { createSoundtrack } from './soundtrack'
import { arms, RING_RADII_KPC } from './spiral-map'
import { systems, type System } from './systems'
import { formatEpoch, formatLightYears, formatTime } from './timeline'
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
const dataCard = element('data-card')
const panelButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-panel]')]
const listButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-list]')]
const panels = {
  systems: { title: 'Explore systems', element: element('panel-systems') },
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
const fullscreen = element<HTMLButtonElement>('fullscreen')
const musicToggle = element<HTMLButtonElement>('music')
const aboutDialog = element<HTMLDialogElement>('about-dialog')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
// Below this width the scene is too narrow to share with the data card, so the card joins the sidebar.
const compactStage = matchMedia('(max-width: 1180px)')
const MUSIC_PREFERENCE = 'galactic-motion:music'
const audioAsset = (name: string) => `${import.meta.env.BASE_URL}audio/${name}.mp3`
const soundtrack = createSoundtrack({
  // Only the featured systems have themes. The neighboring stars are visited in silence.
  themes: systems.filter(system => !system.neighbor).map(system => audioAsset(system.id)),
  zooms: [audioAsset('zoom-1'), audioAsset('zoom-2')],
})

let paused = reducedMotion.matches
let touring = false
let tourTime = 0
let chapter = 0
let wholeSeconds = -1
let active = -1
let showLabels = true
let viewSettings: ViewSettings = { ...defaultViewSettings }
let simulator: ReturnType<typeof createSimulator> | undefined

/** The button that selects each system: a card for a featured system, a chip for a neighboring star. */
const cards: HTMLButtonElement[] = []
const systemLabels: Callout[] = []
const bodyLabels: Callout[][] = []
const armLabels = [...arms.map(arm => createCallout(arm.name, 'arm',
  arm.kind === 'Spur' ? '#9be9df' : arm.kind === 'Inner gas arm' ? '#dfb88e' : '#bcd0ff')),
  createCallout('Galactic bar', 'arm', '#f8cfa5')]
const ringLabels = RING_RADII_KPC.map(kpc => createCallout(
  `${kpc} kpc · ${formatLightYears(kpc * LY_PER_KPC)}`, 'scale', '#7fc3cf'))
const skyLabels = skyCatalog.map(object => createCallout(object.name, 'sky', '#a4d5fd'))

const neighborRows = new Map(NEIGHBOR_GROUPS.map(group => {
  const section = document.createElement('div')
  section.className = 'neighbor-group'
  const idea = document.createElement('p')
  idea.className = 'neighbor-idea'
  idea.innerHTML = `<strong>${group.title}</strong> ${group.idea}`
  const row = document.createElement('div')
  row.className = 'neighbor-chips'
  section.append(idea, row)
  element('neighbors-list').append(section)
  return [group.id, row]
}))

function selector(system: System, index: number) {
  const button = document.createElement('button')
  button.type = 'button'
  button.disabled = true
  button.dataset.sceneControl = ''
  button.setAttribute('aria-pressed', 'false')
  button.style.setProperty('--system-color', system.color)
  button.addEventListener('click', () => selectManually(index))
  if (system.neighbor) {
    button.className = 'neighbor-chip'
    button.title = system.description
    button.innerHTML = `<i aria-hidden="true"></i>${system.name}`
    neighborRows.get(system.neighbor.group)?.append(button)
    return button
  }
  button.className = 'system-card'
  button.innerHTML = `
    <span class="system-art" data-system="${system.id}" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="system-text"><strong>${system.name}</strong><small>${system.kind}</small></span>
    <kbd class="card-key" aria-hidden="true">${index + 1}</kbd>
    <span class="card-arrow">${icon('arrow')}</span>
  `
  list.append(button)
  return button
}

for (const [index, system] of systems.entries()) {
  cards.push(selector(system, index))

  const label = createCallout(system.name, system.neighbor ? 'neighbor' : 'system', system.color)
  label.element.title = system.neighbor ? `${system.name}: ${system.description}` : `Follow ${system.name}`
  label.element.addEventListener('click', () => selectManually(index))
  annotations.append(label.element)
  systemLabels.push(label)

  bodyLabels.push(system.bodies.map(body => {
    const bodyLabel = createCallout(body.name, 'body', body.color)
    annotations.append(bodyLabel.element)
    return bodyLabel
  }))
}
for (const label of [...armLabels, ...ringLabels, ...skyLabels]) annotations.append(label.element)

mountIcons()

function setStatus(state: 'live' | 'paused' | 'unavailable', text: string) {
  element('status').dataset.state = state
  element('status-text').textContent = text
}

/** Swaps the Systems panel between the featured systems and the neighboring stars. */
function showList(neighbors: boolean) {
  list.hidden = neighbors
  element('neighbors-list').hidden = !neighbors
  for (const button of listButtons) button.setAttribute('aria-pressed', String((button.dataset.list === 'neighbors') === neighbors))
}

/** The theme to play for a view. Neighboring stars and the Galaxy views have none. */
const themeOf = (index: number) => systems[index]?.neighbor ? -1 : index

function showView(index: number, north = false) {
  if (simulator) soundtrack.select(themeOf(index))
  simulator?.focus(index, true, north)
  updateView(index, north)
}

function updateView(index: number, north = false) {
  active = index
  const system = systems[index]
  stage.classList.toggle('is-focused', Boolean(system))
  const group = NEIGHBOR_GROUPS.find(candidate => candidate.id === system?.neighbor?.group)
  viewKind.textContent = system
    ? (group ? `${group.title} · ${system.kind}` : system.kind)
    : (north ? 'Galactic north · Clockwise' : 'Galaxy overview')
  viewTitle.textContent = system?.name ?? 'Milky Way'
  viewDescription.textContent = system?.description ?? (north ? NORTH_DESCRIPTION : OVERVIEW_DESCRIPTION)
  bodyKey.hidden = !system || !showLabels
  bodyKey.innerHTML = system?.bodies.map(body =>
    `<span><i style="--body-color:${body.color}"></i>${body.name}</span>`).join('') ?? ''
  for (let i = 0; i < cards.length; i++) cards[i].setAttribute('aria-pressed', String(index === i))
  // Whichever star the camera follows, its entry is on show in the sidebar.
  if (system) showList(Boolean(system.neighbor))
  overview.classList.toggle('is-current', index < 0 && !north)
  northView.classList.toggle('is-current', north)
  showData(index)
  applyViewSettings()
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
  for (const [name, item] of Object.entries(panels)) item.element.hidden = name !== panel
  for (const button of panelButtons) button.setAttribute('aria-pressed', String(button.dataset.panel === panel))
  element('panel-title').textContent = panels[panel].title
}

function applyViewSettings() {
  simulator?.setViewSettings(viewSettings)
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
  if (active !== next.system || northView.classList.contains('is-current')) showView(next.system)
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
  soundtrack.setPaused(paused)
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

function readMusicPreference() {
  try {
    return localStorage.getItem(MUSIC_PREFERENCE) !== 'off'
  } catch {
    return true
  }
}

function setMusic(on: boolean, remember = true) {
  soundtrack.setMuted(!on)
  musicToggle.setAttribute('aria-pressed', String(on))
  musicToggle.innerHTML = icon(on ? 'sound' : 'muted')
  const label = on ? 'Turn music off (M)' : 'Turn music on (M)'
  musicToggle.title = label
  musicToggle.setAttribute('aria-label', label)
  if (!remember) return
  try {
    localStorage.setItem(MUSIC_PREFERENCE, on ? 'on' : 'off')
  } catch (error) {
    console.info('Unable to remember the music setting.', error)
  }
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
  soundtrack.select(-1)
  simulator?.reset()
  updateView(-1)
  displayTime(0)
}

function unavailable(message: string) {
  simulator = undefined
  stopTour()
  soundtrack.select(-1)
  stage.classList.remove('is-live')
  stage.classList.add('is-fallback')
  element('fps-counter').hidden = true
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
for (const button of listButtons) button.addEventListener('click', () => showList(button.dataset.list === 'neighbors'))
for (const input of document.querySelectorAll<HTMLInputElement>('[data-setting]')) {
  input.addEventListener('change', () => {
    viewSettings = { ...viewSettings, [input.dataset.setting!]: input.checked }
    applyViewSettings()
  })
}
bloomControl.addEventListener('input', () => {
  viewSettings = { ...viewSettings, bloom: setRange(bloomControl, 'bloom-value', '%') }
  applyViewSettings()
})
dustControl.addEventListener('input', () => {
  viewSettings = { ...viewSettings, dust: setRange(dustControl, 'dust-value', '%') }
  applyViewSettings()
})
qualityControl.addEventListener('change', () => {
  viewSettings = { ...viewSettings, quality: qualityControl.value as ViewSettings['quality'] }
  applyViewSettings()
})
frameControl.addEventListener('change', () => {
  viewSettings = { ...viewSettings, frame: frameControl.value as ViewSettings['frame'] }
  applyViewSettings()
})
playback.addEventListener('click', () => setPaused(!paused))
element('reset').addEventListener('click', reset)
overview.addEventListener('click', () => selectManually(-1))
labelsToggle.addEventListener('click', toggleLabels)
northView.addEventListener('click', showNorth)
freeMode.addEventListener('click', stopTour)
tourMode.addEventListener('click', startTour)
musicToggle.addEventListener('click', () => setMusic(soundtrack.muted))
// Browsers allow sound only after a gesture, so the first click, tap or key press unlocks the audio.
for (const type of ['click', 'touchend', 'keydown']) {
  document.addEventListener(type, () => soundtrack.unlock(), { capture: true, passive: true })
}
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
  m: () => setMusic(soundtrack.muted),
  t: () => (touring ? stopTour() : startTour()),
  ...Object.fromEntries(systems.flatMap((system, index) =>
    system.neighbor ? [] : [[String(index + 1), () => selectManually(index)]])),
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
setMusic(readMusicPreference(), false)
placeDataCard()
viewDescription.textContent = OVERVIEW_DESCRIPTION

async function initialize() {
  try {
    const { createSimulator } = await import('./simulator')
    simulator = createSimulator({
      canvas: element<HTMLCanvasElement>('galaxy'), systemLabels, coreLabel: element('core-label'),
      bodyLabels, armLabels, ringLabels, skyLabels,
      obstacles: [element('stage-heading'), tourPanel, dataCard, element('fps-counter'),
        element('view-controls'), northView],
      onFps: fps => { element('fps-value').textContent = String(fps) },
      onTelemetry: showTelemetry,
      onFrame, onTakeover: stopTour,
      onFirstRender() {
        stage.classList.add('is-live')
        element('fps-counter').hidden = false
        for (const control of document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('[data-scene-control]')) {
          control.disabled = false
        }
        setPaused(paused)
      },
      onContextLost() {
        unavailable('The 3D renderer lost its connection. Reload to restart the simulation.')
      },
      onArrive: index => soundtrack.arrive(themeOf(index)),
    })
    simulator.setRate(rate.valueAsNumber)
    updateView(-1)
  } catch (error) {
    console.info('Unable to start the WebGL renderer.', error)
    unavailable('WebGL 2 is unavailable. You can still see a preview of the Milky Way.')
  }
}

void initialize()
