import { describe, expect, test } from 'vitest'
import { layerByDepth, type DepthBox } from '../src/callouts'

const box = (left: number, top: number, depth: number): DepthBox =>
  ({ left, top, right: left + 60, bottom: top + 19, depth })

describe('layerByDepth', () => {
  test('leaves tags that do not touch clear', () => {
    expect(layerByDepth([box(0, 0, 0.5), box(200, 0, 0.4), box(0, 100, 0.3)])).toEqual(['clear', 'clear', 'clear'])
  })

  test('dims the farther of two overlapping tags and brightens the nearer one', () => {
    expect(layerByDepth([box(0, 0, 0.9), box(20, 5, 0.2)])).toEqual(['behind', 'front'])
    expect(layerByDepth([box(0, 0, 0.2), box(20, 5, 0.9)])).toEqual(['front', 'behind'])
  })

  test('dims a tag that sits behind a nearer one even if it covers a farther one', () => {
    expect(layerByDepth([box(0, 0, 0.1), box(30, 0, 0.5), box(60, 0, 0.9)])).toEqual(['front', 'behind', 'behind'])
  })

  test('breaks a depth tie by order, so exactly one tag stays bright', () => {
    expect(layerByDepth([box(0, 0, 0.5), box(10, 0, 0.5)])).toEqual(['front', 'behind'])
  })

  test('treats boxes that only share an edge as separate', () => {
    expect(layerByDepth([box(0, 0, 0.5), box(60, 0, 0.1)])).toEqual(['clear', 'clear'])
  })
})
