import { describe, expect, test } from 'vitest'
import { approach, SHOT_SECONDS, shotAt, SHOTS, smootherstep } from '../src/cinematic'

describe('shotAt', () => {
  test('opens on the establishing shot and moves to the next one after each interval', () => {
    expect(shotAt(0)).toBe(SHOTS[0])
    expect(shotAt(SHOT_SECONDS - 0.01)).toBe(SHOTS[0])
    expect(shotAt(SHOT_SECONDS)).toBe(SHOTS[1])
  })

  test('cycles through every shot and wraps around', () => {
    expect(shotAt(SHOT_SECONDS * SHOTS.length)).toBe(SHOTS[0])
    expect(shotAt(-1)).toBe(SHOTS[SHOTS.length - 1])
  })

  test('keeps every shot inside the orbit controls limits', () => {
    for (const shot of SHOTS) {
      expect(shot.polar).toBeGreaterThan(0.07)
      expect(shot.polar).toBeLessThan(Math.PI - 0.07)
      expect(shot.distance).toBeGreaterThan(0.4)
      expect(Math.abs(shot.drift)).toBeLessThan(0.1)
    }
  })

  test('shows the systems from above, along the disk and from below', () => {
    expect(SHOTS.some(shot => shot.polar < 0.5)).toBe(true)
    expect(SHOTS.some(shot => Math.abs(shot.polar - Math.PI / 2) < 0.2)).toBe(true)
    expect(SHOTS.some(shot => shot.polar > Math.PI / 2 + 0.2)).toBe(true)
  })
})

describe('approach and smootherstep', () => {
  test('approach moves part of the way and never overshoots', () => {
    const next = approach(0, 10, 0.5, 1)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(10)
    expect(approach(0, 10, 0.5, 0)).toBe(0)
    expect(approach(0, 10, 0.5, 1e6)).toBeCloseTo(10)
  })

  test('smootherstep starts and ends flat', () => {
    expect(smootherstep(0)).toBe(0)
    expect(smootherstep(0.5)).toBeCloseTo(0.5)
    expect(smootherstep(1)).toBe(1)
    expect(smootherstep(0.02)).toBeLessThan(0.001)
    expect(smootherstep(1.5)).toBe(1)
  })
})
