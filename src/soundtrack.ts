import { easeInOut, levelAt, pickWithoutRepeat, reduceMusic, SILENT, type Fade, type MusicAction, type MusicEvent } from './soundtrack-plan'

export interface SoundtrackTracks {
  /** One looping theme per system, in the order of `systems`. */
  readonly themes: readonly string[]
  /** Short swells, one of which plays while the camera flies in from outside the systems. */
  readonly zooms: readonly string[]
}

interface Channel {
  readonly element: HTMLAudioElement
  readonly source: MediaElementAudioSourceNode
}

interface Voice {
  readonly channel: Channel
  readonly gain: GainNode
  readonly timers: number[]
  fade: Fade
  released: boolean
  looping: boolean
}

// Each media element must be unlocked by a user gesture on some browsers, so a small pool is made once and reused.
const POOL_SIZE = 8
const THEME_LEVEL = 0.55
const ZOOM_LEVEL = 0.8
const ZOOM_ATTACK = 0.05
const ZOOM_RELEASE = 2.5
const THEME_FADE_IN = 4.5
const SWITCH_FADE_OUT = 5
const SWITCH_DELAY = 1.5
const SWITCH_FADE_IN = 5
const LEAVE_FADE = 3.5
// The next pass of a theme starts this many seconds before the end, so the loop has no gap.
const LOOP_OVERLAP = 8
const LOOP_FADE = 6
const MUTE_FADE = 0.8
const CURVE_POINTS = 48

function fadeCurve(from: number, to: number) {
  return Float32Array.from({ length: CURVE_POINTS }, (_, index) =>
    from + (to - from) * easeInOut(index / (CURVE_POINTS - 1)))
}

export function createSoundtrack(tracks: SoundtrackTracks) {
  let context: AudioContext | undefined
  let master: GainNode | undefined
  const idle: Channel[] = []
  const stopping = new Set<Voice>()
  let state = SILENT
  let theme: Voice | undefined
  let zoom: Voice | undefined
  let lastZoom = -1
  let muted = false

  /** Call from a user gesture. Creates the audio graph once and resumes it after interruptions. */
  function unlock() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(error => console.info('Unable to resume audio.', error))
      return
    }
    if (typeof AudioContext === 'undefined') return
    context = new AudioContext()
    master = context.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(context.destination)
    for (let index = 0; index < POOL_SIZE; index++) {
      const element = new Audio()
      element.preload = 'auto'
      element.load()
      idle.push({ element, source: context.createMediaElementSource(element) })
    }
  }

  function acquire() {
    if (idle.length === 0) {
      // Every channel is busy: cut short the sound that has been fading out the longest.
      const oldest = stopping.values().next().value
      if (oldest) release(oldest)
    }
    return idle.pop()
  }

  function release(voice: Voice) {
    if (voice.released) return
    voice.released = true
    for (const timer of voice.timers) clearTimeout(timer)
    const { element, source } = voice.channel
    element.ontimeupdate = null
    element.onended = null
    element.onerror = null
    element.pause()
    element.removeAttribute('src')
    element.load()
    source.disconnect()
    voice.gain.disconnect()
    stopping.delete(voice)
    idle.push(voice.channel)
  }

  function fadeVoice(voice: Voice, to: number, seconds: number) {
    if (!context || voice.released) return
    const now = context.currentTime
    const from = levelAt(voice.fade, now)
    voice.fade = { from, to, start: now, duration: seconds }
    const param = voice.gain.gain
    param.cancelScheduledValues(now)
    if (seconds <= 0) {
      param.setValueAtTime(to, now)
      return
    }
    try {
      param.setValueCurveAtTime(fadeCurve(from, to), now, seconds)
    } catch (error) {
      console.info('Using a linear fade instead of a curve.', error)
      param.setValueAtTime(from, now)
      param.linearRampToValueAtTime(to, now + seconds)
    }
  }

  function stopVoice(voice: Voice | undefined, seconds: number) {
    if (!voice || voice.released) return
    fadeVoice(voice, 0, seconds)
    stopping.add(voice)
    voice.timers.push(window.setTimeout(() => release(voice), (seconds + 0.2) * 1000))
  }

  function startVoice(url: string, level: number, fadeSeconds: number, delay: number): Voice | undefined {
    if (!context || !master) return undefined
    const channel = acquire()
    if (!channel) return undefined
    const gain = context.createGain()
    gain.gain.value = 0
    channel.source.connect(gain).connect(master)
    const voice: Voice = {
      channel, gain, timers: [], released: false, looping: false,
      fade: { from: 0, to: 0, start: context.currentTime, duration: 0 },
    }
    const { element } = channel
    element.src = url
    element.onended = () => release(voice)
    element.onerror = () => {
      console.info(`Unable to load ${url}.`, element.error)
      release(voice)
    }
    const begin = () => {
      // A theme waiting out its delay may already have been cancelled by a newer choice.
      if (voice.released || stopping.has(voice)) return
      element.play().catch(error => {
        console.info(`Unable to play ${url}.`, error)
        release(voice)
      })
      fadeVoice(voice, level, fadeSeconds)
    }
    if (delay > 0) voice.timers.push(window.setTimeout(begin, delay * 1000))
    else begin()
    return voice
  }

  function startTheme(system: number, fadeSeconds: number, delay: number): Voice | undefined {
    const url = tracks.themes[system]
    if (!url) return undefined
    const voice = startVoice(url, THEME_LEVEL, fadeSeconds, delay)
    if (!voice) return undefined
    const { element } = voice.channel
    element.ontimeupdate = () => {
      if (voice.looping || !Number.isFinite(element.duration) || element.currentTime < element.duration - LOOP_OVERLAP) return
      voice.looping = true
      if (theme !== voice) return
      stopVoice(voice, LOOP_FADE)
      theme = startTheme(system, LOOP_FADE, 0)
    }
    return voice
  }

  function playZoom() {
    if (tracks.zooms.length === 0) return
    lastZoom = pickWithoutRepeat(tracks.zooms.length, lastZoom)
    stopVoice(zoom, ZOOM_ATTACK)
    zoom = startVoice(tracks.zooms[lastZoom], ZOOM_LEVEL, ZOOM_ATTACK, 0)
  }

  function apply(action: MusicAction) {
    if (action === 'fade-out') {
      stopVoice(zoom, ZOOM_RELEASE)
      stopVoice(theme, LEAVE_FADE)
      zoom = theme = undefined
    } else if (muted) {
      return
    } else if (action === 'zoom') {
      playZoom()
    } else if (action === 'theme') {
      stopVoice(zoom, ZOOM_RELEASE)
      zoom = undefined
      theme = startTheme(state.playing, THEME_FADE_IN, 0)
    } else {
      stopVoice(zoom, ZOOM_RELEASE)
      stopVoice(theme, SWITCH_FADE_OUT)
      zoom = undefined
      theme = startTheme(state.playing, SWITCH_FADE_IN, SWITCH_DELAY)
    }
  }

  /** Mute acts on the whole mix, so swells and themes that are already fading out go quiet too. */
  function setMasterLevel(level: number) {
    if (!context || !master) return
    const now = context.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setTargetAtTime(level, now, MUTE_FADE / 4)
  }

  function dispatch(event: MusicEvent) {
    const result = reduceMusic(state, event)
    state = result.state
    for (const action of result.actions) apply(action)
  }

  return {
    unlock,
    /** A system was chosen (-1 for any view outside the systems). Call from the gesture that chose it. */
    select(system: number) {
      unlock()
      dispatch({ type: 'select', system })
    },
    /** The camera finished flying to a system. */
    arrive(system: number) {
      dispatch({ type: 'arrive', system })
    },
    get muted() { return muted },
    setMuted(value: boolean) {
      if (value === muted) return
      muted = value
      if (muted) {
        setMasterLevel(0)
        stopVoice(zoom, MUTE_FADE)
        stopVoice(theme, MUTE_FADE)
        zoom = theme = undefined
        return
      }
      unlock()
      setMasterLevel(1)
      if (state.playing >= 0) theme = startTheme(state.playing, THEME_FADE_IN, 0)
    },
  }
}
