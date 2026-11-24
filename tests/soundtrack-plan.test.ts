import { describe, expect, test } from 'vitest'
import { easeInOut, levelAt, pickWithoutRepeat, reduceMusic, SILENT, type MusicState } from '../src/soundtrack-plan'

function sequence(...values: number[]) {
  let index = 0
  return () => values[index++ % values.length]
}

describe('pickWithoutRepeat', () => {
  test('picks any track when there is no previous one', () => {
    expect(pickWithoutRepeat(2, -1, () => 0)).toBe(0)
    expect(pickWithoutRepeat(2, -1, () => 0.99)).toBe(1)
  })

  test('never repeats the previous track', () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(pickWithoutRepeat(2, 0, () => roll)).toBe(1)
      expect(pickWithoutRepeat(2, 1, () => roll)).toBe(0)
      expect(pickWithoutRepeat(3, 1, () => roll)).not.toBe(1)
    }
  })

  test('reaches every other track among three', () => {
    const picks = new Set([0, 0.6].map(roll => pickWithoutRepeat(3, 0, () => roll)))
    expect(picks).toEqual(new Set([1, 2]))
  })

  test('keeps the only track and rejects an empty list', () => {
    expect(pickWithoutRepeat(1, 0, sequence(0.5))).toBe(0)
    expect(() => pickWithoutRepeat(0, -1)).toThrow(RangeError)
  })
})

describe('easeInOut and levelAt', () => {
  test('eases from 0 to 1 with a midpoint of one half', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(-1)).toBe(0)
    expect(easeInOut(2)).toBe(1)
  })

  test('follows a fade and holds its end level afterwards', () => {
    const fade = { from: 0.2, to: 0.6, start: 10, duration: 4 }
    expect(levelAt(fade, 9)).toBeCloseTo(0.2)
    expect(levelAt(fade, 12)).toBeCloseTo(0.4)
    expect(levelAt(fade, 20)).toBeCloseTo(0.6)
    expect(levelAt({ ...fade, duration: 0 }, 10)).toBe(0.6)
  })
})

describe('reduceMusic', () => {
  const play = (state: MusicState, ...events: Parameters<typeof reduceMusic>[1][]) =>
    events.reduce((result, event) => {
      const next = reduceMusic(result.state, event)
      return { state: next.state, actions: [...result.actions, ...next.actions] }
    }, { state, actions: [] as string[] })

  test('plays a zoom swell when a system is chosen from silence, then its theme on arrival', () => {
    const chosen = reduceMusic(SILENT, { type: 'select', system: 2 })
    expect(chosen.actions).toEqual(['zoom'])
    expect(chosen.state).toEqual({ playing: -1, pending: 2 })
    const arrived = reduceMusic(chosen.state, { type: 'arrive', system: 2 })
    expect(arrived.actions).toEqual(['theme'])
    expect(arrived.state).toEqual({ playing: 2, pending: -1 })
  })

  test('keeps the current theme while flying to another system, then crossfades without a zoom', () => {
    const result = play({ playing: 0, pending: -1 },
      { type: 'select', system: 3 }, { type: 'arrive', system: 3 })
    expect(result.actions).toEqual(['crossfade'])
    expect(result.state).toEqual({ playing: 3, pending: -1 })
  })

  test('does not play a second zoom when the choice changes mid-flight', () => {
    const result = play(SILENT,
      { type: 'select', system: 1 }, { type: 'select', system: 2 }, { type: 'arrive', system: 2 })
    expect(result.actions).toEqual(['zoom', 'theme'])
    expect(result.state.playing).toBe(2)
  })

  test('ignores an arrival at a system that is no longer the destination', () => {
    const result = play(SILENT, { type: 'select', system: 1 }, { type: 'select', system: 2 }, { type: 'arrive', system: 1 })
    expect(result.actions).toEqual(['zoom'])
    expect(result.state).toEqual({ playing: -1, pending: 2 })
  })

  test('changes nothing when the playing system is chosen again', () => {
    const result = play({ playing: 1, pending: -1 }, { type: 'select', system: 1 }, { type: 'arrive', system: 1 })
    expect(result.actions).toEqual([])
    expect(result.state).toEqual({ playing: 1, pending: -1 })
  })

  test('fades out when leaving the systems, and zooms again on the next visit', () => {
    const result = play({ playing: 1, pending: -1 },
      { type: 'select', system: -1 }, { type: 'select', system: -1 }, { type: 'select', system: 0 })
    expect(result.actions).toEqual(['fade-out', 'zoom'])
    expect(result.state).toEqual({ playing: -1, pending: 0 })
  })
})
