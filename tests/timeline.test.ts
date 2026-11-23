import { describe, expect, test } from 'vitest'
import { SimulationClock } from '../src/clock'
import { armRadius, arms, BAR_SPEED, PATTERN_SPEED } from '../src/spiral-map'
import { formatEpoch, formatLightYears, formatTime } from '../src/timeline'
import { chapters, TOUR_DURATION } from '../src/tour'
import { systems } from '../src/systems'

describe('formatTime', () => {
  test('shows minutes and seconds, with tenths on request', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(75.48)).toBe('01:15')
    expect(formatTime(75.48, true)).toBe('01:15.4')
  })

  test('marks times before the start with a minus sign', () => {
    expect(formatTime(-3)).toBe('−00:03')
  })
})

describe('formatEpoch', () => {
  test('calls the start of the clock today', () => {
    expect(formatEpoch(0)).toBe('Today')
  })

  test('counts millions of years forward and backward', () => {
    expect(formatEpoch(10)).toBe('13.6 million years from now')
    expect(formatEpoch(-10)).toBe('13.6 million years ago')
    expect(formatEpoch(165)).toBe('224 million years from now')
  })
})

describe('formatLightYears', () => {
  test('keeps decimals for nearby stars and rounds large distances', () => {
    expect(formatLightYears(4.344)).toBe('4.34 ly')
    expect(formatLightYears(328.4)).toBe('328 ly')
    expect(formatLightYears(26581.7)).toBe('26,580 ly')
  })
})

describe('SimulationClock', () => {
  test('advances by the elapsed time multiplied by the rate', () => {
    const clock = new SimulationClock()
    for (let frame = 0; frame < 60; frame++) clock.advance(1 / 60, 2)
    expect(clock.time).toBeCloseTo(2, 9)
  })

  test('caps a long frame so a stalled tab cannot jump ahead', () => {
    const clock = new SimulationClock()
    clock.advance(5, 1)
    expect(clock.time).toBeCloseTo(0.05, 9)
  })

  test('seeks to any time, including before the start, and resets to zero', () => {
    const clock = new SimulationClock()
    clock.seek(-12.34)
    expect(clock.time).toBeCloseTo(-12.34, 9)
    clock.reset()
    expect(clock.time).toBe(0)
  })
})

describe('spiral map', () => {
  test('each arm passes through its fitted radius at its kink', () => {
    for (const arm of arms) {
      const kink = Math.min(arm.measured[1], Math.max(arm.measured[0], arm.kink))
      if (kink === arm.kink) expect(armRadius(arm, arm.kink)).toBeCloseTo(arm.radius, 9)
    }
  })

  test('trailing arms move outward against the direction of rotation', () => {
    const perseus = arms.find(arm => arm.name === 'Perseus Arm')!
    expect(armRadius(perseus, -20)).toBeGreaterThan(armRadius(perseus, 100))
  })

  test('the bar turns faster than the spiral pattern, which nearly keeps pace with the Sun', () => {
    expect(BAR_SPEED).toBeGreaterThan(PATTERN_SPEED)
    expect(PATTERN_SPEED / systems[0].path.rate).toBeGreaterThan(0.9)
    expect(PATTERN_SPEED / systems[0].path.rate).toBeLessThan(1.1)
  })
})

describe('guided tour', () => {
  test('chapters run in order, fit inside the tour, and point at real systems', () => {
    chapters.forEach((chapter, index) => {
      if (index > 0) expect(chapter.time).toBeGreaterThan(chapters[index - 1].time)
      expect(chapter.time).toBeLessThan(TOUR_DURATION)
      expect(chapter.system).toBeGreaterThanOrEqual(-1)
      expect(chapter.system).toBeLessThan(systems.length)
    })
    expect(chapters[0].time).toBe(0)
  })
})
